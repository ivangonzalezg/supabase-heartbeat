import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { CronJob } from 'cron';
import { DatabaseService } from '../../database/database.service';
import {
  projects,
  workflows,
  workflowRuns,
  workflowSteps,
  stepRuns,
} from '../../database/schema';
import type { Project, WorkflowRunStatus } from '../../database/schema/types';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import type { CreateProjectDto } from './dto/create-project.dto';
import { isEmptyUpdate, type UpdateProjectDto } from './dto/update-project.dto';
import { ProjectNotFoundError } from './projects.errors';
import type {
  ProjectOverviewResponse,
  ProjectRecentRunItem,
  ProjectResponse,
  ProjectSummaryMetrics,
  ProjectWorkflowSummary,
} from './projects.types';

const RECENT_RUNS_LIMIT = 10;
const RECENT_ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ProjectsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Only projects owned by the actor, ordered by creation date descending
   * (most recently created project first).
   */
  async list(actor: AuthenticatedActor): Promise<ProjectResponse[]> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, actor.userId))
      .orderBy(desc(projects.createdAt));

    return rows.map(toProjectResponse);
  }

  async create(
    actor: AuthenticatedActor,
    input: CreateProjectDto,
  ): Promise<ProjectResponse> {
    this.assertCanMutate(actor);

    const [row] = await this.db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        ownerId: actor.userId,
        name: input.name,
        description: input.description ?? null,
        supabaseUrl: input.supabaseUrl,
        publishableKey: input.publishableKey,
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      })
      .returning();

    return toProjectResponse(row);
  }

  async findById(
    actor: AuthenticatedActor,
    projectId: string,
  ): Promise<ProjectResponse> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.ownerId, actor.userId)),
      );

    if (!row) {
      throw new ProjectNotFoundError();
    }

    return toProjectResponse(row);
  }

  /**
   * A strict superset of `findById`: the project itself plus aggregate
   * operational-summary metrics, a summary row per workflow, and the
   * last `RECENT_RUNS_LIMIT` runs across every workflow in the project —
   * so the project-overview page never needs a second request. Queries
   * the `workflows`/`workflowRuns`/`workflowSteps` tables directly
   * (rather than depending on `WorkflowsService`/`WorkflowRunsService`),
   * matching this codebase's existing precedent of services reaching
   * into schema tables owned by another module directly instead of
   * introducing a cross-module service dependency.
   */
  async findOverview(
    actor: AuthenticatedActor,
    projectId: string,
  ): Promise<ProjectOverviewResponse> {
    const project = await this.findById(actor, projectId);

    const workflowRows = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, projectId))
      .orderBy(desc(workflows.createdAt));

    const workflowIds = workflowRows.map((row) => row.id);
    const lastRunByWorkflowId =
      await this.computeLastRunByWorkflow(workflowIds);

    const workflowSummaries: ProjectWorkflowSummary[] = workflowRows.map(
      (row) => {
        const lastRun = lastRunByWorkflowId.get(row.id) ?? null;
        return {
          id: row.id,
          name: row.name,
          enabled: row.enabled,
          cronExpression: row.cronExpression,
          timezone: row.timezone,
          lastRun: lastRun?.startedAt ?? null,
          lastStatus: lastRun?.status ?? null,
          nextRun: this.computeNextRun(row),
        };
      },
    );

    const [windowedCounts, lastActivity, recentRuns] = await Promise.all([
      this.computeWindowedCounts(workflowIds),
      this.computeLastActivity(workflowIds),
      this.computeRecentRuns(workflowIds, workflowRows),
    ]);

    const metrics: ProjectSummaryMetrics = {
      totalWorkflows: workflowRows.length,
      activeWorkflows: workflowRows.filter((row) => row.enabled).length,
      totalRuns: windowedCounts.total,
      failedRuns: windowedCounts.failed,
      lastActivity,
      nextRun:
        workflowSummaries
          .filter((summary) => summary.enabled && summary.nextRun !== null)
          .map((summary) => summary.nextRun as Date)
          .sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
    };

    return {
      ...project,
      metrics,
      workflows: workflowSummaries,
      recentRuns,
    };
  }

  private computeNextRun(
    workflow: Pick<
      ProjectWorkflowSummary,
      'cronExpression' | 'timezone' | 'enabled'
    >,
  ): Date | null {
    if (!workflow.enabled) {
      return null;
    }
    try {
      const job = CronJob.from({
        cronTime: workflow.cronExpression,
        timeZone: workflow.timezone,
        // `onTick` is required by the type signature but never invoked —
        // this `CronJob` is never `.start()`ed, only used for its
        // `.nextDate()` date-math utility. No scheduler is introduced.
        onTick: () => {},
      });
      return job.nextDate().toJSDate();
    } catch {
      // Defensive: cronExpression is already validated at write time
      // (IsCronExpression), so this should be unreachable in practice.
      return null;
    }
  }

  private async computeLastRunByWorkflow(
    workflowIds: string[],
  ): Promise<
    Map<string, { startedAt: Date | null; status: WorkflowRunStatus }>
  > {
    if (workflowIds.length === 0) {
      return new Map();
    }

    // All runs for these workflows, most recent first — the first row
    // encountered per `workflowId` is that workflow's last run. Simpler
    // and more portable than a correlated `MAX(created_at)` subquery, at
    // the cost of scanning every run row for these workflows rather than
    // one row per workflow; acceptable given a project's workflow count
    // is small and this mirrors `computeLastRun`'s own single-workflow
    // shape (`workflow-runs.service.ts`), just batched.
    const rows = await this.db
      .select({
        workflowId: workflowRuns.workflowId,
        status: workflowRuns.status,
        startedAt: workflowRuns.startedAt,
      })
      .from(workflowRuns)
      .where(inArray(workflowRuns.workflowId, workflowIds))
      .orderBy(desc(workflowRuns.createdAt));

    const map = new Map<
      string,
      { startedAt: Date | null; status: (typeof rows)[number]['status'] }
    >();
    for (const row of rows) {
      if (!map.has(row.workflowId)) {
        map.set(row.workflowId, {
          startedAt: row.startedAt,
          status: row.status,
        });
      }
    }
    return map;
  }

  private async computeWindowedCounts(
    workflowIds: string[],
  ): Promise<{ total: number; failed: number }> {
    if (workflowIds.length === 0) {
      return { total: 0, failed: 0 };
    }

    const since = new Date(Date.now() - RECENT_ACTIVITY_WINDOW_MS);
    const rows = await this.db
      .select({
        status: workflowRuns.status,
        count: sql<number>`count(*)`,
      })
      .from(workflowRuns)
      .where(
        and(
          inArray(workflowRuns.workflowId, workflowIds),
          gte(workflowRuns.createdAt, since),
        ),
      )
      .groupBy(workflowRuns.status);

    let total = 0;
    let failed = 0;
    for (const row of rows) {
      const count = Number(row.count);
      total += count;
      if (row.status === 'failed') failed += count;
    }
    return { total, failed };
  }

  private async computeLastActivity(
    workflowIds: string[],
  ): Promise<Date | null> {
    if (workflowIds.length === 0) {
      return null;
    }

    const [row] = await this.db
      .select({ startedAt: workflowRuns.startedAt })
      .from(workflowRuns)
      .where(
        and(
          inArray(workflowRuns.workflowId, workflowIds),
          isNotNull(workflowRuns.startedAt),
        ),
      )
      .orderBy(desc(workflowRuns.createdAt))
      .limit(1);

    return row?.startedAt ?? null;
  }

  private async computeRecentRuns(
    workflowIds: string[],
    workflowRows: { id: string; name: string }[],
  ): Promise<ProjectRecentRunItem[]> {
    if (workflowIds.length === 0) {
      return [];
    }

    const workflowNameById = new Map(
      workflowRows.map((row) => [row.id, row.name]),
    );

    const runs = await this.db
      .select()
      .from(workflowRuns)
      .where(inArray(workflowRuns.workflowId, workflowIds))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(RECENT_RUNS_LIMIT);

    const failedStepKeyByRunId = await this.resolveFailedSteps(
      runs.filter((run) => run.status === 'failed').map((run) => run.id),
    );

    return runs.map((run) => ({
      id: run.id,
      workflowId: run.workflowId,
      workflowName: workflowNameById.get(run.workflowId) ?? '',
      status: run.status,
      triggerType: run.triggerType,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs:
        run.startedAt && run.finishedAt
          ? run.finishedAt.getTime() - run.startedAt.getTime()
          : null,
      failedStepKey: failedStepKeyByRunId.get(run.id) ?? null,
    }));
  }

  private async resolveFailedSteps(
    failedRunIds: string[],
  ): Promise<Map<string, string>> {
    if (failedRunIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        workflowRunId: stepRuns.workflowRunId,
        stepKey: workflowSteps.stepKey,
      })
      .from(stepRuns)
      .innerJoin(workflowSteps, eq(stepRuns.workflowStepId, workflowSteps.id))
      .where(
        and(
          inArray(stepRuns.workflowRunId, failedRunIds),
          eq(stepRuns.status, 'failed'),
        ),
      );

    const map = new Map<string, string>();
    for (const row of rows) {
      if (!map.has(row.workflowRunId)) {
        map.set(row.workflowRunId, row.stepKey);
      }
    }
    return map;
  }

  async update(
    actor: AuthenticatedActor,
    projectId: string,
    input: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    this.assertCanMutate(actor);

    if (isEmptyUpdate(input)) {
      throw new BadRequestException('At least one field must be provided.');
    }

    const [row] = await this.db
      .update(projects)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.supabaseUrl === undefined
          ? {}
          : { supabaseUrl: input.supabaseUrl }),
        ...(input.publishableKey === undefined
          ? {}
          : { publishableKey: input.publishableKey }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        updatedAt: new Date(),
      })
      .where(
        and(eq(projects.id, projectId), eq(projects.ownerId, actor.userId)),
      )
      .returning();

    if (!row) {
      throw new ProjectNotFoundError();
    }

    return toProjectResponse(row);
  }

  async delete(actor: AuthenticatedActor, projectId: string): Promise<void> {
    this.assertCanMutate(actor);

    const deletedRows = await this.db
      .delete(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.ownerId, actor.userId)),
      )
      .returning({ id: projects.id });

    if (deletedRows.length === 0) {
      throw new ProjectNotFoundError();
    }
  }

  /**
   * Mutations (create/update/delete) are admin-only. This is also enforced
   * at the HTTP layer via `@Roles(['admin'])`, so this check is a
   * defense-in-depth backstop for any caller that reaches the service
   * directly rather than through the controller.
   */
  private assertCanMutate(actor: AuthenticatedActor): void {
    if (actor.role !== 'admin') {
      throw new ForbiddenException(
        'Only admins may create, update, or delete projects.',
      );
    }
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
