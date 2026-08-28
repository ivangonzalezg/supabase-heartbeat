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
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { toAuthenticatedActor } from '../../lib/authorization/current-actor';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';
import type {
  ProjectOverviewResponse,
  ProjectResponse,
} from './projects.types';

@ApiTags('Projects')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'No authenticated session.' })
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({
    summary: "List the authenticated user's own projects",
    description:
      'Returns only projects owned by the current actor, ordered by ' +
      'creation date descending (most recently created first). Both ' +
      'admin and viewer may call this.',
  })
  @ApiOkResponse({ description: 'The list of owned projects.' })
  async list(@Session() session: UserSession): Promise<ProjectResponse[]> {
    return this.projectsService.list(toAuthenticatedActor(session));
  }

  @Post()
  @Roles(['admin'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a project',
    description:
      'Admin only. The owner is always the authenticated actor; any ' +
      'client-provided ownership field is ignored.',
  })
  @ApiCreatedResponse({ description: 'The created project.' })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  async create(
    @Session() session: UserSession,
    @Body() input: CreateProjectDto,
  ): Promise<ProjectResponse> {
    return this.projectsService.create(toAuthenticatedActor(session), input);
  }

  @Get(':projectId')
  @ApiOperation({
    summary: 'Read a project by ID',
    description:
      'Both admin and viewer may read their own project. A project owned ' +
      'by another user is reported as 404, identically to a nonexistent ' +
      'project, so resource existence is never disclosed across owners.',
  })
  @ApiOkResponse({ description: 'The requested project.' })
  @ApiNotFoundResponse({
    description: 'The project does not exist or is owned by another user.',
  })
  async findById(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
  ): Promise<ProjectResponse> {
    return this.projectsService.findById(
      toAuthenticatedActor(session),
      projectId,
    );
  }

  @Get(':projectId/overview')
  @ApiOperation({
    summary:
      "Read a project's complete overview: project, aggregate " +
      'metrics, per-workflow summaries, and recent activity',
    description:
      'A single-request payload for the project-overview page: the ' +
      'project itself, aggregate operational-summary metrics (windowed ' +
      'to the last 7 days for run counts), a summary row per workflow ' +
      '(schedule, last/next run, last outcome), and the 10 most recent ' +
      'runs across every workflow in the project. Both admin and viewer ' +
      'may call this.',
  })
  @ApiOkResponse({ description: "The project's complete overview." })
  @ApiNotFoundResponse({
    description: 'The project does not exist or is owned by another user.',
  })
  async findOverview(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
  ): Promise<ProjectOverviewResponse> {
    return this.projectsService.findOverview(
      toAuthenticatedActor(session),
      projectId,
    );
  }

  @Patch(':projectId')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Partially update a project',
    description:
      'Admin only, ownership-scoped. A project owned by another user (or a ' +
      'nonexistent one) is reported as 404. Ownership and ID cannot be ' +
      'changed through this endpoint.',
  })
  @ApiOkResponse({ description: 'The updated project.' })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description: 'The project does not exist or is owned by another user.',
  })
  async update(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Body() input: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    return this.projectsService.update(
      toAuthenticatedActor(session),
      projectId,
      input,
    );
  }

  @Delete(':projectId')
  @Roles(['admin'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a project',
    description:
      'Admin only, ownership-scoped. Deletes the full owned hierarchy ' +
      '(workflows, steps, runs) through the existing database cascades. A ' +
      'project owned by another user (or a nonexistent one) is reported ' +
      'as 404.',
  })
  @ApiNoContentResponse({ description: 'The project was deleted.' })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description: 'The project does not exist or is owned by another user.',
  })
  async delete(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
  ): Promise<void> {
    await this.projectsService.delete(toAuthenticatedActor(session), projectId);
  }
}
