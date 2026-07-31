import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { toAuthenticatedActor } from '../../../lib/authorization/current-actor';
import { CreateWorkflowStepDto } from './dto/create-workflow-step.dto';
import { ReorderWorkflowStepsDto } from './dto/reorder-workflow-steps.dto';
import { UpdateWorkflowStepDto } from './dto/update-workflow-step.dto';
import { WorkflowStepsService } from './workflow-steps.service';
import type { WorkflowStepResponse } from './workflow-steps.types';

@ApiTags('Workflow Steps')
@ApiCookieAuth('better-auth.session_token')
@ApiUnauthorizedResponse({ description: 'No authenticated session.' })
@ApiParam({ name: 'projectId', description: 'The parent project ID.' })
@ApiParam({ name: 'workflowId', description: 'The parent workflow ID.' })
@Controller('projects/:projectId/workflows/:workflowId/steps')
export class WorkflowStepsController {
  constructor(private readonly workflowStepsService: WorkflowStepsService) {}

  @Get()
  @ApiOperation({
    summary: "List a workflow's steps",
    description:
      'Both admin and viewer may call this. Steps are ordered by ' +
      'position ascending (persisted execution order). A project or ' +
      'workflow that does not exist, or is not accessible to the ' +
      'current actor, is reported as 404.',
  })
  @ApiOkResponse({ description: "The workflow's ordered steps." })
  @ApiNotFoundResponse({
    description:
      'The project or workflow does not exist, or is not accessible to ' +
      'the current actor.',
  })
  async list(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
  ): Promise<WorkflowStepResponse[]> {
    return this.workflowStepsService.list(
      toAuthenticatedActor(session),
      projectId,
      workflowId,
    );
  }

  @Post()
  @Roles(['admin'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Append a step to a workflow',
    description:
      'Admin only. The new step is always appended after all existing ' +
      'steps, at position `MAX(existing position) + 1` (or 0 if this is ' +
      'the first step) — a client-supplied position is never accepted. ' +
      'A `stepKey` already used by another step in the same workflow is ' +
      'reported as 409. A project or workflow that does not exist, or is ' +
      'not accessible to the current actor, is reported as 404.',
  })
  @ApiCreatedResponse({ description: 'The created step.' })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description:
      'The project or workflow does not exist, or is not accessible to ' +
      'the current actor.',
  })
  @ApiConflictResponse({
    description: 'A step with this stepKey already exists in this workflow.',
  })
  async create(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Body() input: CreateWorkflowStepDto,
  ): Promise<WorkflowStepResponse> {
    return this.workflowStepsService.create(
      toAuthenticatedActor(session),
      projectId,
      workflowId,
      input,
    );
  }

  @Put('order')
  @Roles(['admin'])
  @ApiOperation({
    summary: "Replace a workflow's complete step order",
    description:
      'Admin only. Replaces the persisted order of every step in the ' +
      'workflow in one request, for use by the frontend drag-and-drop ' +
      'workflow editor. `PUT` is used, not `PATCH`, because the request ' +
      'body replaces the complete ordering representation rather than ' +
      'describing a partial change. The `stepIds` array must contain ' +
      "every one of the workflow's current step IDs exactly once — " +
      'array order defines the final position (stepIds[0] becomes ' +
      'position 0, and so on). A missing current ID, an extra unknown ' +
      'ID, an ID belonging to another workflow, or a duplicate is ' +
      'rejected (duplicates and malformed input as 400, a mismatched ID ' +
      'set as 409) rather than silently corrected. The entire operation ' +
      'runs inside a single database transaction. Submitting the ' +
      'current order is valid and is a no-op. A project or workflow ' +
      'that does not exist, or is not accessible to the current actor, ' +
      'is reported as 404.',
  })
  @ApiOkResponse({
    description: 'The complete step list in its new order.',
  })
  @ApiBadRequestResponse({
    description:
      'The request body is malformed: `stepIds` is missing, not an ' +
      'array, empty, contains non-string or empty entries, contains a ' +
      'duplicate ID, exceeds the maximum step count, or the body ' +
      'contains an unexpected property.',
  })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description:
      'The project or workflow does not exist, or is not accessible to ' +
      'the current actor.',
  })
  @ApiConflictResponse({
    description:
      "The submitted stepIds do not exactly match the workflow's " +
      'current step set (a current step ID is missing, an unknown or ' +
      'foreign ID is included, or the count does not match).',
  })
  async reorder(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Body() input: ReorderWorkflowStepsDto,
  ): Promise<WorkflowStepResponse[]> {
    return this.workflowStepsService.reorder(
      toAuthenticatedActor(session),
      projectId,
      workflowId,
      input,
    );
  }

  @Get(':stepId')
  @ApiOperation({
    summary: 'Read a step by ID',
    description:
      'Both admin and viewer may read a step in their own project. A ' +
      'step that does not exist, belongs to a different workflow, or ' +
      'whose workflow/project is not accessible to the current actor is ' +
      'reported as 404, identically in every case.',
  })
  @ApiOkResponse({ description: 'The requested step.' })
  @ApiNotFoundResponse({
    description:
      'The project, workflow, or step does not exist, or is not ' +
      'accessible to the current actor.',
  })
  async findById(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Param('stepId') stepId: string,
  ): Promise<WorkflowStepResponse> {
    return this.workflowStepsService.findById(
      toAuthenticatedActor(session),
      projectId,
      workflowId,
      stepId,
    );
  }

  @Patch(':stepId')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Partially update a step',
    description:
      'Admin only. Accepts `stepKey`, `type`, `configuration`, and ' +
      '`enabled` — `position` is never accepted here; use ' +
      '`PUT .../steps/order` to change step order. If `type` or ' +
      '`configuration` changes, the merged result (existing step ' +
      'overridden by the patch) is re-validated as a whole pair, so ' +
      'e.g. changing only `type` while an incompatible `configuration` ' +
      'remains from before is rejected. A `stepKey` already used by ' +
      'another step in the same workflow is reported as 409.',
  })
  @ApiOkResponse({ description: 'The updated step.' })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description:
      'The project, workflow, or step does not exist, or is not ' +
      'accessible to the current actor.',
  })
  @ApiConflictResponse({
    description: 'A step with this stepKey already exists in this workflow.',
  })
  async update(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Param('stepId') stepId: string,
    @Body() input: UpdateWorkflowStepDto,
  ): Promise<WorkflowStepResponse> {
    return this.workflowStepsService.update(
      toAuthenticatedActor(session),
      projectId,
      workflowId,
      stepId,
      input,
    );
  }

  @Delete(':stepId')
  @Roles(['admin'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a step',
    description:
      'Admin only. Deletes the step and compacts the remaining steps’ ' +
      'positions to stay contiguous (e.g. deleting position 1 from ' +
      '[0,1,2,3] yields [0,1,2]). Deleting the last remaining step of a ' +
      'workflow is rejected with 409 — a workflow without steps cannot ' +
      'be created through the aggregate endpoint, and for consistency ' +
      'cannot be reached by deletion either; delete the workflow itself ' +
      'instead.',
  })
  @ApiNoContentResponse({ description: 'The step was deleted.' })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description:
      'The project, workflow, or step does not exist, or is not ' +
      'accessible to the current actor.',
  })
  @ApiConflictResponse({
    description:
      'This is the last remaining step of the workflow. Delete the ' +
      'workflow itself instead.',
  })
  async delete(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Param('stepId') stepId: string,
  ): Promise<void> {
    await this.workflowStepsService.delete(
      toAuthenticatedActor(session),
      projectId,
      workflowId,
      stepId,
    );
  }
}
