import { jest } from '@jest/globals';
import { AuthError } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExecutableWorkflowStep,
  WorkflowExecutionContext,
} from '../contracts';
import { StepExecutionError } from '../errors/workflow-execution.errors';
import { SigninStepExecutor } from './signin-step.executor';

const SUBMITTED_EMAIL = 'heartbeat-user@example.com';
const SUBMITTED_PASSWORD = 'placeholder-test-password';
const FAKE_ACCESS_TOKEN = 'placeholder-access-token';
const FAKE_REFRESH_TOKEN = 'placeholder-refresh-token';

function buildStep(): ExecutableWorkflowStep<'signin'> {
  return {
    id: 'step-1',
    workflowId: 'workflow-1',
    stepKey: 'authenticate_user',
    type: 'signin',
    position: 0,
    configuration: { email: SUBMITTED_EMAIL, password: SUBMITTED_PASSWORD },
  };
}

function buildContext(signInWithPassword: jest.Mock): WorkflowExecutionContext {
  const supabase = {
    auth: { signInWithPassword },
  } as unknown as SupabaseClient;

  return {
    project: { id: 'project-1', supabaseUrl: 'https://example.supabase.co' },
    workflow: { id: 'workflow-1' },
    supabase,
  };
}

describe('SigninStepExecutor', () => {
  let executor: SigninStepExecutor;

  beforeEach(() => {
    executor = new SigninStepExecutor();
  });

  it('has the canonical "signin" type', () => {
    expect(executor.type).toBe('signin');
  });

  it('calls signInWithPassword with exactly the validated email and password', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.resolve({
        data: {
          user: { id: 'user-123' },
          session: { access_token: FAKE_ACCESS_TOKEN },
        },
        error: null,
      }),
    );
    const context = buildContext(signInWithPassword);

    await executor.execute(context, buildStep());

    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: SUBMITTED_EMAIL,
      password: SUBMITTED_PASSWORD,
    });
  });

  it('returns safe output on successful signin', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.resolve({
        data: {
          user: { id: 'user-123' },
          session: { access_token: FAKE_ACCESS_TOKEN },
        },
        error: null,
      }),
    );
    const context = buildContext(signInWithPassword);

    const result = await executor.execute(context, buildStep());

    expect(result).toEqual({
      output: { authenticated: true, userId: 'user-123' },
    });
  });

  it('never includes session or token material in a successful result', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.resolve({
        data: {
          user: { id: 'user-123' },
          session: {
            access_token: FAKE_ACCESS_TOKEN,
            refresh_token: FAKE_REFRESH_TOKEN,
          },
        },
        error: null,
      }),
    );
    const context = buildContext(signInWithPassword);

    const result = await executor.execute(context, buildStep());

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(FAKE_ACCESS_TOKEN);
    expect(serialized).not.toContain(FAKE_REFRESH_TOKEN);
    expect(serialized).not.toContain('session');
    expect(serialized).not.toContain(SUBMITTED_PASSWORD);
  });

  it('converts an SDK-returned auth error into a StepExecutionError', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.resolve({
        data: { user: null, session: null },
        error: new AuthError(
          'Invalid login credentials',
          400,
          'invalid_credentials',
        ),
      }),
    );
    const context = buildContext(signInWithPassword);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('converts a thrown SDK exception into a StepExecutionError', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.reject(new Error('network failure')),
    );
    const context = buildContext(signInWithPassword);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('treats a response missing a user as failure even without an explicit error', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.resolve({
        data: { user: null, session: null },
        error: null,
      }),
    );
    const context = buildContext(signInWithPassword);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      StepExecutionError,
    );
  });

  it('includes safe step identity in the thrown error message', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.resolve({
        data: { user: null, session: null },
        error: new AuthError(
          'Invalid login credentials',
          400,
          'invalid_credentials',
        ),
      }),
    );
    const context = buildContext(signInWithPassword);

    await expect(executor.execute(context, buildStep())).rejects.toThrow(
      /authenticate_user/,
    );
  });

  it('never includes the submitted password in the thrown error (SDK-returned error)', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.resolve({
        data: { user: null, session: null },
        error: new AuthError(
          'Invalid login credentials',
          400,
          'invalid_credentials',
        ),
      }),
    );
    const context = buildContext(signInWithPassword);

    try {
      await executor.execute(context, buildStep());
      throw new Error('expected execute() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StepExecutionError);
      expect((error as StepExecutionError).message).not.toContain(
        SUBMITTED_PASSWORD,
      );
    }
  });

  it('never includes the submitted password in the thrown error (thrown exception)', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.reject(new Error('network failure')),
    );
    const context = buildContext(signInWithPassword);

    try {
      await executor.execute(context, buildStep());
      throw new Error('expected execute() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StepExecutionError);
      expect((error as StepExecutionError).message).not.toContain(
        SUBMITTED_PASSWORD,
      );
    }
  });

  it('never includes access or refresh tokens in the thrown error message', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.resolve({
        data: { user: null, session: null },
        error: new AuthError(
          'Invalid login credentials',
          400,
          'invalid_credentials',
        ),
      }),
    );
    const context = buildContext(signInWithPassword);

    try {
      await executor.execute(context, buildStep());
      throw new Error('expected execute() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StepExecutionError);
      const message = (error as StepExecutionError).message;
      expect(message).not.toContain(FAKE_ACCESS_TOKEN);
      expect(message).not.toContain(FAKE_REFRESH_TOKEN);
    }
  });

  it('reuses the context client instance rather than creating a new one', async () => {
    const signInWithPassword = jest.fn(() =>
      Promise.resolve({
        data: {
          user: { id: 'user-123' },
          session: { access_token: FAKE_ACCESS_TOKEN },
        },
        error: null,
      }),
    );
    const context = buildContext(signInWithPassword);
    const originalSupabase = context.supabase;

    await executor.execute(context, buildStep());

    expect(context.supabase).toBe(originalSupabase);
  });
});
