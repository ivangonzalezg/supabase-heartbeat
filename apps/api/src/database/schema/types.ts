import type { users } from './auth';
import type { projects } from './projects';
import type { workflows } from './workflows';
import type { workflowSteps } from './workflow-steps';
import type { workflowRuns } from './workflow-runs';
import type { stepRuns } from './step-runs';

/**
 * Canonical closed-set values for application-owned columns.
 *
 * Each tuple is the single source of truth used by:
 * - Drizzle's SQLite `text({ enum: [...] })` inference (TypeScript-level).
 * - The SQLite `CHECK` constraint generated for the same column
 *   (runtime-level, enforced even if TypeScript is bypassed).
 * - Schema tests asserting both layers reject invalid values.
 */

// Only 'skip' is implemented today. Do not add 'parallel' or 'queue' until
// the application actually supports them.
export const workflowOverlapPolicies = ['skip'] as const;

export type WorkflowOverlapPolicy = (typeof workflowOverlapPolicies)[number];

export const workflowStepTypes = [
  'signin',
  'insert',
  'read',
  'update',
  'delete',
  'invoke_function',
  'wait',
  'signout',
] as const;

export type WorkflowStepType = (typeof workflowStepTypes)[number];

export const workflowRunTriggerTypes = ['manual', 'scheduled'] as const;

export type WorkflowRunTriggerType = (typeof workflowRunTriggerTypes)[number];

export const workflowRunStatuses = [
  'pending',
  'running',
  'success',
  'failed',
  'cancelled',
  'skipped',
] as const;

export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];

// Same lifecycle as workflow_runs: a step run mirrors its parent run's
// pending/running/terminal states one-for-one, so no value is omitted.
export const stepRunStatuses = workflowRunStatuses;

export type StepRunStatus = (typeof stepRunStatuses)[number];

/**
 * Builds a deterministic, readable SQL `IN (...)` expression for a closed
 * set of developer-controlled string constants (never user input).
 *
 * Values are wrapped in single quotes with embedded single quotes escaped
 * (SQL-standard `''` escaping), matching SQLite's own quoting rules.
 */
export function sqlInList(values: readonly string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
}

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type NewWorkflowStep = typeof workflowSteps.$inferInsert;

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;

export type StepRun = typeof stepRuns.$inferSelect;
export type NewStepRun = typeof stepRuns.$inferInsert;
