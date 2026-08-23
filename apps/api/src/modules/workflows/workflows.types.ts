import type { WorkflowOverlapPolicy } from '../../database/schema/types';
import type { WorkflowStepResponse } from './steps/workflow-steps.types';
import type {
  WorkflowRunListItem,
  WorkflowRunSummaryMetrics,
} from './runs/workflow-runs.types';

/**
 * The public HTTP representation of a workflow. Mapped by hand from the
 * Drizzle row, mirroring the Projects module's convention, so the API's
 * camelCase, stable field set stays decoupled from the database's own
 * column set. Never exposes the parent project's owner.
 *
 * Used as-is for the list endpoint (lightweight — no step configuration
 * payloads). `stepCount` is included there since it comes for free from
 * a single grouped count query; it is omitted (left `undefined`) on the
 * detail/create shape below, which carries the full `steps` array
 * instead.
 */
export interface WorkflowResponse {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  overlapPolicy: WorkflowOverlapPolicy;
  createdAt: Date;
  updatedAt: Date;
  stepCount?: number;
}

/**
 * The workflow detail/aggregate-create response: the same fields as
 * `WorkflowResponse` plus the complete ordered step list, so the
 * single-page workflow editor (and the aggregate create response) never
 * needs a second request just to see the steps. `steps` is ordered by
 * `position` ascending.
 */
export interface WorkflowDetailResponse extends WorkflowResponse {
  steps: WorkflowStepResponse[];
}

/**
 * A strict superset of `WorkflowDetailResponse` — full workflow detail
 * (including steps) plus operational-summary metrics and the last 10
 * runs, all in one payload. This is the single source of truth for the
 * frontend's workflow-overview page: unlike `WorkflowDetailResponse`, it
 * needs no second request to show metrics/recent runs. `metrics.nextRun`
 * is `null` whenever the workflow is disabled (see
 * `WorkflowsService.findOverview`).
 */
export interface WorkflowOverviewResponse extends WorkflowDetailResponse {
  metrics: WorkflowRunSummaryMetrics;
  recentRuns: WorkflowRunListItem[];
}
