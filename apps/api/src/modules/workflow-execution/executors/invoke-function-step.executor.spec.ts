import { jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type {
  ExecutableWorkflowStep,
  WorkflowExecutionContext,
} from '../contracts';
import { StepExecutionError } from '../errors/workflow-execution.errors';
import { InvalidStepExecutionOutputError } from '../execution-output/step-execution-output.errors';
import { InvokeFunctionStepExecutor } from './invoke-function-step.executor';

const FUNCTION_NAME = 'send-heartbeat';

function buildStep(
  overrides: Partial<
    ExecutableWorkflowStep<'invoke_function'>['configuration']
  > = {},
): ExecutableWorkflowStep<'invoke_function'> {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    stepKey: 'invoke-heartbeat-function',
    type: 'invoke_function',
    position: 0,
    configuration: { functionName: FUNCTION_NAME, ...overrides },
  };
}

function buildContext(invoke: jest.Mock): WorkflowExecutionContext {
  const supabase = { functions: { invoke } } as unknown as SupabaseClient;
  return {
    project: { id: 'project-1', supabaseUrl: 'https://example.supabase.co' },
    workflow: { id: 'workflow-1' },
    supabase,
  };
}

describe('InvokeFunctionStepExecutor', () => {
  let executor: InvokeFunctionStepExecutor;

  beforeEach(() => {
    executor = new InvokeFunctionStepExecutor();
  });

  it('has the canonical "invoke_function" type', () => {
    expect(executor.type).toBe('invoke_function');
  });

  it('invokes the validated function name', async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({ data: { ok: true }, error: null }),
    );
    const context = buildContext(invoke);

    await executor.execute(context, buildStep());

    expect(invoke).toHaveBeenCalledWith(FUNCTION_NAME, {});
  });

  it('includes body when present', async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({ data: { ok: true }, error: null }),
    );
    const context = buildContext(invoke);
    const body = { userId: 'user-1' };

    await executor.execute(context, buildStep({ body }));

    expect(invoke).toHaveBeenCalledWith(FUNCTION_NAME, { body });
  });

  it('omits body when absent', async () => {
    let receivedOptions: Record<string, unknown> | undefined;
    const invoke = jest.fn((..._args: unknown[]) => {
      receivedOptions = _args[1] as Record<string, unknown>;
      return Promise.resolve({ data: { ok: true }, error: null });
    });
    const context = buildContext(invoke);

    await executor.execute(context, buildStep());

    expect(receivedOptions).toBeDefined();
    expect('body' in (receivedOptions ?? {})).toBe(false);
  });

  it('preserves an explicit null body', async () => {
    const invoke = jest.fn(() => Promise.resolve({ data: null, error: null }));
    const context = buildContext(invoke);

    await executor.execute(context, buildStep({ body: null }));

    expect(invoke).toHaveBeenCalledWith(FUNCTION_NAME, { body: null });
  });

  it('normalizes an object response successfully', async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({ data: { ok: true }, error: null }),
    );
    const context = buildContext(invoke);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { data: { ok: true } } });
  });

  it('normalizes an array response successfully', async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({ data: [1, 2, 3], error: null }),
    );
    const context = buildContext(invoke);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { data: [1, 2, 3] } });
  });

  it('normalizes a string response successfully', async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({ data: 'done', error: null }),
    );
    const context = buildContext(invoke);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { data: 'done' } });
  });

  it('normalizes a number response successfully', async () => {
    const invoke = jest.fn(() => Promise.resolve({ data: 42, error: null }));
    const context = buildContext(invoke);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { data: 42 } });
  });

  it('normalizes a boolean response successfully', async () => {
    const invoke = jest.fn(() => Promise.resolve({ data: false, error: null }));
    const context = buildContext(invoke);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { data: false } });
  });

  it('treats a null response as success, distinct from {}', async () => {
    const invoke = jest.fn(() => Promise.resolve({ data: null, error: null }));
    const context = buildContext(invoke);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { data: null } });
  });

  it('converts an SDK-returned FunctionsHttpError into a StepExecutionError', async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({
        data: null,
        error: new FunctionsHttpError({ status: 500 }),
      }),
    );
    const context = buildContext(invoke);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('converts a thrown network exception into a StepExecutionError', async () => {
    const invoke = jest.fn(() => Promise.reject(new Error('network failure')));
    const context = buildContext(invoke);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('fails safely for a raw Response-like non-JSON-safe result', async () => {
    class FakeResponse {
      status = 200;
    }
    const invoke = jest.fn(() =>
      Promise.resolve({ data: new FakeResponse(), error: null }),
    );
    const context = buildContext(invoke);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      InvalidStepExecutionOutputError,
    );
  });

  it('never includes response headers in the thrown error', async () => {
    const fakeResponse = {
      status: 500,
      headers: new Map([['authorization', 'Bearer super-secret-token']]),
    };
    const invoke = jest.fn(() =>
      Promise.resolve({
        data: null,
        error: new FunctionsHttpError(fakeResponse),
      }),
    );
    const context = buildContext(invoke);

    try {
      await executor.execute(context, buildStep());
      throw new Error('expected execute() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StepExecutionError);
      const message = (error as StepExecutionError).message;
      expect(message).not.toContain('super-secret-token');
      expect(message).not.toContain('headers');
    }
  });

  it('never includes a token in the output', async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({ data: { ok: true }, error: null }),
    );
    const context = buildContext(invoke);

    const result = await executor.execute(context, buildStep());

    expect(JSON.stringify(result)).not.toContain('token');
  });

  it('never includes the request body in a thrown error message', async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({
        data: null,
        error: new FunctionsHttpError({ status: 500 }),
      }),
    );
    const context = buildContext(invoke);

    try {
      await executor.execute(
        context,
        buildStep({ body: { secretField: 'super-secret-body-value' } }),
      );
      throw new Error('expected execute() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StepExecutionError);
      expect((error as StepExecutionError).message).not.toContain(
        'super-secret-body-value',
      );
    }
  });

  it('reuses the context client', async () => {
    const invoke = jest.fn(() =>
      Promise.resolve({ data: { ok: true }, error: null }),
    );
    const context = buildContext(invoke);
    const originalSupabase = context.supabase;

    await executor.execute(context, buildStep());

    expect(context.supabase).toBe(originalSupabase);
  });
});
