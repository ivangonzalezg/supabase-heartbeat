import type {
  WorkflowRunStatus,
  WorkflowRunTriggerType,
  StepRunStatus,
} from '@supabase-heartbeat/validation';

/**
 * The public HTTP representation of one persisted step run. Mapped by
 * hand from the Drizzle `step_runs` row, mirroring every other module's
 * convention in this codebase.
 *
 * `inputSnapshot` is the already-sanitized snapshot written at step-run
 * creation time (see `sanitizeStepConfigurationForSnapshot`) — never the
 * raw persisted `workflow_steps.configuration`. `output` is the
 * executor's own `StepExecutionResult.output`, already guaranteed
 * JSON-safe and credential-free by contract. `error` is a short,
 * human-readable, safe sentence (see `serializeExecutionError`), never a
 * raw `Error`, stack trace, or `cause`.
 */
export interface StepRunResponse {
  id: string;
  workflowRunId: string;
  workflowStepId: string;
  position: number;
  status: StepRunStatus;
  inputSnapshot: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

/**
 * The public HTTP representation of one workflow run together with its
 * ordered step runs — the response shape for the manual-run endpoint.
 * `stepRuns` is ordered by `position` ascending, matching execution
 * order (not necessarily the full set of persisted workflow steps: only
 * enabled steps that were actually attempted get a row here).
 */
export interface WorkflowRunDetailResponse {
  id: string;
  workflowId: string;
  triggerType: WorkflowRunTriggerType;
  status: WorkflowRunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  stepRuns: StepRunResponse[];
}

/**
 * Aggregate operational-summary metrics for one workflow's run history,
 * computed over all of its `workflow_runs` rows (not just the bounded
 * `recentRuns` list returned alongside it — see `WorkflowOverviewResponse`
 * in `../workflows.types.ts`).
 *
 * `successRate` counts every run that has left the active
 * (`pending`/`running`) lifecycle in its denominator — `success / (success
 * + failed + cancelled + skipped)` — so in-flight runs never distort the
 * ratio; `null` when that denominator is 0 (no concluded runs yet).
 * `avgDurationMs` is computed only over runs where both `startedAt` and
 * `finishedAt` are set; `null` if none qualify. `nextRun` is always
 * assembled by the caller (`WorkflowsService.findOverview`), which has
 * the workflow row's `cronExpression`/`timezone`/`enabled` needed to
 * compute it — this service only ever returns `null` for it.
 */
export interface WorkflowRunSummaryMetrics {
  totalRuns: number;
  successRate: number | null;
  failedRuns: number;
  avgDurationMs: number | null;
  lastRun: Date | null;
  nextRun: Date | null;
}

/**
 * One row of the bounded (last 10) recent-runs list. `failedStepKey` is
 * the `stepKey` of the step whose `step_runs` row has `status: 'failed'`
 * for this run, resolved via a single batched query across the whole
 * page of runs (never N+1) — `null` for any non-failed run, or for a
 * failed run with no matching `step_runs` row (defensive; not expected
 * given today's execution flow, see `resolveFailedSteps`).
 */
export interface WorkflowRunListItem {
  id: string;
  status: WorkflowRunStatus;
  triggerType: WorkflowRunTriggerType;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  failedStepKey: string | null;
}
