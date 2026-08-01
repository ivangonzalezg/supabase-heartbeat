import { StepExecutionError } from '../errors/workflow-execution.errors';

type TableOperation = 'insert' | 'read' | 'update' | 'delete';

const OPERATION_LABEL: Record<TableOperation, string> = {
  insert: 'insert',
  read: 'read',
  update: 'update',
  delete: 'delete',
};

/**
 * Builds the fixed, operation-specific `StepExecutionError` used for
 * every PostgREST failure (an SDK-reported `{ error }`, a thrown
 * exception during the request, or a response shape the executor did
 * not expect). Deliberately never includes the PostgREST error's own
 * `message`/`details`/`hint`/`code` — `PostgrestError`'s own source
 * documents that `details`/`hint` "often" carry the offending value,
 * key, or row (see `.agent-reports/2026-08-01-supabase-data-and-function-executors/inspection.md`),
 * so no part of it is safe to persist. The original error is preserved
 * only as the standard `Error` `cause` for internal diagnosis.
 */
export function buildTableOperationFailure(
  identity: { stepId: string; stepKey: string; stepType: TableOperation },
  cause?: unknown,
): StepExecutionError {
  return new StepExecutionError({
    stepId: identity.stepId,
    stepKey: identity.stepKey,
    stepType: identity.stepType,
    message: `Step "${identity.stepKey}" (${identity.stepType}) failed: Supabase rejected the ${OPERATION_LABEL[identity.stepType]} operation.`,
    cause,
  });
}

/**
 * Builds the `StepExecutionError` for a malformed/unexpected PostgREST
 * response — `data` was neither an array nor `null` when an array (or
 * `null` meaning "no rows") was the only contract-compliant shape.
 * Distinct wording from `buildTableOperationFailure` so a genuine SDK
 * failure and an SDK contract violation remain distinguishable in logs,
 * while neither ever includes response content.
 */
export function buildMalformedTableResponseFailure(identity: {
  stepId: string;
  stepKey: string;
  stepType: TableOperation;
}): StepExecutionError {
  return new StepExecutionError({
    stepId: identity.stepId,
    stepKey: identity.stepKey,
    stepType: identity.stepType,
    message: `Step "${identity.stepKey}" (${identity.stepType}) failed: Supabase returned an unexpected response shape for the ${OPERATION_LABEL[identity.stepType]} operation.`,
  });
}
