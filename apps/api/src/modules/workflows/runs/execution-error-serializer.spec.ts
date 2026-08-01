import { describe, expect, it } from '@jest/globals';
import {
  StepExecutionError,
  StepExecutorNotFoundError,
} from '../../workflow-execution/errors/workflow-execution.errors';
import { InvalidPersistedStepConfigurationError } from './executable-step.normalizer';
import {
  buildWorkflowRunFailureMessage,
  serializeExecutionError,
} from './execution-error-serializer';

const stepIdentity = { stepKey: 'a', stepType: 'wait' as const };

describe('serializeExecutionError', () => {
  describe('allowlisted safe error types', () => {
    it('returns a StepExecutionError message verbatim, unwrapped', () => {
      const error = new StepExecutionError({
        stepId: 'step-1',
        stepKey: 'a',
        stepType: 'signin',
        message: 'Signin step "a" failed: Invalid login credentials',
      });

      expect(serializeExecutionError(error, stepIdentity)).toBe(
        'Signin step "a" failed: Invalid login credentials',
      );
    });

    it('wraps a StepExecutorNotFoundError message with step identity', () => {
      const error = new StepExecutorNotFoundError('insert');

      expect(serializeExecutionError(error, stepIdentity)).toBe(
        'Step "a" (wait) failed: No executor is registered for workflow step type "insert".',
      );
    });

    it('wraps an InvalidPersistedStepConfigurationError message with step identity', () => {
      const error = new InvalidPersistedStepConfigurationError('a');

      expect(serializeExecutionError(error, stepIdentity)).toBe(
        'Step "a" (wait) failed: Step "a" has a persisted configuration that no longer matches its type and could not be safely normalized for execution.',
      );
    });
  });

  describe('unrecognized or unsafe error values', () => {
    it.each([
      ['a signin password', 'password="hunter2-super-secret"'],
      ['an access token', 'access_token=eyJhbGciOiJIUzI1NiIsdummy.token.value'],
      ['a refresh token', 'refresh_token=rt_dummy_super_secret_value'],
      [
        'an authorization header',
        'Authorization: Bearer dummy-secret-bearer-token',
      ],
    ])(
      'never includes %s from a plain Error message',
      (_label, sensitiveFragment) => {
        const error = new Error(`Upstream failure: ${sensitiveFragment}`);

        const serialized = serializeExecutionError(error, stepIdentity);

        expect(serialized).not.toContain(sensitiveFragment);
        expect(serialized).toBe(
          'Step "a" (wait) failed: An unexpected execution error occurred.',
        );
      },
    );

    it('never includes a message from a non-Error thrown value', () => {
      const serialized = serializeExecutionError(
        'raw string rejection with password=leaked-value',
        stepIdentity,
      );

      expect(serialized).not.toContain('leaked-value');
      expect(serialized).toBe(
        'Step "a" (wait) failed: An unexpected execution error occurred.',
      );
    });

    it('never includes a message from an unrecognized Error subclass', () => {
      class SomeThirdPartySdkError extends Error {}
      const error = new SomeThirdPartySdkError(
        'SDK internal failure: token=leaked-sdk-token',
      );

      const serialized = serializeExecutionError(error, stepIdentity);

      expect(serialized).not.toContain('leaked-sdk-token');
      expect(serialized).toBe(
        'Step "a" (wait) failed: An unexpected execution error occurred.',
      );
    });

    it('produces a generic run-level message when there is no step identity', () => {
      const error = new Error('password=leaked-value');

      const serialized = serializeExecutionError(error);

      expect(serialized).not.toContain('leaked-value');
      expect(serialized).toBe(
        'Workflow run failed: An unexpected execution error occurred.',
      );
    });

    it('never leaks a stack trace for an unrecognized error', () => {
      const error = new Error('boom');
      error.stack = 'Error: boom\n    at secretInternalPath (leaked.js:1:1)';

      const serialized = serializeExecutionError(error, stepIdentity);

      expect(serialized).not.toContain('leaked.js');
      expect(serialized).not.toContain('at secretInternalPath');
    });

    it('never leaks an enumerable property carrying a credential', () => {
      const error = new Error('boom') as Error & { password?: string };
      error.password = 'leaked-enumerable-password';

      const serialized = serializeExecutionError(error, stepIdentity);

      expect(serialized).not.toContain('leaked-enumerable-password');
    });

    it('never leaks a `cause` chain for an unrecognized error', () => {
      const error = new Error('boom', {
        cause: new Error('root cause: password=leaked-cause-secret'),
      });

      const serialized = serializeExecutionError(error, stepIdentity);

      expect(serialized).not.toContain('leaked-cause-secret');
    });
  });
});

describe('buildWorkflowRunFailureMessage', () => {
  it('wraps an already-safe serialized step error', () => {
    expect(
      buildWorkflowRunFailureMessage(
        'Step "a" (wait) failed: An unexpected execution error occurred.',
      ),
    ).toBe(
      'Workflow run failed: Step "a" (wait) failed: An unexpected execution error occurred.',
    );
  });
});
