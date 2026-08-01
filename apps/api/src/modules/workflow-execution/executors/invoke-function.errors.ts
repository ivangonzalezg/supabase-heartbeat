import { StepExecutionError } from '../errors/workflow-execution.errors';

/**
 * Builds the fixed `StepExecutionError` for any Edge Function invocation
 * failure: an SDK-reported `FunctionsHttpError`/`FunctionsRelayError`/
 * `FunctionsFetchError`, a thrown network exception, or any other
 * unexpected failure. Deliberately a single fixed sentence regardless of
 * which specific failure occurred — `FunctionsHttpError`/
 * `FunctionsRelayError`'s own `context` can be the raw `Response` object
 * (confirmed by reading `@supabase/functions-js`'s `FunctionsClient.ts`),
 * and none of these error classes' `message`/`context` are safe to
 * persist: `context` may carry response headers or body content, and the
 * request body the function was invoked with is never echoed into this
 * message either. The original error is preserved only as the standard
 * `Error` `cause` for internal diagnosis.
 */
export function buildInvokeFunctionFailure(
  identity: { stepId: string; stepKey: string; stepType: 'invoke_function' },
  cause?: unknown,
): StepExecutionError {
  return new StepExecutionError({
    stepId: identity.stepId,
    stepKey: identity.stepKey,
    stepType: identity.stepType,
    message: `Step "${identity.stepKey}" (invoke_function) failed: Supabase function invocation failed.`,
    cause,
  });
}
