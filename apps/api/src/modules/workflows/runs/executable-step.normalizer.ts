import { parseWorkflowStepConfiguration } from '@supabase-heartbeat/validation';
import type { WorkflowStep } from '../../../database/schema/types';
import type { ExecutableWorkflowStep } from '../../workflow-execution/contracts';

/**
 * Thrown when a persisted `workflow_steps` row cannot be normalized into
 * an `ExecutableWorkflowStep` — i.e. its `type`/`configuration` pair
 * fails the same shared validation schema enforced at write time.
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
 * Converts a persisted `workflow_steps` row into the `StepExecutor`
 * contract's `ExecutableWorkflowStep`, re-validating `type`/
 * `configuration` together via the same shared schema enforced at write
 * time. Throws `InvalidPersistedStepConfigurationError` (never the raw
 * Zod issue list, which could echo back configuration values) if the
 * persisted row does not validate.
 */
export function toExecutableWorkflowStep(
  row: WorkflowStep,
): ExecutableWorkflowStep<WorkflowStep['type']> {
  const parsed = parseWorkflowStepConfiguration({
    type: row.type,
    configuration: row.configuration,
  });

  if (!parsed.success) {
    throw new InvalidPersistedStepConfigurationError(row.stepKey);
  }

  return {
    id: row.id,
    workflowId: row.workflowId,
    stepKey: row.stepKey,
    type: parsed.data.type,
    position: row.position,
    configuration: parsed.data.configuration,
  } as ExecutableWorkflowStep<WorkflowStep['type']>;
}
