import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CronJob } from 'cron';
import { DatabaseService } from '../../../database/database.service';
import { workflows } from '../../../database/schema';
import type { Workflow } from '../../../database/schema/types';
import { WorkflowRunsService } from '../runs/workflow-runs.service';
import { readSchedulerConfig } from './scheduler.config';

/**
 * Keeps one real, timer-backed `CronJob` per `enabled: true` workflow,
 * firing scheduled runs through `WorkflowRunsService.executeScheduled`.
 * Entirely opt-in via `SCHEDULER_ENABLED` (see `scheduler.config.ts`) —
 * when disabled, this service registers nothing and every public method
 * is a no-op, so manual execution (`executeManual`) is completely
 * unaffected either way.
 *
 * The in-memory `jobs` registry is the only source of truth for "what's
 * currently scheduled" — it is populated once at
 * `onApplicationBootstrap` from every `enabled: true` workflow row, and
 * kept in sync afterward only by `WorkflowsService` calling
 * `registerOrReplace`/`unregister` after each successful create/update/
 * replace/delete. There is no periodic re-sync: if the registry and the
 * database ever disagree (e.g. a row edited directly, bypassing the
 * API), the discrepancy persists until the next mutation through
 * `WorkflowsService` or the next process restart.
 */
@Injectable()
export class WorkflowSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkflowSchedulerService.name);
  private readonly jobs = new Map<string, CronJob>();
  private readonly config = readSchedulerConfig();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly workflowRunsService: WorkflowRunsService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log(
        'Scheduler disabled (SCHEDULER_ENABLED not set); no jobs registered.',
      );
      return;
    }

    const enabledWorkflows = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.enabled, true));

    for (const workflow of enabledWorkflows) {
      this.registerJob(workflow);
    }
    this.logger.log(
      `Scheduler enabled: registered ${this.jobs.size} job(s).`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    for (const job of this.jobs.values()) {
      await job.stop();
    }
    this.jobs.clear();
  }

  /**
   * Called by `WorkflowsService` after create/update/replace succeeds.
   * Re-reads the row itself rather than trusting a caller-passed
   * snapshot, so it always registers exactly what's persisted. If the
   * workflow is missing or `enabled: false`, any existing job for it is
   * removed instead. No-op entirely when the scheduler is disabled.
   */
  async registerOrReplace(workflowId: string): Promise<void> {
    if (!this.config.enabled) return;

    const [workflow] = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.id, workflowId));

    if (!workflow || !workflow.enabled) {
      this.unregister(workflowId);
      return;
    }

    this.registerJob(workflow);
  }

  /**
   * Called by `WorkflowsService` after delete. Safe no-op if no job is
   * currently registered for this id (including when the scheduler is
   * disabled, since nothing is ever registered in that case).
   */
  unregister(workflowId: string): void {
    const existing = this.jobs.get(workflowId);
    if (existing) {
      void existing.stop();
      this.jobs.delete(workflowId);
    }
  }

  /** Test-only introspection of the current registry. No production caller. */
  getRegisteredWorkflowIds(): string[] {
    return [...this.jobs.keys()];
  }

  /** Test-only: the real `CronJob` instance registered for a workflow, if
   *  any — lets a test call its public `fireOnTick()` to verify the
   *  `onTick` wiring without waiting for a real cron fire. No production
   *  caller. */
  getRegisteredJob(workflowId: string): CronJob | undefined {
    return this.jobs.get(workflowId);
  }

  private registerJob(workflow: Workflow): void {
    this.unregister(workflow.id);

    try {
      const job = CronJob.from({
        cronTime: workflow.cronExpression,
        timeZone: workflow.timezone,
        start: true,
        // Without this, `cron` fires `onTick` and moves on without
        // awaiting it — two ticks of the same job could then overlap if
        // one tick's `handleTick` is still running when the next fires.
        // Waiting keeps at most one execution of a given job in flight
        // at a time, consistent with the `overlapPolicy: 'skip'`
        // enforcement `executeScheduled` already performs.
        waitForCompletion: true,
        onTick: () => this.handleTick(workflow.id),
        // Backstop: `handleTick` already has its own try/catch, but this
        // guards against anything `cron` itself considers unhandled
        // (e.g. a synchronous throw before that try/catch is reached),
        // so a single workflow's failure can never crash the process.
        errorHandler: (error) => {
          this.logger.error(
            `Unhandled error in scheduled tick for workflow ${workflow.id}.`,
            error instanceof Error ? error.stack : String(error),
          );
        },
      });
      this.jobs.set(workflow.id, job);
    } catch (error) {
      // Defensive: cronExpression/timezone are already validated at
      // write time (IsCronExpression/IsIanaTimeZone), so this should be
      // unreachable in practice.
      this.logger.error(
        `Failed to construct CronJob for workflow ${workflow.id}; not scheduled.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * The actual tick handler, deliberately a separate, directly callable
   * method (not inlined in the `onTick` closure) so tests can invoke it
   * without waiting for a real cron fire.
   */
  async handleTick(workflowId: string): Promise<void> {
    try {
      const [workflow] = await this.db
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflowId));

      if (!workflow || !workflow.enabled) {
        // Deleted or disabled between the last registry sync and this
        // tick firing; stop it defensively rather than executing.
        this.unregister(workflowId);
        return;
      }

      this.logger.log(`Scheduled tick fired for workflow ${workflowId}.`);

      const run = await this.workflowRunsService.executeScheduled(
        workflow.projectId,
        workflow.id,
      );

      // `executeScheduled` itself already logs the overlap-skip case
      // (see `WorkflowRunsService`) — `run === null` here is that same
      // skip, not logged again to avoid duplicating that message.
      if (run) {
        this.logger.log(
          `Scheduled run ${run.id} for workflow ${workflowId} finished with status "${run.status}".`,
        );
      }
    } catch (error) {
      // One workflow's scheduled failure must never affect other jobs'
      // registrations or the scheduler's own lifecycle.
      // `executeScheduled` already persists a mid-run failure onto the
      // `workflow_runs` row itself; this catch only guards errors
      // outside that (e.g. an unexpected DB error while re-reading the
      // workflow row above).
      this.logger.error(
        `Scheduled execution failed for workflow ${workflowId}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
