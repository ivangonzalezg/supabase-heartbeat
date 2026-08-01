import { Inject, Injectable } from '@nestjs/common';
import { DELAY, type Delay } from '../delay/delay';
import { WorkflowStepExecutor } from '../decorators/workflow-step-executor.decorator';
import { StepExecutionError } from '../errors/workflow-execution.errors';
import type {
  ExecutableWorkflowStep,
  StepExecutionResult,
  StepExecutor,
  WorkflowExecutionContext,
} from '../contracts';

const MILLISECONDS_PER_SECOND = 1000;

/**
 * Waits for the step's configured duration and resolves successfully.
 * Never calls Supabase. Delegates the actual wait to the injected
 * `Delay` abstraction rather than calling `setTimeout` directly, so
 * tests can substitute a stub and never actually sleep — and so this
 * executor never busy-waits or blocks the Node.js event loop.
 *
 * Honors the shared validation package's existing `seconds` bounds
 * (`1..WAIT_SECONDS_MAX`) as-is; this executor does not define or
 * enforce a separate limit of its own.
 */
@WorkflowStepExecutor('wait')
@Injectable()
export class WaitStepExecutor implements StepExecutor<'wait'> {
  readonly type = 'wait' as const;

  constructor(@Inject(DELAY) private readonly delay: Delay) {}

  async execute(
    _context: WorkflowExecutionContext,
    step: ExecutableWorkflowStep<'wait'>,
  ): Promise<StepExecutionResult> {
    const { seconds } = step.configuration;

    try {
      await this.delay.wait(seconds * MILLISECONDS_PER_SECOND);
    } catch (cause) {
      throw new StepExecutionError({
        stepId: step.id,
        stepKey: step.stepKey,
        stepType: step.type,
        message: `Wait step "${step.stepKey}" failed to complete its delay.`,
        cause,
      });
    }

    return { output: { waitedSeconds: seconds } };
  }
}
