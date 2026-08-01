import type { WorkflowStepType } from '@supabase-heartbeat/validation';

const REDACTED = '[REDACTED]';

/**
 * Builds the secret-safe `step_runs.inputSnapshot` for one attempted
 * step. Focused specifically on workflow-step execution — not a generic
 * secret-management framework. Today only `signin.configuration.password`
 * is sensitive across all 8 canonical step types, so this function has
 * exactly one special case; every other type's configuration is copied
 * through unchanged (a shallow copy, so mutating the returned snapshot
 * never mutates the original persisted configuration).
 *
 * The original `workflow_steps.configuration` row is never modified —
 * this only shapes what gets written to the separate `step_runs` table.
 */
export function sanitizeStepConfigurationForSnapshot(
  type: WorkflowStepType,
  configuration: Record<string, unknown>,
): Record<string, unknown> {
  if (type === 'signin' && 'password' in configuration) {
    return { ...configuration, password: REDACTED };
  }
  return { ...configuration };
}

/**
 * Builds the full `step_runs.inputSnapshot` value: the step's stable
 * identity (`stepKey`, `type`) plus its sanitized configuration — useful
 * for diagnosing a run without ever re-exposing a credential.
 */
export function buildStepInputSnapshot(step: {
  stepKey: string;
  type: WorkflowStepType;
  configuration: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    stepKey: step.stepKey,
    type: step.type,
    configuration: sanitizeStepConfigurationForSnapshot(
      step.type,
      step.configuration,
    ),
  };
}
