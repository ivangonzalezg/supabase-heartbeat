import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  workflowOverlapPolicies,
  type WorkflowOverlapPolicy,
} from '../../../database/schema/types';
import { IsCronExpression } from '../validation/cron-expression.validator';
import { IsIanaTimeZone } from '../validation/time-zone.validator';

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
}
