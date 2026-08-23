import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  workflowOverlapPolicies,
  workflowRunStatuses,
  workflowRunTriggerTypes,
  type WorkflowOverlapPolicy,
  type WorkflowRunStatus,
  type WorkflowRunTriggerType,
} from '../../../database/schema/types';
import { WorkflowStepResponseDto } from '../steps/dto/workflow-step-response.dto';
import type {
  WorkflowDetailResponse,
  WorkflowOverviewResponse,
  WorkflowResponse,
} from '../workflows.types';
import type {
  WorkflowRunListItem,
  WorkflowRunSummaryMetrics,
} from '../runs/workflow-runs.types';

/**
 * Documentation adapter for `WorkflowResponse` (`workflows.types.ts`) —
 * the lightweight list-endpoint shape (no step configurations). See
 * `WorkflowStepResponseDto`'s own comment for why this class
 * `implements` the response interface but is never constructed at
 * runtime.
 */
export class WorkflowResponseDto implements WorkflowResponse {
  @ApiProperty({ description: 'The workflow ID.' })
  id!: string;

  @ApiProperty({ description: 'The parent project ID.' })
  projectId!: string;

  @ApiProperty({
    description: 'Human-readable workflow name.',
    example: 'Nightly heartbeat',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional free-text description.',
    example: 'Pings the project every 6 hours to keep it active.',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    description: 'The workflow schedule, as a cron expression.',
    example: '0 */6 * * *',
  })
  cronExpression!: string;

  @ApiProperty({
    description: 'IANA time zone identifier.',
    example: 'America/Bogota',
  })
  timezone!: string;

  @ApiProperty({ description: 'Whether the workflow is enabled.' })
  enabled!: boolean;

  @ApiProperty({
    description:
      'Policy applied when a scheduled run starts while a previous run ' +
      'is still in progress. Only "skip" is currently implemented.',
    enum: workflowOverlapPolicies,
  })
  overlapPolicy!: WorkflowOverlapPolicy;

  @ApiProperty({ description: 'When the workflow was created.' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the workflow was last updated.' })
  updatedAt!: Date;

  @ApiPropertyOptional({
    description:
      'The number of steps in the workflow, when available. Not ' +
      'currently populated on any response.',
  })
  stepCount?: number;
}

/**
 * Documentation adapter for `WorkflowDetailResponse`
 * (`workflows.types.ts`) — the workflow detail / aggregate-create shape,
 * including the complete ordered step list.
 */
export class WorkflowDetailResponseDto
  extends WorkflowResponseDto
  implements WorkflowDetailResponse
{
  @ApiProperty({
    description: "The workflow's complete step list, ordered by position.",
    type: [WorkflowStepResponseDto],
  })
  steps!: WorkflowStepResponseDto[];
}

/**
 * Documentation adapter for `WorkflowRunSummaryMetrics`
 * (`runs/workflow-runs.types.ts`).
 */
export class WorkflowRunSummaryMetricsDto implements WorkflowRunSummaryMetrics {
  @ApiProperty({ description: 'Total number of runs ever created.' })
  totalRuns!: number;

  @ApiProperty({
    description:
      'Percentage (0-100, one decimal) of concluded runs (i.e. not ' +
      '`pending`/`running`) that ended `success`. `null` if no run has ' +
      'concluded yet.',
    nullable: true,
    example: 83.3,
  })
  successRate!: number | null;

  @ApiProperty({ description: 'Number of runs with status `failed`.' })
  failedRuns!: number;

  @ApiProperty({
    description:
      'Average run duration in milliseconds, over runs where both ' +
      '`startedAt` and `finishedAt` are set. `null` if none qualify.',
    nullable: true,
    example: 3600,
  })
  avgDurationMs!: number | null;

  @ApiProperty({
    description: "The most recent run's `startedAt`. `null` if no runs exist.",
    nullable: true,
  })
  lastRun!: Date | null;

  @ApiProperty({
    description:
      'The next scheduled occurrence, computed from `cronExpression`/' +
      '`timezone`. `null` when the workflow is disabled (scheduling is ' +
      'not applicable) or if the cron expression could not be parsed.',
    nullable: true,
  })
  nextRun!: Date | null;
}

/**
 * Documentation adapter for `WorkflowRunListItem`
 * (`runs/workflow-runs.types.ts`) — one row of the bounded (last 10)
 * recent-runs list.
 */
export class WorkflowRunListItemDto implements WorkflowRunListItem {
  @ApiProperty({ description: 'The workflow-run ID.' })
  id!: string;

  @ApiProperty({
    description: 'The run status.',
    enum: workflowRunStatuses,
    example: 'success',
  })
  status!: WorkflowRunStatus;

  @ApiProperty({
    description: 'How this run was triggered.',
    enum: workflowRunTriggerTypes,
    example: 'manual',
  })
  triggerType!: WorkflowRunTriggerType;

  @ApiProperty({ description: 'When execution started.', nullable: true })
  startedAt!: Date | null;

  @ApiProperty({
    description: 'When execution finished.',
    nullable: true,
  })
  finishedAt!: Date | null;

  @ApiProperty({
    description:
      'Run duration in milliseconds. `null` if `startedAt`/`finishedAt` ' +
      'are not both set.',
    nullable: true,
    example: 3800,
  })
  durationMs!: number | null;

  @ApiProperty({
    description:
      'The `stepKey` of the step that failed, when `status` is ' +
      '`failed`. `null` for a non-failed run, or for a failed run with ' +
      'no resolvable failed step.',
    nullable: true,
    example: null,
  })
  failedStepKey!: string | null;
}

/**
 * Documentation adapter for `WorkflowOverviewResponse`
 * (`workflows.types.ts`) — the single-request payload for the
 * workflow-overview page: full workflow detail plus operational-summary
 * metrics and the last 10 runs.
 */
export class WorkflowOverviewResponseDto
  extends WorkflowDetailResponseDto
  implements WorkflowOverviewResponse
{
  @ApiProperty({
    description: "The workflow's operational-summary metrics.",
    type: WorkflowRunSummaryMetricsDto,
  })
  metrics!: WorkflowRunSummaryMetricsDto;

  @ApiProperty({
    description:
      'The 10 most recently created runs, most recent first. Empty if ' +
      'the workflow has never been run.',
    type: [WorkflowRunListItemDto],
  })
  recentRuns!: WorkflowRunListItemDto[];
}
