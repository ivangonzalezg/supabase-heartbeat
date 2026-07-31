import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { IsReorderStepIdsArray } from '../validation/reorder-step-ids.validator';

/**
 * The reorder endpoint's request body: the complete desired step order
 * as an array of step IDs. Array order defines the final persisted
 * position — `stepIds[0]` becomes position 0, `stepIds[1]` position 1,
 * and so on. Never accepts `positions`, `workflowId`, `projectId`,
 * `ownerId`, or `steps` — those are rejected outright by the global
 * `ValidationPipe`'s `forbidNonWhitelisted: true`, since this DTO has no
 * decorator for any of them.
 *
 * The array must contain every one of the workflow's current step IDs
 * exactly once — no missing, extra, or foreign ID. That check depends on
 * the workflow's actual current steps, so it cannot be performed by a
 * `class-validator` decorator alone; `WorkflowStepsService.reorder`
 * performs it inside the same transaction as the position updates and
 * throws `WorkflowStepOrderConflictError` (409) on any mismatch.
 */
export class ReorderWorkflowStepsDto {
  @ApiProperty({
    description:
      "The complete desired step order, as the workflow's current step " +
      'IDs. Array order defines the final persisted position: ' +
      'stepIds[0] becomes position 0, stepIds[1] becomes position 1, and ' +
      "so on. The array must contain every one of the workflow's " +
      'current step IDs exactly once — a missing ID, an extra unknown ' +
      'ID, or an ID belonging to another workflow is rejected with ' +
      '409 Conflict. Duplicate IDs are rejected with 400 Bad Request, ' +
      'never silently deduplicated.',
    example: ['step-id-c', 'step-id-a', 'step-id-b'],
    type: [String],
  })
  @IsArray()
  @IsReorderStepIdsArray()
  stepIds!: string[];
}
