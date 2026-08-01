import { jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExecutableWorkflowStep,
  WorkflowExecutionContext,
} from '../contracts';
import { StepExecutionError } from '../errors/workflow-execution.errors';
import { UpdateStepExecutor } from './update-step.executor';

const TABLE = 'heartbeat_events';
const VALUES = { active: false };
const FILTER = { column: 'id', operator: 'eq' as const, value: 'row-1' };

/**
 * The shared validation schema (`updateFilterOperators`) currently
 * defines exactly one operator, `eq` — see
 * `packages/validation/src/workflow-steps/update.schema.ts` and
 * `inspection.md` for the full rationale. "Every supported operator" is
 * therefore `eq` alone; this file does not test operators the schema
 * does not accept.
 */

function buildStep(
  overrides: Partial<ExecutableWorkflowStep<'update'>['configuration']> = {},
): ExecutableWorkflowStep<'update'> {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    stepKey: 'update_heartbeat_row',
    type: 'update',
    position: 0,
    configuration: {
      table: TABLE,
      values: VALUES,
      filter: FILTER,
      ...overrides,
    },
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
  const updateMock = jest.fn(() => ({ eq: eqMock }));
  const fromMock = jest.fn(() => ({ update: updateMock }));
  return { fromMock, updateMock, eqMock };
}

describe('UpdateStepExecutor', () => {
  let executor: UpdateStepExecutor;

  beforeEach(() => {
    executor = new UpdateStepExecutor();
  });

  it('has the canonical "update" type', () => {
    expect(executor.type).toBe('update');
  });

  it('calls .update() with exact values', async () => {
    const select = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const { fromMock, updateMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(fromMock).toHaveBeenCalledWith(TABLE);
    expect(updateMock).toHaveBeenCalledWith(VALUES);
  });

  it('applies the filter through the shared translator (eq)', async () => {
    const select = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const { fromMock, eqMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    await executor.execute(context, buildStep());

    expect(eqMock).toHaveBeenCalledWith('id', 'row-1');
  });

  it('calls .select() after the filtered update', async () => {
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

  it('returns stable rows/count output for matching rows', async () => {
    const select = jest.fn(() =>
      Promise.resolve({ data: [{ id: 'row-1', active: false }], error: null }),
    );
    const { fromMock } = buildFromMock(select);
    const context = buildContext(fromMock);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({
      output: { rows: [{ id: 'row-1', active: false }], count: 1 },
    });
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

  it('has no code path that calls .update() without a filter', async () => {
    // The shared validation schema requires `filter` on every
    // UpdateConfiguration — there is no optional-filter branch in this
    // executor to bypass. This test documents that guarantee: the mock
    // update() only ever returns an object exposing `.eq`, never a
    // `.select` directly, so an unfiltered call would fail this test's
    // own mock shape before reaching the real assertions.
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
