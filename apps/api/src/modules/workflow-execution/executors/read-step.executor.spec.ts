import { jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExecutableWorkflowStep,
  WorkflowExecutionContext,
} from '../contracts';
import { StepExecutionError } from '../errors/workflow-execution.errors';
import { ReadStepExecutor } from './read-step.executor';

const TABLE = 'heartbeat_events';

function buildStep(
  overrides: Partial<ExecutableWorkflowStep<'read'>['configuration']> = {},
): ExecutableWorkflowStep<'read'> {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    stepKey: 'read_records',
    type: 'read',
    position: 0,
    configuration: { table: TABLE, columns: '*', ...overrides },
  };
}

function buildContext(fromMock: jest.Mock): WorkflowExecutionContext {
  const supabase = { from: fromMock } as unknown as SupabaseClient;
  return {
    project: { id: 'project-1', supabaseUrl: 'https://example.supabase.co' },
    workflow: { id: 'workflow-1' },
    supabase,
  };
}

/** A select-query double supporting `await` directly (a bare thenable
 * response) and `.limit()` chaining, matching the real PostgREST
 * builder's dual nature (awaitable, and further chainable). */
function buildSelectResult(response: { data: unknown; error: unknown }) {
  const limit = jest.fn(() => Promise.resolve(response));
  const result = {
    then: (resolve: (value: typeof response) => void) => resolve(response),
    limit,
  };
  return { result, limit };
}

describe('ReadStepExecutor', () => {
  let executor: ReadStepExecutor;

  beforeEach(() => {
    executor = new ReadStepExecutor();
  });

  it('has the canonical "read" type', () => {
    expect(executor.type).toBe('read');
  });

  it('calls the correct table', async () => {
    const { result } = buildSelectResult({ data: [], error: null });
    const select = jest.fn(() => result);
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(fromMock).toHaveBeenCalledWith(TABLE);
  });

  it('applies validated columns', async () => {
    const { result } = buildSelectResult({ data: [], error: null });
    const select = jest.fn(() => result);
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep({ columns: 'id,name' }));

    expect(select).toHaveBeenCalledWith('id,name');
  });

  it('applies limit when present', async () => {
    const { result, limit } = buildSelectResult({ data: [], error: null });
    const select = jest.fn(() => result);
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep({ limit: 5 }));

    expect(limit).toHaveBeenCalledWith(5);
  });

  it('omits limit when absent', async () => {
    const { result, limit } = buildSelectResult({ data: [], error: null });
    const select = jest.fn(() => result);
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(limit).not.toHaveBeenCalled();
  });

  it('returns { rows: [], count: 0 } for an empty result', async () => {
    const { result } = buildSelectResult({ data: [], error: null });
    const select = jest.fn(() => result);
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);

    const output = await executor.execute(context, buildStep());

    expect(output).toEqual({ output: { rows: [], count: 0 } });
  });

  it('preserves returned row order', async () => {
    const rows = [{ id: '3' }, { id: '1' }, { id: '2' }];
    const { result } = buildSelectResult({ data: rows, error: null });
    const select = jest.fn(() => result);
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);

    const output = await executor.execute(context, buildStep());

    expect(output).toEqual({ output: { rows, count: 3 } });
  });

  it('returns stable rows/count for a non-empty result', async () => {
    const rows = [{ id: '1', name: 'a' }];
    const { result } = buildSelectResult({ data: rows, error: null });
    const select = jest.fn(() => result);
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);

    const output = await executor.execute(context, buildStep());

    expect(output).toEqual({ output: { rows, count: 1 } });
  });

  it('converts an SDK-returned error into a StepExecutionError', async () => {
    const { result } = buildSelectResult({
      data: null,
      error: {
        message: 'relation does not exist',
        details: '',
        hint: '',
        code: '42P01',
      },
    });
    const select = jest.fn(() => result);
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('converts a thrown exception into a StepExecutionError', async () => {
    const select = jest.fn(() => Promise.reject(new Error('network failure')));
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('fails safely for malformed output', async () => {
    const { result } = buildSelectResult({ data: 'not-an-array', error: null });
    const select = jest.fn(() => result);
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('does not create a new Supabase client', async () => {
    const { result } = buildSelectResult({ data: [], error: null });
    const select = jest.fn(() => result);
    const fromMock = jest.fn(() => ({ select }));
    const context = buildContext(fromMock);
    const originalSupabase = context.supabase;

    await executor.execute(context, buildStep());

    expect(context.supabase).toBe(originalSupabase);
  });
});
