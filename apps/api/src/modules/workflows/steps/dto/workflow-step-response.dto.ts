import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { workflowStepTypes } from '@supabase-heartbeat/validation';
import type { WorkflowStepResponse } from '../workflow-steps.types';
import { STEP_CONFIGURATION_SCHEMAS_BY_TYPE } from './create-workflow-step.dto';

const STEP_CONFIGURATION_MODELS = Object.values(
  STEP_CONFIGURATION_SCHEMAS_BY_TYPE,
);

const STEP_TYPE_CONFIGURATION_TABLE = Object.entries(
  STEP_CONFIGURATION_SCHEMAS_BY_TYPE,
)
  .map(([type, dto]) => `\`${type}\` → \`${dto.name}\``)
  .join(', ');

/**
 * Documentation adapter for `WorkflowStepResponse`
 * (`workflow-steps.types.ts`). `implements WorkflowStepResponse` so this
 * class is checked by the compiler to stay in sync with the actual
 * response shape every controller method returns; it is never
 * constructed at runtime — services keep returning plain objects shaped
 * like `WorkflowStepResponse`; this class exists solely so
 * `@ApiOkResponse`/`@ApiCreatedResponse({ type: WorkflowStepResponseDto })`
 * has something to reference for Swagger.
 *
 * `configuration`'s response shape depends on `type`, exactly as on the
 * request side — see `CreateWorkflowStepDto.configuration` for the same
 * `oneOf`/mapping-table pattern. **Not currently redacted**: reading a
 * `signin` step back returns its stored `email`/`password` unchanged —
 * this API does not mask or omit credentials from responses (see
 * `apps/api/README.md`).
 */
@ApiExtraModels(...STEP_CONFIGURATION_MODELS)
export class WorkflowStepResponseDto implements WorkflowStepResponse {
  @ApiProperty({ description: 'The step ID.' })
  id!: string;

  @ApiProperty({ description: 'The parent workflow ID.' })
  workflowId!: string;

  @ApiProperty({
    description: 'The step key, unique within its workflow.',
    example: 'sign-in',
  })
  stepKey!: string;

  @ApiProperty({
    description: 'The step executor type.',
    enum: workflowStepTypes,
    example: 'signin',
  })
  type!: (typeof workflowStepTypes)[number];

  @ApiProperty({
    description: 'The persisted execution order (0-based, contiguous).',
    example: 0,
  })
  position!: number;

  @ApiProperty({
    description:
      "The step's stored configuration, exactly as last submitted — " +
      'not redacted. The shape below MUST correspond to `type`: ' +
      `${STEP_TYPE_CONFIGURATION_TABLE}.`,
    oneOf: STEP_CONFIGURATION_MODELS.map((model) => ({
      $ref: getSchemaPath(model),
    })),
  })
  configuration!: Record<string, unknown>;

  @ApiProperty({ description: 'Whether the step is enabled.', example: true })
  enabled!: boolean;

  @ApiProperty({ description: 'When the step was created.' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the step was last updated.' })
  updatedAt!: Date;
}
