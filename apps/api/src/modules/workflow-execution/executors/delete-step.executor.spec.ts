import { jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExecutableWorkflowStep,
  WorkflowExecutionContext,
} from '../contracts';
import { StepExecutionError } from '../errors/workflow-execution.errors';
import { DeleteStepExecutor } from './delete-step.executor';

const TABLE = 'heartbeat_events';
const FILTER = { column: 'id', operator: 'eq' as const, value: 'row-1' };

/**
 * The shared validation schema (`updateFilterOperators`, reused by
 * `deleteConfigurationSchema`) currently defines exactly one operator,
 * `eq` — see `packages/validation/src/workflow-steps/update.schema.ts`
 * and `inspection.md`. "Every supported operator" is therefore `eq`
 * alone.
 */

function buildStep(
  overrides: Partial<ExecutableWorkflowStep<'delete'>['configuration']> = {},
): ExecutableWorkflowStep<'delete'> {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    stepKey: 'delete-heartbeat-row',
    type: 'delete',
    position: 0,
    configuration: { table: TABLE, filter: FILTER, ...overrides },
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

function buildFromMock(select: jest.Mock) {
  const eqMock = jest.fn(() => ({ select }));
  const deleteMock = jest.fn(() => ({ eq: eqMock }));
  const fromMock = jest.fn(() => ({ delete: deleteMock }));
  return { fromMock, deleteMock, eqMock };
}

describe('DeleteStepExecutor', () => {
  let executor: DeleteStepExecutor;

  beforeEach(() => {
    executor = new DeleteStepExecutor();
  });

  it('has the canonical "delete" type', () => {
    expect(executor.type).toBe('delete');
  });

  it('calls .delete()', async () => {
    const select = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const { fromMock, deleteMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(fromMock).toHaveBeenCalledWith(TABLE);
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it('applies the filter through the shared translator (eq)', async () => {
    const select = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const { fromMock, eqMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(eqMock).toHaveBeenCalledWith('id', 'row-1');
  });

  it('calls .select() after the filtered delete', async () => {
    const select = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(select).toHaveBeenCalledTimes(1);
  });

  it('treats zero matching rows as valid success', async () => {
    const select = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { rows: [], count: 0 } });
  });

  it('returns stable rows/count output for deleted rows', async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: [{ id: 'row-1' }], error: null }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { rows: [{ id: 'row-1' }], count: 1 } });
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

  it('converts a thrown exception into a StepExecutionError', async () => {
    const select = jest.fn(() => Promise.reject(new Error('network failure')));
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('fails safely for malformed output', async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: 'not-an-array', error: null }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('has no code path that calls .delete() without a filter', async () => {
    const select = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const { fromMock, eqMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(eqMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the context client', async () => {
    const select = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);
    const originalSupabase = context.supabase;

    await executor.execute(context, buildStep());

    expect(context.supabase).toBe(originalSupabase);
  });
});
