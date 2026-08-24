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

function buildFromMock(insertResult: unknown): {
  fromMock: jest.Mock;
  insertMock: jest.Mock;
} {
  const insertMock = jest.fn(() => Promise.resolve(insertResult));
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
    const { fromMock } = buildFromMock({ error: null });
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(fromMock).toHaveBeenCalledWith(TABLE);
  });

  it('passes exact values to .insert()', async () => {
    const { fromMock, insertMock } = buildFromMock({ error: null });
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(insertMock).toHaveBeenCalledWith(VALUES);
  });

  it('never calls .select() after .insert(), to avoid requiring a SELECT RLS policy', async () => {
    // `.insert()` resolves directly to `{ error }` with no `.select`
    // method at all — if the executor tried to chain `.select()`, this
    // would throw "select is not a function" instead of succeeding.
    const insertMock = jest.fn(() => Promise.resolve({ error: null }));
    const fromMock = jest.fn(() => ({ insert: insertMock }));
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).resolves.toEqual({
      output: { rows: [], count: 0 },
    });
  });

  it('returns stable { rows: [], count: 0 } output on success', async () => {
    const { fromMock } = buildFromMock({ error: null });
    const context = buildContext(fromMock);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { rows: [], count: 0 } });
  });

  it('converts an SDK-returned error into a StepExecutionError', async () => {
    const { fromMock } = buildFromMock({
      error: {
        message: 'permission denied',
        details: '',
        hint: '',
        code: '42501',
      },
    });
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('converts a thrown SDK exception into a StepExecutionError', async () => {
    const insertMock = jest.fn(() =>
      Promise.reject(new Error('network failure')),
    );
    const fromMock = jest.fn(() => ({ insert: insertMock }));
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('never includes a token or the client object in the result', async () => {
    const { fromMock } = buildFromMock({ error: null });
    const context = buildContext(fromMock);

    const result = await executor.execute(context, buildStep());

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('access_token');
    expect(serialized).not.toContain('supabase');
  });

  it('never includes row/error content in a thrown error message', async () => {
    const { fromMock } = buildFromMock({
      error: {
        message: 'row violates check constraint "secret-constraint-name"',
        details: 'Key (email)=(super-secret-value@example.com) already exists.',
        hint: '',
        code: '23505',
      },
    });
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
    const { fromMock } = buildFromMock({ error: null });
    const context = buildContext(fromMock);
    const originalSupabase = context.supabase;

    await executor.execute(context, buildStep());

    expect(context.supabase).toBe(originalSupabase);
  });
});
