import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import {
  projects,
  workflows,
  workflowRuns,
  workflowSteps,
  stepRuns,
} from '../../database/schema';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import { computeNextRun } from '../workflows/lib/compute-next-run';
import type {
  OverviewProjectSummary,
  OverviewRecentRunItem,
  OverviewResponse,
  OverviewSummaryMetrics,
  OverviewUpcomingRun,
} from './overview.types';

const RECENT_RUNS_LIMIT = 10;
const UPCOMING_RUNS_LIMIT = 10;
const RECENT_ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface WorkflowRow {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  enabled: boolean;
  cronExpression: string;
  timezone: string;
}

@Injectable()
export class OverviewService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * The single-request payload for the global Overview dashboard: every
   * project the actor owns, every workflow across those projects (fetched
   * once, joined to its project id/name), and the aggregations derived
   * from that set. Mirrors `ProjectsService.findOverview`'s structure —
   * batched queries parameterized on a `workflowIds`/`workflowRows` list
   * rather than N per-project queries — generalized from "one project" to
   * "every project the actor owns."
   */
  async get(actor: AuthenticatedActor): Promise<OverviewResponse> {
    const projectRows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, actor.userId))
      .orderBy(desc(projects.createdAt));

    const workflowRows: WorkflowRow[] = await this.db
      .select({
        id: workflows.id,
        projectId: workflows.projectId,
        projectName: projects.name,
        name: workflows.name,
        enabled: workflows.enabled,
        cronExpression: workflows.cronExpression,
        timezone: workflows.timezone,
      })
      .from(workflows)
      .innerJoin(projects, eq(projects.id, workflows.projectId))
      .where(eq(projects.ownerId, actor.userId));

    const workflowIds = workflowRows.map((row) => row.id);

    const [windowedCounts, lastActivity, lastActivityByProjectId, recentRuns] =
      await Promise.all([
        this.computeWindowedCounts(workflowIds),
        this.computeLastActivity(workflowIds),
        this.computeLastActivityByProject(workflowRows),
        this.computeRecentRuns(workflowIds, workflowRows),
      ]);

    const upcomingAll = workflowRows
      .map((row) => ({ ...row, nextRun: computeNextRun(row) }))
      .filter(
        (row): row is WorkflowRow & { nextRun: Date } => row.nextRun !== null,
      )
      .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime());

    const upcomingRuns: OverviewUpcomingRun[] = upcomingAll
      .slice(0, UPCOMING_RUNS_LIMIT)
      .map((row) => ({
        workflowId: row.id,
        workflowName: row.name,
        projectId: row.projectId,
        projectName: row.projectName,
        nextRun: row.nextRun,
        cronExpression: row.cronExpression,
      }));

    const nextRunEntry = upcomingAll[0] ?? null;

    const metrics: OverviewSummaryMetrics = {
      totalProjects: projectRows.length,
      activeWorkflows: workflowRows.filter((row) => row.enabled).length,
      totalRuns: windowedCounts.total,
      failedRuns: windowedCounts.failed,
      lastActivity,
      nextRun: nextRunEntry?.nextRun ?? null,
      nextRunWorkflowName: nextRunEntry?.name ?? null,
      nextRunProjectName: nextRunEntry?.projectName ?? null,
    };

    const workflowsByProjectId = new Map<string, WorkflowRow[]>();
    for (const row of workflowRows) {
      const existing = workflowsByProjectId.get(row.projectId);
      if (existing) {
        existing.push(row);
      } else {
        workflowsByProjectId.set(row.projectId, [row]);
      }
    }

    const projectsSummary: OverviewProjectSummary[] = projectRows.map(
      (project) => {
        const projectWorkflows = workflowsByProjectId.get(project.id) ?? [];
        const projectUpcoming = upcomingAll.filter(
          (row) => row.projectId === project.id,
        );
        return {
          id: project.id,
          name: project.name,
          enabled: project.enabled,
          totalWorkflows: projectWorkflows.length,
          activeWorkflows: projectWorkflows.filter((row) => row.enabled).length,
          lastActivity: lastActivityByProjectId.get(project.id) ?? null,
          nextRun: projectUpcoming[0]?.nextRun ?? null,
        };
      },
    );

    return {
      metrics,
      projects: projectsSummary,
      recentRuns,
      upcomingRuns,
    };
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

  /**
   * One query fetching `{workflowId, startedAt}` for every given workflow,
   * most recent first, then grouped in-memory by `projectId` (via the
   * `workflowId -> projectId` map already available from `workflowRows`)
   * taking the first (most recent) `startedAt` seen per project — avoids
   * one query per project.
   */
  private async computeLastActivityByProject(
    workflowRows: WorkflowRow[],
  ): Promise<Map<string, Date>> {
    const workflowIds = workflowRows.map((row) => row.id);
    if (workflowIds.length === 0) {
      return new Map();
    }

    const projectIdByWorkflowId = new Map(
      workflowRows.map((row) => [row.id, row.projectId]),
    );

    const rows = await this.db
      .select({
        workflowId: workflowRuns.workflowId,
        startedAt: workflowRuns.startedAt,
      })
      .from(workflowRuns)
      .where(
        and(
          inArray(workflowRuns.workflowId, workflowIds),
          isNotNull(workflowRuns.startedAt),
        ),
      )
      .orderBy(desc(workflowRuns.createdAt));

    const map = new Map<string, Date>();
    for (const row of rows) {
      const projectId = projectIdByWorkflowId.get(row.workflowId);
      if (!projectId || map.has(projectId) || !row.startedAt) {
        continue;
      }
      map.set(projectId, row.startedAt);
    }
    return map;
  }

  private async computeRecentRuns(
    workflowIds: string[],
    workflowRows: WorkflowRow[],
  ): Promise<OverviewRecentRunItem[]> {
    if (workflowIds.length === 0) {
      return [];
    }

    const workflowById = new Map(
      workflowRows.map((row) => [
        row.id,
        {
          name: row.name,
          projectId: row.projectId,
          projectName: row.projectName,
        },
      ]),
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

    return runs.map((run) => {
      const workflow = workflowById.get(run.workflowId);
      return {
        id: run.id,
        workflowId: run.workflowId,
        workflowName: workflow?.name ?? '',
        projectId: workflow?.projectId ?? '',
        projectName: workflow?.projectName ?? '',
        status: run.status,
        triggerType: run.triggerType,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        durationMs:
          run.startedAt && run.finishedAt
            ? run.finishedAt.getTime() - run.startedAt.getTime()
            : null,
        failedStepKey: failedStepKeyByRunId.get(run.id) ?? null,
      };
    });
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
}
