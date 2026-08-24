import { Injectable } from '@nestjs/common';
import { WorkflowStepExecutor } from '../decorators/workflow-step-executor.decorator';
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
 * Deliberately does *not* call `.select()` after `.insert()`: doing so
 * makes `supabase-js` send `Prefer: return=representation`, which
 * requires PostgREST to also evaluate the table's `SELECT` RLS policy
 * to build the response — a table that only grants `INSERT` to a role
 * (a common, deliberate "write-only" shape, e.g. a public waitlist form)
 * then has every insert rejected with a `42501` RLS error, even though
 * the insert itself was allowed. Never calling `.select()` means this
 * executor only ever requires `INSERT` privileges, matching the
 * `insert`-only intent of this step type. The trade-off: the inserted
 * row (including any DB-generated value, such as a serial `id`) is
 * never returned, so `output` is always `{ rows: [], count: 0 }` and a
 * later step cannot reference `${steps.<key>.output...}` for this step.
 *
 * A bare `.insert()` (no `.select()`) still reports `error` on an
 * SDK-reported failure and still throws on a network/transport
 * exception — both handled identically to before.
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
      ReturnType<ReturnType<typeof context.supabase.from>['insert']>
    >;
    try {
      response = await context.supabase
        .from(step.configuration.table)
        .insert(step.configuration.values);
    } catch (cause) {
      throw buildTableOperationFailure(identity, cause);
    }

    if (response.error) {
      throw buildTableOperationFailure(identity, response.error);
    }

    return { output: { rows: [], count: 0 } };
  }
}
