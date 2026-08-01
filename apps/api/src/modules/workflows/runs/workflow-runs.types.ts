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
