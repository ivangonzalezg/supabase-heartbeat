import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { workflowStepTypes } from '@supabase-heartbeat/validation';
import { IsWorkflowStepInput } from '../validation/workflow-step.validator';

/**
 * The raw create-step input, as received over HTTP: `stepKey`, `type`,
 * `configuration`, and optional `enabled`. `id`, `workflowId`, `position`,
 * `createdAt`, and `updatedAt` are never accepted here — `position` is
 * always server-assigned (see `WorkflowStepsService`).
 *
 * Each property below carries a minimal `class-validator` decorator so
 * the global `ValidationPipe`'s `whitelist: true` does not strip it
 * before validation runs (a property with no decorator at all is
 * treated as unrecognized). The actual combined `type`/`configuration`
 * validation — the shape that makes an invalid pairing (e.g.
 * `{ type: 'wait', configuration: { table: '...' } }`) structurally
 * rejected — is `@IsWorkflowStepInput()`, using the shared
 * `@supabase-heartbeat/validation` schema (the same schema a future
 * frontend will use). `@nestjs/swagger` cannot infer that discriminated
 * shape automatically from plain class properties, so the properties
 * below exist to document the request shape for Swagger.
 */
export class CreateWorkflowStepDto {
  @ApiProperty({
    description:
      'Stable, machine-friendly identifier for this step within the ' +
      'workflow (lowercase letters, numbers, hyphens, underscores). Used ' +
      'for the uniqueness constraint and, later, step-output references.',
    example: 'sign-in',
  })
  @IsString()
  stepKey!: string;

  @ApiProperty({
    description: 'The step executor type.',
    enum: workflowStepTypes,
    example: 'signin',
  })
  @IsIn(workflowStepTypes)
  @IsWorkflowStepInput()
  type!: (typeof workflowStepTypes)[number];

  @ApiProperty({
    description:
      "The step's configuration. Its required shape depends on `type` " +
      '— see the Workflows API documentation for the schema of each ' +
      'step type.',
    example: {},
  })
  @IsObject()
  configuration!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Whether the step is enabled. Defaults to true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
