import type { WorkflowStepType } from '@supabase-heartbeat/validation';
import {
  StepExecutionError,
  StepExecutorNotFoundError,
} from '../../workflow-execution/errors/workflow-execution.errors';
import { InvalidPersistedStepConfigurationError } from './executable-step.normalizer';

/**
 * Step identity known at the point a failure is serialized. Optional
 * because some failures (e.g. run-creation failure, before any step is
 * even loaded) have no step context at all.
 */
export interface FailedStepIdentity {
  stepKey: string;
  stepType: WorkflowStepType;
}

const GENERIC_UNEXPECTED_ERROR_MESSAGE =
  'An unexpected execution error occurred.';

/**
 * Error constructors whose `.message` is contractually guaranteed to be
 * safe to persist and return: hand-constructed from step identity and
 * fixed strings only, never from user-supplied step `configuration`, a
 * third-party SDK error's own message, or any other value that could
 * carry a credential, token, or request payload. Every class here has
 * been individually audited (see each class's own doc comment) — this
 * is a closed allowlist, not a heuristic.
 */
const SAFE_ERROR_TYPES = [
  StepExecutionError,
  StepExecutorNotFoundError,
  InvalidPersistedStepConfigurationError,
] as const;

function isSafeError(error: unknown): error is Error {
  return SAFE_ERROR_TYPES.some(
    (SafeErrorType) => error instanceof SafeErrorType,
  );
}

/**
 * Produces a short, human-readable, safe error sentence for persistence
 * in `step_runs.error` / `workflow_runs.error` (both plain `text`
 * columns — not JSON) and for the equivalent HTTP response field.
 *
 * Only errors matching the `SAFE_ERROR_TYPES` allowlist have their
 * `.message` read at all. Any other thrown value — an unrecognized
 * `Error` subclass, a plain `Error`, a third-party SDK exception not
 * explicitly classified as safe, or a non-Error thrown value — is
 * reduced to a fixed, generic sentence: its message, stack, enumerable
 * properties, and any `cause` chain are never persisted or returned,
 * since an arbitrary error may embed a password, access/refresh token,
 * authorization header, or other request data. The original error is
 * intentionally *not* attached as a `cause` on the returned string
 * (strings cannot carry a cause); callers that need the original error
 * for internal diagnosis should log it separately from this return
 * value, never forward it to persistence or the HTTP response.
 */
export function serializeExecutionError(
  error: unknown,
  stepIdentity?: FailedStepIdentity,
): string {
  // StepExecutionError's own `.message` is already a complete, safe
  // sentence identifying the step (e.g. `Signin step "x" failed: ...`)
  // — used as-is, not re-wrapped, to avoid a redundant double-prefix.
  if (error instanceof StepExecutionError) {
    return error.message;
  }

  const message = isSafeError(error)
    ? error.message
    : GENERIC_UNEXPECTED_ERROR_MESSAGE;

  if (stepIdentity) {
    return `Step "${stepIdentity.stepKey}" (${stepIdentity.stepType}) failed: ${message}`;
  }

  return `Workflow run failed: ${message}`;
}

/**
 * Builds the `workflow_runs.error` sentence once a step's own error has
 * already been serialized via `serializeExecutionError` — reuses that
 * same safe sentence (it already names the failed step) rather than
 * re-deriving anything from the raw error a second time.
 */
export function buildWorkflowRunFailureMessage(
  serializedStepError: string,
): string {
  return `Workflow run failed: ${serializedStepError}`;
}
