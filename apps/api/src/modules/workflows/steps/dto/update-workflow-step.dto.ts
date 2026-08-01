import {
  ApiExtraModels,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { workflowStepTypes } from '@supabase-heartbeat/validation';
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
 * Allows partial updates to `stepKey`, `type`, `configuration`, and
 * `enabled`. `position` is intentionally never accepted here — reordering
 * requires submitting the complete desired step order through
 * `PUT .../steps/order` (`WorkflowStepsService.reorder`), so a single
 * step's position can never drift out of sync with its siblings.
 *
 * Unlike `CreateWorkflowStepDto`, this DTO does **not** validate
 * `type`/`configuration` together by itself: an update may change only
 * one of the two (e.g. just `configuration` while `type` stays `wait`),
 * so the combined pair can only be validated once merged with the
 * step's current row — `WorkflowStepsService.update` does that merge and
 * re-validates the result via `parseWorkflowStepConfiguration`.
 *
 * Reuses `CreateWorkflowStepDto`'s `STEP_CONFIGURATION_SCHEMAS_BY_TYPE`
 * mapping for its own `configuration` `oneOf`, so the two DTOs' Swagger
 * documentation of "which configuration shape belongs to which type"
 * never drifts out of sync.
 */
@ApiExtraModels(...STEP_CONFIGURATION_MODELS)
export class UpdateWorkflowStepDto {
  @ApiPropertyOptional({
    description:
      'Stable, machine-friendly identifier for this step within the ' +
      'workflow (lowercase letters, numbers, hyphens, underscores).',
    example: 'sign-in',
  })
  @IsOptional()
  @IsString()
  stepKey?: string;

  @ApiPropertyOptional({
    description: 'The step executor type.',
    enum: workflowStepTypes,
    example: 'signin',
  })
  @IsOptional()
  @IsIn(workflowStepTypes)
  type?: (typeof workflowStepTypes)[number];

  @ApiPropertyOptional({
    description:
      "The step's configuration. If provided together with `type`, or " +
      "alone while the step's existing `type` stays the same, the " +
      'resulting merged pair is validated as a whole. The selected ' +
      'shape below MUST correspond to the (possibly merged) `type`: ' +
      `${STEP_TYPE_CONFIGURATION_TABLE}.`,
    oneOf: STEP_CONFIGURATION_MODELS.map((model) => ({
      $ref: getSchemaPath(model),
    })),
  })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Whether the step is enabled.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * `class-validator` has no built-in "at least one property present" rule
 * that fits cleanly on a DTO where every field is individually optional
 * — same convention as the Projects and Workflows modules' own
 * `isEmptyUpdate` helpers.
 */
export function isEmptyStepUpdate(dto: UpdateWorkflowStepDto): boolean {
  return (
    dto.stepKey === undefined &&
    dto.type === undefined &&
    dto.configuration === undefined &&
    dto.enabled === undefined
  );
}
