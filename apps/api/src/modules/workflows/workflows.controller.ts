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
} from '@nestjs/common';
import {
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
import { toAuthenticatedActor } from '../../lib/authorization/current-actor';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowsService } from './workflows.service';
import type {
  WorkflowDetailResponse,
  WorkflowResponse,
} from './workflows.types';

@ApiTags('Workflows')
@ApiCookieAuth('better-auth.session_token')
@ApiUnauthorizedResponse({ description: 'No authenticated session.' })
@ApiParam({ name: 'projectId', description: 'The parent project ID.' })
@Controller('projects/:projectId/workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  @ApiOperation({
    summary: "List a project's workflows",
    description:
      'Returns only workflows whose parent project is owned by the ' +
      'current actor, ordered by creation date descending (most recently ' +
      'created first). Both admin and viewer may call this. A project ' +
      'owned by another user (or nonexistent) is reported as 404.',
  })
  @ApiOkResponse({ description: "The project's workflows." })
  @ApiNotFoundResponse({
    description: 'The project does not exist or is owned by another user.',
  })
  async list(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
  ): Promise<WorkflowResponse[]> {
    return this.workflowsService.list(toAuthenticatedActor(session), projectId);
  }

  @Post()
  @Roles(['admin'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a workflow together with its complete ordered step list',
    description:
      'Admin only. The parent project is always the route project ID; ' +
      'any client-provided ownership field is ignored. The workflow and ' +
      'every step in `steps` are created together in a single database ' +
      'transaction: if any step is invalid or any part of the operation ' +
      'fails, nothing is persisted. At least one step is required; array ' +
      'order defines the persisted position (steps[0] is position 0, and ' +
      'so on) — client-supplied positions are never accepted. The ' +
      'response includes the created workflow and its ordered steps in ' +
      'one payload. A project owned by another user (or nonexistent) is ' +
      'reported as 404.',
  })
  @ApiCreatedResponse({
    description: 'The created workflow, including its ordered steps.',
  })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description: 'The project does not exist or is owned by another user.',
  })
  async create(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Body() input: CreateWorkflowDto,
  ): Promise<WorkflowDetailResponse> {
    return this.workflowsService.create(
      toAuthenticatedActor(session),
      projectId,
      input,
    );
  }

  @Get(':workflowId')
  @ApiOperation({
    summary: 'Read a workflow by ID, including its ordered steps',
    description:
      'Both admin and viewer may read a workflow in their own project. ' +
      'The response includes the complete ordered step list, so a ' +
      'single-page workflow editor can load everything it needs with ' +
      'one request. A workflow that does not exist, belongs to a ' +
      'different project, or whose project is owned by another user is ' +
      'reported as 404, identically in every case.',
  })
  @ApiOkResponse({
    description: 'The requested workflow, including its ordered steps.',
  })
  @ApiNotFoundResponse({
    description:
      'The project or workflow does not exist, or is not accessible to ' +
      'the current actor.',
  })
  async findById(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
  ): Promise<WorkflowDetailResponse> {
    return this.workflowsService.findById(
      toAuthenticatedActor(session),
      projectId,
      workflowId,
    );
  }

  @Patch(':workflowId')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Partially update a workflow',
    description:
      'Admin only, ownership-scoped through the parent project. A ' +
      'workflow that does not exist, belongs to a different project, or ' +
      'whose project is owned by another user is reported as 404.',
  })
  @ApiOkResponse({ description: 'The updated workflow.' })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description:
      'The project or workflow does not exist, or is not accessible to ' +
      'the current actor.',
  })
  async update(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Body() input: UpdateWorkflowDto,
  ): Promise<WorkflowResponse> {
    return this.workflowsService.update(
      toAuthenticatedActor(session),
      projectId,
      workflowId,
      input,
    );
  }

  @Delete(':workflowId')
  @Roles(['admin'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a workflow',
    description:
      'Admin only, ownership-scoped through the parent project. Deletes ' +
      'the full owned hierarchy (steps, runs) through the existing ' +
      'database cascades. A workflow that does not exist, belongs to a ' +
      'different project, or whose project is owned by another user is ' +
      'reported as 404.',
  })
  @ApiNoContentResponse({ description: 'The workflow was deleted.' })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description:
      'The project or workflow does not exist, or is not accessible to ' +
      'the current actor.',
  })
  async delete(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
  ): Promise<void> {
    await this.workflowsService.delete(
      toAuthenticatedActor(session),
      projectId,
      workflowId,
    );
  }
}
