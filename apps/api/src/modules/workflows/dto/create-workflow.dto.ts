import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  workflowOverlapPolicies,
  type WorkflowOverlapPolicy,
} from '../../../database/schema/types';
import { IsCronExpression } from '../validation/cron-expression.validator';
import { IsIanaTimeZone } from '../validation/time-zone.validator';
import { CreateWorkflowStepDto } from '../steps/dto/create-workflow-step.dto';
import { MAX_STEPS_PER_WORKFLOW } from '../steps/validation/workflow-step.validator';
import { IsWorkflowStepArray } from '../steps/validation/workflow-step-array.validator';

const NAME_MAX_LENGTH = 200;

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateWorkflowDto {
  @ApiProperty({
    description: 'Human-readable workflow name.',
    example: 'Nightly heartbeat',
    maxLength: NAME_MAX_LENGTH,
  })
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(NAME_MAX_LENGTH)
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional free-text description of the workflow.',
    example: 'Pings the project every 6 hours to keep it active.',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  description?: string;

  @ApiProperty({
    description:
      'Cron expression (5-field minute-precision or 6-field second-precision, ' +
      'including macros like "@daily"), using the same parser the future ' +
      'scheduler will use.',
    example: '0 */6 * * *',
  })
  @Transform(({ value }) => trim(value))
  @IsCronExpression()
  cronExpression!: string;

  @ApiProperty({
    description: 'IANA time zone identifier.',
    example: 'America/Bogota',
  })
  @Transform(({ value }) => trim(value))
  @IsIanaTimeZone()
  timezone!: string;

  @ApiPropertyOptional({
    description: 'Whether the workflow is enabled. Defaults to true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Policy applied when a scheduled run starts while a previous run is ' +
      'still in progress. Only "skip" is currently implemented.',
    enum: workflowOverlapPolicies,
    example: 'skip',
  })
  @IsOptional()
  @IsIn(workflowOverlapPolicies)
  overlapPolicy?: WorkflowOverlapPolicy;

  @ApiProperty({
    description:
      "The complete ordered list of the workflow's initial steps. " +
      'Array order defines persisted position: steps[0] becomes position ' +
      '0, steps[1] becomes position 1, and so on. At least one step is ' +
      'required (a workflow without steps is not created through this ' +
      `endpoint) and at most ${MAX_STEPS_PER_WORKFLOW} steps are allowed. ` +
      'Duplicate stepKey values are rejected. The workflow and every ' +
      'step are created together in a single database transaction — if ' +
      'any step is invalid, nothing is persisted.',
    type: [CreateWorkflowStepDto],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'steps must contain at least one step' })
  @ArrayMaxSize(MAX_STEPS_PER_WORKFLOW)
  @ValidateNested({ each: true })
  @Type(() => CreateWorkflowStepDto)
  @IsWorkflowStepArray()
  steps!: CreateWorkflowStepDto[];
}
