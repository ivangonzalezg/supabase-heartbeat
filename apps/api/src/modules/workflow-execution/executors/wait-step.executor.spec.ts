import { jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Delay } from '../delay/delay';
import type {
  ExecutableWorkflowStep,
  WorkflowExecutionContext,
} from '../contracts';
import { StepExecutionError } from '../errors/workflow-execution.errors';
import { WaitStepExecutor } from './wait-step.executor';

function buildStep(seconds: number): ExecutableWorkflowStep<'wait'> {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    stepKey: 'pause',
    type: 'wait',
    position: 2,
    configuration: { seconds },
  };
}

function buildContext(
  signInWithPassword: jest.Mock,
  signOut: jest.Mock,
): WorkflowExecutionContext {
  const supabase = {
    auth: { signInWithPassword, signOut },
  } as unknown as SupabaseClient;

  return {
    project: { id: 'project-1', supabaseUrl: 'https://example.supabase.co' },
    workflow: { id: 'workflow-1' },
    supabase,
  };
}

describe('WaitStepExecutor', () => {
  let waitFn: jest.Mock<Delay['wait']>;
  let stubDelay: Delay;
  let executor: WaitStepExecutor;

  beforeEach(() => {
    waitFn = jest.fn(() => Promise.resolve(undefined));
    stubDelay = { wait: waitFn };
    executor = new WaitStepExecutor(stubDelay);
  });

  it('has the canonical "wait" type', () => {
    expect(executor.type).toBe('wait');
  });

  it('converts configured seconds to milliseconds correctly', async () => {
    await executor.execute(buildContext(jest.fn(), jest.fn()), buildStep(5));

    expect(waitFn).toHaveBeenCalledWith(5000);
  });

  it('delegates to the injected delay abstraction exactly once', async () => {
    await executor.execute(buildContext(jest.fn(), jest.fn()), buildStep(10));

    expect(waitFn).toHaveBeenCalledTimes(1);
  });

  it('returns safe output describing the waited duration', async () => {
    const result = await executor.execute(
      buildContext(jest.fn(), jest.fn()),
      buildStep(30),
    );

    expect(result).toEqual({ output: { waitedSeconds: 30 } });
  });

  it('does not invoke Supabase', async () => {
    const signInWithPassword = jest.fn();
    const signOut = jest.fn();

    await executor.execute(
      buildContext(signInWithPassword, signOut),
      buildStep(1),
    );

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('propagates a delay failure as a focused StepExecutionError', async () => {
    waitFn.mockImplementation(() => Promise.reject(new Error('timer failure')));

    await expect(
      executor.execute(buildContext(jest.fn(), jest.fn()), buildStep(1)),
    ).rejects.toThrow(StepExecutionError);
  });

  it('does not actually wait for the schema maximum duration (uses the stub, never real time)', async () => {
    const start = Date.now();

    await executor.execute(buildContext(jest.fn(), jest.fn()), buildStep(3600));

    expect(Date.now() - start).toBeLessThan(1000);
    expect(waitFn).toHaveBeenCalledWith(3600 * 1000);
  });
});
