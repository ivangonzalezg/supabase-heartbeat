import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateWorkflowStepDto } from './create-workflow-step.dto';

/**
 * A step entry within the aggregate workflow-replace endpoint's `steps`
 * array. Identical to `CreateWorkflowStepDto` except for the added
 * optional `id`: present, it identifies an existing step row to update
 * in place (preserving its `id`/`createdAt`); absent, the entry is
 * treated as a new step to insert. `id` is never validated against the
 * shared step schema (`IsWorkflowStepInput`/`IsWorkflowStepArray` only
 * inspect `stepKey`/`type`/`configuration`/`enabled`), so its presence
 * has no effect on per-step shape validation.
 */
export class ReplaceWorkflowStepDto extends CreateWorkflowStepDto {
  @ApiPropertyOptional({
    description:
      'ID of an existing step to update in place. Omit to create a new ' +
      "step. An id that does not match any of this workflow's current " +
      'steps is treated as a new step (its value is discarded and a new ' +
      'id is assigned).',
  })
  @IsOptional()
  @IsString()
  id?: string;
}
