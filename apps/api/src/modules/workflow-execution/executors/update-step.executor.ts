import { Injectable } from '@nestjs/common';
import { WorkflowStepExecutor } from '../decorators/workflow-step-executor.decorator';
import { applyPostgrestFilter } from '../filters/apply-postgrest-filter';
import { buildTableStepOutput } from '../execution-output/build-step-output';
import { buildTableOperationFailure } from './table-operation.errors';
import type {
  ExecutableWorkflowStep,
  StepExecutionResult,
  StepExecutor,
  WorkflowExecutionContext,
} from '../contracts';

/**
 * Updates rows in `configuration.table` matching `configuration.filter`
 * with `configuration.values`, using the context's shared,
 * already-authenticated Supabase client. `configuration.filter` is
 * required by the shared validation schema (`updateConfigurationSchema`)
 * — there is no code path in this executor that calls `.update()`
 * without first applying a filter, so an unfiltered update is
 * structurally impossible here, not merely avoided by convention.
 *
 * Always calls `.select()` after the filtered `.update()` so the
 * response contains the updated row(s), per this task's
 * table-selection decision. Zero matching rows is a valid, successful
 * result (`data: []`), never a technical failure.
 */
@WorkflowStepExecutor('update')
@Injectable()
export class UpdateStepExecutor implements StepExecutor<'update'> {
  readonly type = 'update' as const;

  async execute(
    context: WorkflowExecutionContext,
    step: ExecutableWorkflowStep<'update'>,
  ): Promise<StepExecutionResult> {
    const identity = {
      stepId: step.id,
      stepKey: step.stepKey,
      stepType: this.type,
    };
    const { table, values, filter } = step.configuration;

    // Translating the filter never touches the network — kept outside the
    // try/catch below so `UnsupportedPersistedFilterOperatorError` (already
    // a safe, allowlisted error) propagates as-is instead of being
    // re-wrapped as a generic "Supabase rejected the operation" failure.
    const filtered = applyPostgrestFilter(
      context.supabase.from(table).update(values),
      filter,
      identity,
    );

    let response: Awaited<ReturnType<typeof filtered.select>>;
    try {
      response = await filtered.select();
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
