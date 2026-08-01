import { Injectable } from '@nestjs/common';
import { WorkflowStepExecutor } from '../decorators/workflow-step-executor.decorator';
import { buildTableStepOutput } from '../execution-output/build-step-output';
import { buildTableOperationFailure } from './table-operation.errors';
import type {
  ExecutableWorkflowStep,
  StepExecutionResult,
  StepExecutor,
  WorkflowExecutionContext,
} from '../contracts';

/**
 * Inserts `configuration.values` into `configuration.table` using the
 * context's shared, already-authenticated Supabase client — never
 * constructs its own client, so Row Level Security is enforced exactly
 * as it would be for the session established by an earlier `signin`
 * step (or the anonymous role, if none ran).
 *
 * Always calls `.select()` after `.insert()` so the response contains
 * the inserted row(s), per this task's table-selection decision — the
 * shared `insertConfigurationSchema` has no `select`/`returning` option
 * of its own to honor instead.
 *
 * PostgREST's own contract (and the installed SDK's typings) return
 * `data` as an array on success; a `null` `data` with no SDK-reported
 * `error` is not a documented success shape for an authenticated
 * `.insert().select()` call and is treated as a malformed response
 * rather than silently normalized to an empty array, so a genuine SDK
 * contract violation is never mistaken for "zero rows inserted" (an
 * insert without a violated constraint always returns the row it just
 * created).
 */
@WorkflowStepExecutor('insert')
@Injectable()
export class InsertStepExecutor implements StepExecutor<'insert'> {
  readonly type = 'insert' as const;

  async execute(
    context: WorkflowExecutionContext,
    step: ExecutableWorkflowStep<'insert'>,
  ): Promise<StepExecutionResult> {
    const identity = {
      stepId: step.id,
      stepKey: step.stepKey,
      stepType: this.type,
    };

    let response: Awaited<
      ReturnType<
        ReturnType<ReturnType<typeof context.supabase.from>['insert']>['select']
      >
    >;
    try {
      response = await context.supabase
        .from(step.configuration.table)
        .insert(step.configuration.values)
        .select();
    } catch (cause) {
      throw buildTableOperationFailure(identity, cause);
    }

    if (response.error) {
      throw buildTableOperationFailure(identity, response.error);
    }
    if (!Array.isArray(response.data)) {
      throw buildTableOperationFailure(identity);
    }

    return { output: buildTableStepOutput(identity, response.data) };
  }
}
