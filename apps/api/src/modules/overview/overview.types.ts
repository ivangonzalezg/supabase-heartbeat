import type { WorkflowRunListItem } from '../workflows/runs/workflow-runs.types';

/**
 * Aggregate operational-summary metrics across every project/workflow the
 * actor owns. `totalRuns`/`failedRuns` are windowed to the last 7 days
 * (same `RECENT_ACTIVITY_WINDOW_MS` convention as `ProjectSummaryMetrics`);
 * `lastActivity`/`nextRun` are unwindowed (most recent run overall / the
 * earliest upcoming run among every enabled workflow across every
 * project). `nextRunWorkflowName`/`nextRunProjectName` identify which
 * workflow the `nextRun` timestamp belongs to, for the summary tile's
 * context subtext — `null` together with `nextRun` when no enabled
 * workflow has a computable next run.
 */
export interface OverviewSummaryMetrics {
  totalProjects: number;
  activeWorkflows: number;
  totalRuns: number;
  failedRuns: number;
  lastActivity: Date | null;
  nextRun: Date | null;
  nextRunWorkflowName: string | null;
  nextRunProjectName: string | null;
}

/**
 * One row of the "Projects" table — a project plus its own
 * workflow/activity rollup, mirroring `ProjectSummaryMetrics`'s fields but
 * scoped per-project rather than per-actor. `enabled` is the project's own
 * flag (not derived from its workflows).
 */
export interface OverviewProjectSummary {
  id: string;
  name: string;
  enabled: boolean;
  totalWorkflows: number;
  activeWorkflows: number;
  lastActivity: Date | null;
  nextRun: Date | null;
}

/**
 * One row of the global "Recent activity" table — the same shape as
 * `ProjectRecentRunItem`, plus the identifying fields of the project the
 * run's workflow belongs to, since this list spans every project the actor
 * owns.
 */
export interface OverviewRecentRunItem extends WorkflowRunListItem {
  workflowId: string;
  workflowName: string;
  projectId: string;
  projectName: string;
}

/**
 * One row of the "Upcoming runs" table: an enabled workflow with a
 * computable next run, its parent project, and its raw schedule fields for
 * display. The full list is sorted by `nextRun` ascending and bounded to
 * `UPCOMING_RUNS_LIMIT` entries (see `OverviewService`).
 */
export interface OverviewUpcomingRun {
  workflowId: string;
  workflowName: string;
  projectId: string;
  projectName: string;
  nextRun: Date;
  cronExpression: string;
}

/**
 * The single-request payload for the global Overview dashboard page:
 * aggregate metrics, a summary row per project, the most recent runs
 * across every project, and the next upcoming scheduled runs across every
 * enabled workflow.
 */
export interface OverviewResponse {
  metrics: OverviewSummaryMetrics;
  projects: OverviewProjectSummary[];
  recentRuns: OverviewRecentRunItem[];
  upcomingRuns: OverviewUpcomingRun[];
}
