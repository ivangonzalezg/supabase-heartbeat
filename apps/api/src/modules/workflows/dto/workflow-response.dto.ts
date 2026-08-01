import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  workflowOverlapPolicies,
  type WorkflowOverlapPolicy,
} from '../../../database/schema/types';
import { WorkflowStepResponseDto } from '../steps/dto/workflow-step-response.dto';
import type {
  WorkflowDetailResponse,
  WorkflowResponse,
} from '../workflows.types';

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
