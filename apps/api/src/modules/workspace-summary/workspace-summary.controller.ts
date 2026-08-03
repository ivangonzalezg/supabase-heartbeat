import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { toAuthenticatedActor } from '../../lib/authorization/current-actor';
import { WorkspaceSummaryService } from './workspace-summary.service';
import type { WorkspaceSummaryResponse } from './workspace-summary.types';

@ApiTags('Workspace Summary')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'No authenticated session.' })
@Controller('workspace-summary')
export class WorkspaceSummaryController {
  constructor(
    private readonly workspaceSummaryService: WorkspaceSummaryService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "Lightweight summary of the authenticated user's projects and workflows",
    description:
      "Minimal fields only (id, name, enabled, and each workflow's parent " +
      'projectId) for rendering a project/workflow switcher; not a ' +
      'substitute for the full Projects/Workflows list or detail ' +
      'endpoints. Both admin and viewer may call this; scoped to the ' +
      "actor's own projects.",
  })
  @ApiOkResponse({ description: "The actor's projects and workflows summary." })
  async get(
    @Session() session: UserSession,
  ): Promise<WorkspaceSummaryResponse> {
    return this.workspaceSummaryService.get(toAuthenticatedActor(session));
  }
}
