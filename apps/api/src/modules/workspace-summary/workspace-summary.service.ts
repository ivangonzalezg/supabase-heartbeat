import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { projects, workflows } from '../../database/schema';
import type { Project, Workflow } from '../../database/schema/types';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import type { ProjectResponse } from '../projects/projects.types';
import type { WorkflowResponse } from '../workflows/workflows.types';
import type { WorkspaceSummaryResponse } from './workspace-summary.types';

@Injectable()
export class WorkspaceSummaryService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * The actor's own projects and workflows across every project, fetched
   * in a single round-trip. Full field set (same shape as `GET
   * /api/projects` and `GET /api/projects/:projectId/workflows`), minus
   * step data — this trades payload size for round-trip count, since the
   * point of this endpoint is avoiding an N+1 request pattern from the
   * frontend, not minimizing bytes on the wire.
   */
  async get(actor: AuthenticatedActor): Promise<WorkspaceSummaryResponse> {
    const [projectRows, workflowRows] = await Promise.all([
      this.db
        .select()
        .from(projects)
        .where(eq(projects.ownerId, actor.userId))
        .orderBy(desc(projects.createdAt)),
      this.db
        .select({
          id: workflows.id,
          projectId: workflows.projectId,
          name: workflows.name,
          description: workflows.description,
          cronExpression: workflows.cronExpression,
          timezone: workflows.timezone,
          enabled: workflows.enabled,
          overlapPolicy: workflows.overlapPolicy,
          createdAt: workflows.createdAt,
          updatedAt: workflows.updatedAt,
        })
        .from(workflows)
        .innerJoin(projects, eq(projects.id, workflows.projectId))
        .where(eq(projects.ownerId, actor.userId))
        .orderBy(desc(workflows.createdAt)),
    ]);

    return {
      projects: projectRows.map(toProjectResponse),
      workflows: workflowRows.map(toWorkflowResponse),
    };
  }
}

function toProjectResponse(row: Project): ProjectResponse {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    supabaseUrl: row.supabaseUrl,
    publishableKey: row.publishableKey,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWorkflowResponse(row: Workflow): WorkflowResponse {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    cronExpression: row.cronExpression,
    timezone: row.timezone,
    enabled: row.enabled,
    overlapPolicy: row.overlapPolicy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
