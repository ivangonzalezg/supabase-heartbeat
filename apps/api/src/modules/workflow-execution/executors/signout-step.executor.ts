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
 * Signs the context's shared Supabase client out. Reuses the same client
 * — never constructs a new one. `signout` takes no configuration
 * (`{}`, validated by the shared package's `signoutConfigurationSchema`).
 *
 * Real SDK behavior when there is no active session (confirmed by
 * reading `@supabase/auth-js`'s `GoTrueClient._signOut` implementation,
 * see `.agent-reports/2026-07-31-step-executor-foundation/inspection.md`):
 * the SDK skips the network call entirely and resolves `{ error: null }`
 * — signOut on an unauthenticated client succeeds silently rather than
 * erroring. This executor therefore never manufactures an artificial
 * error merely because the context has no separately tracked "is signed
 * in" flag; it reports exactly what the SDK reports.
 */
@WorkflowStepExecutor('signout')
@Injectable()
export class SignoutStepExecutor implements StepExecutor<'signout'> {
  readonly type = 'signout' as const;

  async execute(
    context: WorkflowExecutionContext,
    step: ExecutableWorkflowStep<'signout'>,
  ): Promise<StepExecutionResult> {
    let response: Awaited<ReturnType<typeof context.supabase.auth.signOut>>;
    try {
      response = await context.supabase.auth.signOut();
    } catch (cause) {
      throw new StepExecutionError({
        stepId: step.id,
        stepKey: step.stepKey,
        stepType: step.type,
        message: `Signout step "${step.stepKey}" failed: unexpected error during sign-out.`,
        cause,
      });
    }

    if (response.error) {
      throw new StepExecutionError({
        stepId: step.id,
        stepKey: step.stepKey,
        stepType: step.type,
        message: `Signout step "${step.stepKey}" failed: ${response.error.message}.`,
      });
    }

    return { output: { signedOut: true } };
  }
}
