import { jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExecutableWorkflowStep,
  WorkflowExecutionContext,
} from '../contracts';
import { StepExecutionError } from '../errors/workflow-execution.errors';
import { InsertStepExecutor } from './insert-step.executor';

const TABLE = 'heartbeat_events';
const VALUES = { name: 'Heartbeat', active: true };

function buildStep(
  overrides: Partial<ExecutableWorkflowStep<'insert'>['configuration']> = {},
): ExecutableWorkflowStep<'insert'> {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    stepKey: 'create_heartbeat_row',
    type: 'insert',
    position: 0,
    configuration: { table: TABLE, values: VALUES, ...overrides },
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

function buildFromMock(select: jest.Mock): {
  fromMock: jest.Mock;
  insertMock: jest.Mock;
} {
  const insertMock = jest.fn(() => ({ select }));
  const fromMock = jest.fn(() => ({ insert: insertMock }));
  return { fromMock, insertMock };
}

describe('InsertStepExecutor', () => {
  let executor: InsertStepExecutor;

  beforeEach(() => {
    executor = new InsertStepExecutor();
  });

  it('has the canonical "insert" type', () => {
    expect(executor.type).toBe('insert');
  });

  it('uses the context client via from()', async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: [{ id: '1' }], error: null }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(fromMock).toHaveBeenCalledWith(TABLE);
  });

  it('passes exact values to .insert()', async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: [{ id: '1' }], error: null }),
    );
    const { fromMock, insertMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(insertMock).toHaveBeenCalledWith(VALUES);
  });

  it('calls .select() after .insert()', async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: [{ id: '1' }], error: null }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(select).toHaveBeenCalledTimes(1);
  });

  it('returns stable { rows, count } output', async () => {
    const select = jest.fn(() =>
      Promise.resolve({
        data: [{ id: 'created-row-id', name: 'Heartbeat' }],
        error: null,
      }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({
      output: {
        rows: [{ id: 'created-row-id', name: 'Heartbeat' }],
        count: 1,
      },
    });
  });

  it('succeeds with an empty rows array when data is empty', async () => {
    const select = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { rows: [], count: 0 } });
  });

  it('converts an SDK-returned error into a StepExecutionError', async () => {
    const select = jest.fn(() =>
      Promise.resolve({
        data: null,
        error: {
          message: 'permission denied',
          details: '',
          hint: '',
          code: '42501',
        },
      }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('converts a thrown SDK exception into a StepExecutionError', async () => {
    const select = jest.fn(() => Promise.reject(new Error('network failure')));
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('fails safely for malformed (non-array, non-null) table data', async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: 'not-an-array', error: null }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('fails safely for a non-JSON-safe row', async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: [{ createdAt: new Date() }], error: null }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow();
  });

  it('never includes a token or the client object in the result', async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: [{ id: '1' }], error: null }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    const result = await executor.execute(context, buildStep());

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('access_token');
    expect(serialized).not.toContain('supabase');
  });

  it('never includes row/error content in a thrown error message', async () => {
    const select = jest.fn(() =>
      Promise.resolve({
        data: null,
        error: {
          message: 'row violates check constraint "secret-constraint-name"',
          details:
            'Key (email)=(super-secret-value@example.com) already exists.',
          hint: '',
          code: '23505',
        },
      }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    try {
      await executor.execute(context, buildStep());
      throw new Error('expected execute() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StepExecutionError);
      const message = (error as StepExecutionError).message;
      expect(message).not.toContain('secret-constraint-name');
      expect(message).not.toContain('super-secret-value@example.com');
    }
  });

  it('does not create a new Supabase client', async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: [{ id: '1' }], error: null }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);
    const originalSupabase = context.supabase;

    await executor.execute(context, buildStep());

    expect(context.supabase).toBe(originalSupabase);
  });
});
