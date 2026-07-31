import type { users } from './auth';
import type { projects } from './projects';
import type { workflows } from './workflows';
import type { workflowSteps } from './workflow-steps';
import type { workflowRuns } from './workflow-runs';
import type { stepRuns } from './step-runs';

/**
 * Canonical closed-set values for application-owned columns.
 *
 * The tuples themselves live in `@supabase-heartbeat/validation`
 * (a browser-compatible package with no Drizzle/NestJS/Node-only
 * imports, also consumed by the future frontend and by the workflow-step
 * configuration schemas) and are re-exported here as the single source
 * of truth used by:
 * - Drizzle's SQLite `text({ enum: [...] })` inference (TypeScript-level).
 * - The SQLite `CHECK` constraint generated for the same column
 *   (runtime-level, enforced even if TypeScript is bypassed).
 * - Schema tests asserting both layers reject invalid values.
 */
export {
  workflowOverlapPolicies,
  type WorkflowOverlapPolicy,
  workflowStepTypes,
  type WorkflowStepType,
  workflowRunTriggerTypes,
  type WorkflowRunTriggerType,
  workflowRunStatuses,
  type WorkflowRunStatus,
  stepRunStatuses,
  type StepRunStatus,
} from '@supabase-heartbeat/validation';

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
