import { Injectable } from '@nestjs/common';
import type { FunctionInvokeOptions } from '@supabase/supabase-js';
import { WorkflowStepExecutor } from '../decorators/workflow-step-executor.decorator';
import { buildInvokeFunctionStepOutput } from '../execution-output/build-step-output';
import { buildInvokeFunctionFailure } from './invoke-function.errors';
import type {
  ExecutableWorkflowStep,
  StepExecutionResult,
  StepExecutor,
  WorkflowExecutionContext,
} from '../contracts';

/**
 * Invokes `configuration.functionName` using the context's shared,
 * already-authenticated Supabase client — the function receives
 * whatever the current session's role is (or the anonymous role, if no
 * `signin` step ran), exactly like `insert`/`read`/`update`/`delete`.
 *
 * `configuration.body` is `.optional()` in the shared validation schema:
 * when it is `undefined`, `options.body` is entirely omitted below
 * (never replaced with `{}`); when a `body` was explicitly submitted —
 * including an explicit `null`, which `jsonValueSchema` allows — it is
 * passed through unchanged.
 *
 * No header configuration is exposed in this task: `options` is built
 * from currently supported validated fields only (`functionName`,
 * `body`), so the caller can never override the authorization header the
 * SDK attaches from the client's own session.
 *
 * Per the installed `@supabase/functions-js` SDK (verified by reading
 * its source, see `inspection.md`), `invoke()` internally catches every
 * known failure and returns it as `{ data: null, error }` — it does not
 * throw `FunctionsHttpError`/`FunctionsRelayError`/`FunctionsFetchError`
 * to the caller. This executor still wraps the call in `try/catch` as a
 * defensive measure against an unexpected future SDK behavior change,
 * without relying on it for the documented error paths.
 *
 * Narrow, documented SDK typing limitation: `FunctionInvokeOptions.body`
 * (`@supabase/functions-js`) is typed as `... | Record<string, any> |
 * string | undefined` — it does not include `null` in its type, even
 * though the SDK's own runtime implementation (`FunctionsClient.invoke`,
 * read in full) accepts any truthy-or-falsy `functionArgs` value and
 * JSON-serializes it the same way for any non-Blob/ArrayBuffer/FormData/
 * string body, `null` included. The shared validation schema
 * (`invokeFunctionConfigurationSchema`) allows an explicit `null` body
 * (via `jsonValueSchema`), so a single `as FunctionInvokeOptions` cast is
 * applied only to the literal `{ body }` object below — never to the
 * whole `options` variable, and never used to bypass any other field's
 * typing.
 */
@WorkflowStepExecutor('invoke_function')
@Injectable()
export class InvokeFunctionStepExecutor implements StepExecutor<'invoke_function'> {
  readonly type = 'invoke_function' as const;

  async execute(
    context: WorkflowExecutionContext,
    step: ExecutableWorkflowStep<'invoke_function'>,
  ): Promise<StepExecutionResult> {
    const identity = {
      stepId: step.id,
      stepKey: step.stepKey,
      stepType: this.type,
    };
    const { functionName, body } = step.configuration;

    const options: FunctionInvokeOptions =
      body === undefined ? {} : ({ body } as FunctionInvokeOptions);

    let response: Awaited<ReturnType<typeof context.supabase.functions.invoke>>;
    try {
      response = await context.supabase.functions.invoke(functionName, options);
    } catch (cause) {
      throw buildInvokeFunctionFailure(identity, cause);
    }

    if (response.error) {
      throw buildInvokeFunctionFailure(identity, response.error);
    }

    return { output: buildInvokeFunctionStepOutput(identity, response.data) };
  }
}
