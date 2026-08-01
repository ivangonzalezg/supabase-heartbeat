import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { toAuthenticatedActor } from '../../../lib/authorization/current-actor';
import { WorkflowRunResponseDto } from './dto/workflow-run-response.dto';
import { WorkflowRunsService } from './workflow-runs.service';
import type { WorkflowRunDetailResponse } from './workflow-runs.types';

@ApiTags('Workflow Runs')
@ApiCookieAuth('better-auth.session_token')
@ApiUnauthorizedResponse({ description: 'No authenticated session.' })
@ApiParam({ name: 'projectId', description: 'The parent project ID.' })
@ApiParam({ name: 'workflowId', description: 'The workflow to execute.' })
@Controller('projects/:projectId/workflows/:workflowId/runs')
export class WorkflowRunsController {
  constructor(private readonly workflowRunsService: WorkflowRunsService) {}

  @Post()
  @Roles(['admin'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Manually execute a workflow',
    description:
      "Admin only. Synchronously executes the workflow's enabled steps, " +
      'in ascending position order, using one isolated Supabase ' +
      'execution context shared by every step in this run. The HTTP ' +
      'request remains open until the run finishes — there is no ' +
      'background job or polling; the response is the completed run. ' +
      'Manual execution is allowed even when the workflow itself is ' +
      'disabled (`enabled: false`) — that flag only governs future ' +
      'scheduled execution, not an explicit administrator-triggered run. ' +
      'Disabled steps are skipped entirely: they are never executed and ' +
      'never produce a step-run record. Execution stops at the first ' +
      'step that fails for a technical reason (including an ' +
      'unimplemented step type); later steps are neither executed nor ' +
      'recorded. A workflow with zero enabled steps completes ' +
      'immediately as a successful run with an empty step-run list. ' +
      'A `201` response means the run was created and finished ' +
      'processing — it does **not** mean the workflow steps all ' +
      'succeeded: check `status` in the response body (`"success"` or ' +
      '`"failed"`) for the actual outcome. No implicit `signout` is ever ' +
      'performed; a session is only cleared by an explicit `signout` ' +
      'step. No request body is accepted.',
  })
  @ApiCreatedResponse({
    description:
      'The completed workflow run and its ordered step runs. Present ' +
      'even when `status` is `"failed"` — a failed workflow execution ' +
      'is still a successfully created and processed run resource.',
    type: WorkflowRunResponseDto,
  })
  @ApiForbiddenResponse({ description: 'The actor is not an admin.' })
  @ApiNotFoundResponse({
    description:
      'The project or workflow does not exist, or is not accessible to ' +
      'the current actor. No run is created in this case.',
  })
  @ApiInternalServerErrorResponse({
    description:
      'The run record itself could not be created due to an ' +
      'unexpected infrastructure failure. No executor was invoked. ' +
      'Distinct from a workflow execution failure, which is reported ' +
      'as `201` with `status: "failed"`.',
  })
  async execute(
    @Session() session: UserSession,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
  ): Promise<WorkflowRunDetailResponse> {
    return this.workflowRunsService.executeManual(
      toAuthenticatedActor(session),
      projectId,
      workflowId,
    );
  }
}
