import type { WorkflowStepType } from '@supabase-heartbeat/validation';

/**
 * Thrown by a step executor when it fails for a technical reason (an SDK
 * exception, an SDK-reported error, or an internal execution failure).
 * Carries only safe metadata — step identity and a safe message — never
 * the step's `configuration` (which may contain credentials for `signin`)
 * and never a password, access token, or refresh token in its message.
 *
 * The original cause (e.g. the underlying Supabase `AuthError`) is
 * preserved via the standard `Error` `cause` option for internal
 * diagnosis; callers that log this error should log `.message` and
 * step identity, not blindly serialize `.cause`.
 *
 * Not an HTTP exception: no execution endpoint exists yet in this task.
 * The future workflow engine decides how to persist and expose this.
 */
export class StepExecutionError extends Error {
  readonly stepId: string;
  readonly stepKey: string;
  readonly stepType: WorkflowStepType;

  constructor(input: {
    stepId: string;
    stepKey: string;
    stepType: WorkflowStepType;
    message: string;
    cause?: unknown;
  }) {
    super(
      input.message,
      input.cause === undefined ? undefined : { cause: input.cause },
    );
    this.name = 'StepExecutionError';
    this.stepId = input.stepId;
    this.stepKey = input.stepKey;
    this.stepType = input.stepType;
  }
}

/** Thrown by `StepExecutorRegistry.get` when no executor is registered
 * for the requested workflow-step type (e.g. `insert`, which has no
 * executor yet in this task). */
export class StepExecutorNotFoundError extends Error {
  constructor(type: WorkflowStepType) {
    super(`No executor is registered for workflow step type "${type}".`);
    this.name = 'StepExecutorNotFoundError';
  }
}

/** Thrown during discovery when two providers both declare the same
 * workflow-step type via `@WorkflowStepExecutor`. Fails application
 * bootstrap rather than silently keeping one and discarding the other. */
export class DuplicateStepExecutorError extends Error {
  constructor(type: WorkflowStepType) {
    super(
      `Multiple executors are registered for workflow step type "${type}".`,
    );
    this.name = 'DuplicateStepExecutorError';
  }
}

/** Thrown during discovery when a provider carries `@WorkflowStepExecutor`
 * metadata but does not actually satisfy the `StepExecutor` shape (e.g.
 * no callable `execute`, or a `type` property that does not match its
 * own declared metadata). */
export class InvalidStepExecutorProviderError extends Error {
  constructor(reason: string) {
    super(`Invalid workflow step executor provider: ${reason}`);
    this.name = 'InvalidStepExecutorProviderError';
  }
}
