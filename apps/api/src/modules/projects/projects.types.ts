import type { WorkflowRunStatus } from '../../database/schema/types';
import type { WorkflowRunListItem } from '../workflows/runs/workflow-runs.types';

/**
 * The public HTTP representation of a project. Deliberately mapped by hand
 * from the Drizzle row rather than returned as-is, so the API's camelCase,
 * stable field set stays decoupled from the database's own column set.
 */
export interface ProjectResponse {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  supabaseUrl: string;
  publishableKey: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One row of the project overview's workflow list — enough to render a
 * per-workflow summary (schedule, last/next run, last outcome) without a
 * second request per workflow. `lastRun`/`lastStatus` come from the most
 * recently created run for that workflow, if any; `nextRun` is computed
 * from `cronExpression`/`timezone` the same way
 * `WorkflowsService.computeNextRun` does, and is always `null` when the
 * workflow is disabled.
 */
export interface ProjectWorkflowSummary {
  id: string;
  name: string;
  enabled: boolean;
  cronExpression: string;
  timezone: string;
  lastRun: Date | null;
  lastStatus: WorkflowRunStatus | null;
  nextRun: Date | null;
}

/**
 * One row of the project overview's recent-activity list — the same shape
 * as `WorkflowRunListItem`, plus the identifying fields of the workflow
 * the run belongs to, since this list spans every workflow in the
 * project.
 */
export interface ProjectRecentRunItem extends WorkflowRunListItem {
  workflowId: string;
  workflowName: string;
}

/**
 * Aggregate operational-summary metrics for a project. Unlike
 * `WorkflowRunSummaryMetrics` (computed over a single workflow's entire
 * run history), `totalRuns`/`failedRuns` here are windowed to the last 7
 * days, matching the project-overview design. `lastActivity` and
 * `nextRun` are unwindowed: the single most recent run across every
 * workflow in the project, and the earliest upcoming scheduled run among
 * enabled workflows, respectively.
 */
export interface ProjectSummaryMetrics {
  totalWorkflows: number;
  activeWorkflows: number;
  totalRuns: number;
  failedRuns: number;
  lastActivity: Date | null;
  nextRun: Date | null;
}

/**
 * The single-request payload for the project-overview page: the project
 * itself, its aggregate metrics, a summary row per workflow, and the 10
 * most recent runs across every workflow in the project.
 */
export interface ProjectOverviewResponse extends ProjectResponse {
  metrics: ProjectSummaryMetrics;
  workflows: ProjectWorkflowSummary[];
  recentRuns: ProjectRecentRunItem[];
}
