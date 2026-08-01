import {
  parseWorkflowStepConfiguration,
  type JsonValue,
} from '@supabase-heartbeat/validation';
import type { WorkflowStep } from '../../../database/schema/types';
import type { ExecutableWorkflowStep } from '../../workflow-execution/contracts';
import { ResolvedStepConfigurationError } from '../references/workflow-reference.errors';

/**
 * Thrown when a persisted `workflow_steps` row's own, unresolved
 * `type`/`configuration` pair fails the same shared validation schema
 * enforced at write time — i.e. the failure is unrelated to reference
 * resolution; the row itself was already invalid before any reference
 * was substituted.
 *
 * This should not happen for data written through the existing
 * workflow-step API (which already validates `type`/`configuration`
 * together before persisting), but the execution boundary must still
 * fail safely rather than pass an unvalidated shape to an executor —
 * legacy rows or manually edited data are the realistic cause. The
 * message never includes the raw configuration (which may contain a
 * `signin` password).
 */
export class InvalidPersistedStepConfigurationError extends Error {
  constructor(stepKey: string) {
    super(
      `Step "${stepKey}" has a persisted configuration that no longer ` +
        'matches its type and could not be safely normalized for execution.',
    );
    this.name = 'InvalidPersistedStepConfigurationError';
  }
}

/**
 * Re-validates a persisted `workflow_steps` row's own `type`/
 * `configuration` pair (before any reference resolution) via the same
 * shared schema enforced at write time. Throws
 * `InvalidPersistedStepConfigurationError` (never the raw Zod issue
 * list, which could echo back configuration values) if the persisted
 * row does not validate on its own. Used by
 * `WorkflowRunsService.createRun` as part of preflight — this call
 * happens *before* any reference is resolved, so it never has a
 * resolved value to report either.
 */
export function assertPersistedStepConfigurationIsValid(
  row: WorkflowStep,
): void {
  const parsed = parseWorkflowStepConfiguration({
    type: row.type,
    configuration: row.configuration,
  });
  if (!parsed.success) {
    throw new InvalidPersistedStepConfigurationError(row.stepKey);
  }
}

/**
 * Builds the `StepExecutor` contract's `ExecutableWorkflowStep` from a
 * persisted `workflow_steps` row and its **already-resolved**
 * configuration (references substituted, see
 * `references/resolve-step-references.ts`) — re-validates `type`/
 * `resolvedConfiguration` together via the same shared schema enforced
 * at write time, since a resolved reference value (e.g. a number
 * substituted into a field requiring a string) can make an otherwise
 * valid configuration shape invalid. Throws
 * `ResolvedStepConfigurationError` (never the raw Zod issue list or the
 * resolved value itself) if the resolved pair does not validate.
 */
export function toExecutableWorkflowStep(
  row: WorkflowStep,
  resolvedConfiguration: JsonValue,
): ExecutableWorkflowStep<WorkflowStep['type']> {
  const parsed = parseWorkflowStepConfiguration({
    type: row.type,
    configuration: resolvedConfiguration,
  });

  if (!parsed.success) {
    throw new ResolvedStepConfigurationError({
      stepKey: row.stepKey,
      stepType: row.type,
    });
  }

  return {
    id: row.id,
    workflowId: row.workflowId,
    stepKey: row.stepKey,
    type: parsed.data.type,
    position: row.position,
    configuration: parsed.data.configuration,
  };
}
