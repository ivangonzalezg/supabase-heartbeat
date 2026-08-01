import { Injectable } from '@nestjs/common';
import { WorkflowStepExecutor } from '../decorators/workflow-step-executor.decorator';
import { StepExecutionError } from '../errors/workflow-execution.errors';
import type {
  ExecutableWorkflowStep,
  StepExecutionResult,
  StepExecutor,
  WorkflowExecutionContext,
} from '../contracts';

/**
 * Authenticates the context's shared Supabase client using the step's own
 * `email`/`password` configuration. Multiple `signin` steps are allowed
 * within the same workflow context — a later `signin` step simply
 * re-authenticates the same client as another Supabase user, per the
 * SDK's own documented session-replacement behavior. Credentials are
 * never centralized at project or workflow level; each `signin` step
 * keeps its own configuration.
 *
 * Detects failure two ways, per the installed SDK's response contract
 * (`RequestResultSafeDestructure`, verified in
 * `.agent-reports/2026-07-31-step-executor-foundation/inspection.md`):
 * a thrown exception (network failure, SDK bug) is caught directly, and
 * an SDK-reported `{ error }` (or a response missing `data.user`) is
 * treated as a controlled failure. Both become the same
 * `StepExecutionError`.
 *
 * Never includes the submitted email or password, the access/refresh
 * token, full user metadata, or the full session in its result or in
 * any thrown error — see `output` below and the error messages, which
 * only ever use the SDK's own safe `AuthError.message` (e.g.
 * "Invalid login credentials"), never the submitted credential.
 */
@WorkflowStepExecutor('signin')
@Injectable()
export class SigninStepExecutor implements StepExecutor<'signin'> {
  readonly type = 'signin' as const;

  async execute(
    context: WorkflowExecutionContext,
    step: ExecutableWorkflowStep<'signin'>,
  ): Promise<StepExecutionResult> {
    const { email, password } = step.configuration;

    let response: Awaited<
      ReturnType<typeof context.supabase.auth.signInWithPassword>
    >;
    try {
      response = await context.supabase.auth.signInWithPassword({
        email,
        password,
      });
    } catch (cause) {
      throw new StepExecutionError({
        stepId: step.id,
        stepKey: step.stepKey,
        stepType: step.type,
        message: `Signin step "${step.stepKey}" failed: unexpected error during authentication.`,
        cause,
      });
    }

    if (response.error || !response.data.user) {
      throw new StepExecutionError({
        stepId: step.id,
        stepKey: step.stepKey,
        stepType: step.type,
        message:
          `Signin step "${step.stepKey}" failed: ` +
          (response.error?.message ?? 'no session was established') +
          '.',
      });
    }

    return {
      output: {
        authenticated: true,
        userId: response.data.user.id,
      },
    };
  }
}
