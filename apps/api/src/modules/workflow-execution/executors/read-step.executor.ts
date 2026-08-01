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
 * Reads rows from `configuration.table` using the context's shared,
 * already-authenticated Supabase client. `configuration.columns` is
 * already the PostgREST-ready comma-separated selection string the
 * shared validation schema produces (defaulting to `'*'`) — passed to
 * `.select()` unchanged, never re-parsed or re-joined. `configuration.limit`
 * is applied via `.limit()` only when present; when absent, no limit is
 * applied and no default is invented, per the shared schema's own
 * "bounded but caller-controlled" design (see
 * `packages/validation/src/workflow-steps/read.schema.ts`).
 *
 * A successful `.select()` with zero matching rows returns `data: []`
 * per PostgREST's documented contract, which this executor treats as a
 * valid, successful empty result — never a technical failure. Row order
 * is preserved exactly as Supabase returned it; this executor applies no
 * client-side sort.
 */
@WorkflowStepExecutor('read')
@Injectable()
export class ReadStepExecutor implements StepExecutor<'read'> {
  readonly type = 'read' as const;

  async execute(
    context: WorkflowExecutionContext,
    step: ExecutableWorkflowStep<'read'>,
  ): Promise<StepExecutionResult> {
    const identity = {
      stepId: step.id,
      stepKey: step.stepKey,
      stepType: this.type,
    };
    const { table, columns, limit } = step.configuration;

    let response: Awaited<
      ReturnType<ReturnType<typeof context.supabase.from>['select']>
    >;
    try {
      const query = context.supabase.from(table).select(columns);
      response = await (limit === undefined ? query : query.limit(limit));
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
