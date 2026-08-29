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
import { OverviewService } from './overview.service';
import type { OverviewResponse } from './overview.types';

@ApiTags('Overview')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'No authenticated session.' })
@Controller('overview')
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get()
  @ApiOperation({
    summary:
      "Read the authenticated user's global overview across every project",
    description:
      'A single-request payload for the global Overview dashboard: ' +
      'aggregate metrics across every owned project/workflow (windowed to ' +
      'the last 7 days for run counts), a summary row per project, the ' +
      '10 most recent runs across every project, and the next 10 ' +
      'upcoming scheduled runs across every enabled workflow. Both admin ' +
      "and viewer may call this; scoped to the actor's own projects.",
  })
  @ApiOkResponse({ description: "The actor's global overview." })
  async get(@Session() session: UserSession): Promise<OverviewResponse> {
    return this.overviewService.get(toAuthenticatedActor(session));
  }
}
