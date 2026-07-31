/**
 * Canonical closed-set values shared between the API's Drizzle schema
 * (SQLite `text({ enum: [...] })` inference + `CHECK` constraints) and any
 * client (including a future browser frontend) that needs to validate or
 * render these same values. This package has no database or NestJS
 * imports, so `apps/api/src/database/schema/types.ts` re-exports these
 * tuples rather than declaring its own copy — there is exactly one
 * source of truth for each set.
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
