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
import { ReplaceWorkflowDto } from './dto/replace-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import {
  WorkflowDetailResponseDto,
  WorkflowOverviewResponseDto,
  WorkflowResponseDto,
} from './dto/workflow-response.dto';
import { WorkflowsService } from './workflows.service';
import type {
  WorkflowDetailResponse,
  WorkflowOverviewResponse,
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
  @ApiOkResponse({
    description: "The project's workflows.",
    type: [WorkflowResponseDto],
  })
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
    type: WorkflowDetailResponseDto,
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
    type: WorkflowDetailResponseDto,
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

  @Get(':workflowId/overview')
  @ApiOperation({
    summary:
      "Read a workflow's complete overview: detail, steps, operational " +
      'summary metrics, and its 10 most recent runs',
    description:
      'Both admin and viewer may call this. A strict superset of ' +
      '`GET :workflowId` — includes everything that endpoint returns ' +
      '(name, schedule, steps, ...) plus `metrics` (total runs, success ' +
      'rate, failed runs, average duration, last run, next scheduled ' +
      'run) and `recentRuns` (the 10 most recently created runs, most ' +
      'recent first). `metrics.successRate` is the percentage of ' +
      'concluded runs (excluding `pending`/`running`) that ended ' +
      '`success`, `null` if none have concluded yet. `metrics.nextRun` ' +
      'is `null` whenever the workflow is disabled — scheduling does ' +
      'not apply to a disabled workflow. Intended for a single-page ' +
      'workflow overview UI that would otherwise need this endpoint ' +
      'plus a separate runs-list/metrics request. A workflow that does ' +
      'not exist, belongs to a different project, or whose project is ' +
      'owned by another user is reported as 404, identically in every ' +
      'case.',
  })
  @ApiOkResponse({
    description:
      'The requested workflow, including its ordered steps, operational ' +
      'summary metrics, and 10 most recent runs.',
    type: WorkflowOverviewResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      'The project or workflow does not exist, or is not accessible to ' +
      'the current actor.',
  })
  async findOverview(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
  ): Promise<WorkflowOverviewResponse> {
    return this.workflowsService.findOverview(
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
  @ApiOkResponse({
    description: 'The updated workflow.',
    type: WorkflowResponseDto,
  })
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

  @Put(':workflowId')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Replace a workflow and its complete ordered step list',
    description:
      'Admin only, ownership-scoped through the parent project. Unlike ' +
      '`PATCH :workflowId` (metadata-only, partial), this replaces the ' +
      "workflow's metadata AND its steps together in a single database " +
      'transaction. Each entry in `steps` with an `id` updates that ' +
      'existing step in place; an entry with no `id` (or an `id` not ' +
      "matching any of the workflow's current steps) creates a new " +
      'step; any current step whose `id` is absent from `steps` is ' +
      'deleted. Array order defines the persisted position (steps[0] is ' +
      'position 0, and so on). At least one step is required. If any ' +
      'part of the operation fails, nothing is persisted. A workflow ' +
      'that does not exist, belongs to a different project, or whose ' +
      'project is owned by another user is reported as 404.',
  })
  @ApiOkResponse({
    description: 'The updated workflow, including its ordered steps.',
    type: WorkflowDetailResponseDto,
  })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description:
      'The project or workflow does not exist, or is not accessible to ' +
      'the current actor.',
  })
  async replace(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Body() input: ReplaceWorkflowDto,
  ): Promise<WorkflowDetailResponse> {
    return this.workflowsService.replace(
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
