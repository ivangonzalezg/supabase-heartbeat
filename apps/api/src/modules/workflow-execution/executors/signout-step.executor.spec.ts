import { jest } from '@jest/globals';
import { AuthError } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExecutableWorkflowStep,
  WorkflowExecutionContext,
} from '../contracts';
import { StepExecutionError } from '../errors/workflow-execution.errors';
import { SignoutStepExecutor } from './signout-step.executor';

function buildStep(): ExecutableWorkflowStep<'signout'> {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    stepKey: 'end-session',
    type: 'signout',
    position: 1,
    configuration: {},
  };
}

function buildContext(signOut: jest.Mock): WorkflowExecutionContext {
  const supabase = { auth: { signOut } } as unknown as SupabaseClient;

  return {
    project: { id: 'project-1', supabaseUrl: 'https://example.supabase.co' },
    workflow: { id: 'workflow-1' },
    supabase,
  };
}

describe('SignoutStepExecutor', () => {
  let executor: SignoutStepExecutor;

  beforeEach(() => {
    executor = new SignoutStepExecutor();
  });

  it('has the canonical "signout" type', () => {
    expect(executor.type).toBe('signout');
  });

  it('calls signOut on the context client', async () => {
    const signOut = jest.fn(() => Promise.resolve({ error: null }));
    const context = buildContext(signOut);

    await executor.execute(context, buildStep());

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('returns safe success output', async () => {
    const signOut = jest.fn(() => Promise.resolve({ error: null }));
    const context = buildContext(signOut);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { signedOut: true } });
  });

  it('converts an SDK-returned signout error into a StepExecutionError', async () => {
    const signOut = jest.fn(() =>
      Promise.resolve({
        error: new AuthError('Something went wrong', 500, 'unexpected_failure'),
      }),
    );
    const context = buildContext(signOut);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('converts a thrown exception into a StepExecutionError', async () => {
    const signOut = jest.fn(() => Promise.reject(new Error('network failure')));
    const context = buildContext(signOut);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('never returns token or session data', async () => {
    const signOut = jest.fn(() => Promise.resolve({ error: null }));
    const context = buildContext(signOut);

    const result = await executor.execute(context, buildStep());

    expect(Object.keys(result.output as Record<string, unknown>)).toEqual([
      'signedOut',
    ]);
  });

  it('does not create a separate client', async () => {
    const signOut = jest.fn(() => Promise.resolve({ error: null }));
    const context = buildContext(signOut);
    const originalSupabase = context.supabase;

    await executor.execute(context, buildStep());

    expect(context.supabase).toBe(originalSupabase);
  });

  it('succeeds with { error: null } when there is no active session, matching the real SDK contract', async () => {
    // Verified by reading @supabase/auth-js's GoTrueClient._signOut
    // implementation (see
    // .agent-reports/2026-07-31-step-executor-foundation/inspection.md):
    // signOut() on a client with no active session skips the network
    // call and resolves { error: null } rather than erroring. This test
    // mocks that exact observed contract; the executor must not
    // manufacture an artificial failure for it.
    const signOut = jest.fn(() => Promise.resolve({ error: null }));
    const context = buildContext(signOut);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({ output: { signedOut: true } });
  });
});
