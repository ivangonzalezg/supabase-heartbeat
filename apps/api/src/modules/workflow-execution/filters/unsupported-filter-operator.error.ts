import type { WorkflowStepType } from '@supabase-heartbeat/validation';

/**
 * Thrown when a persisted `update`/`delete` step's filter carries an
 * operator outside the shared validation package's current closed set
 * (`updateFilterOperators`, currently `['eq']` only). This should not
 * happen for data written through the existing workflow-step API (which
 * validates the operator against the same closed set before persisting),
 * but a legacy row, a shared-package downgrade, or manually edited data
 * could still reach execution with a stale value — this is the same
 * "fail safely at the execution boundary" posture as
 * `InvalidPersistedStepConfigurationError`. The message never includes
 * the actual unsupported operator value, the column, or the filter
 * value.
 */
export class UnsupportedPersistedFilterOperatorError extends Error {
  readonly stepId: string;
  readonly stepKey: string;
  readonly stepType: WorkflowStepType;

  constructor(input: {
    stepId: string;
    stepKey: string;
    stepType: WorkflowStepType;
  }) {
    super(
      `Step "${input.stepKey}" (${input.stepType}) has a persisted filter ` +
        'operator that is no longer supported and could not be safely ' +
        'translated for execution.',
    );
    this.name = 'UnsupportedPersistedFilterOperatorError';
    this.stepId = input.stepId;
    this.stepKey = input.stepKey;
    this.stepType = input.stepType;
  }
}
