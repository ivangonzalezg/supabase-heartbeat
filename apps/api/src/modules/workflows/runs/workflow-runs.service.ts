import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, exists } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import {
  projects,
  workflows,
  workflowSteps,
  workflowRuns,
  stepRuns,
} from '../../../database/schema';
import type {
  Project,
  Workflow,
  WorkflowStep,
} from '../../../database/schema/types';
import type { AuthenticatedActor } from '../../../lib/authorization/authorization.types';
import { ProjectNotFoundError } from '../../projects/projects.errors';
import { WorkflowNotFoundError } from '../workflows.errors';
import { StepExecutorRegistry } from '../../workflow-execution/registry/step-executor.registry';
import { WorkflowExecutionContextFactory } from '../../workflow-execution/context/workflow-execution-context.factory';
import type { WorkflowExecutionContext } from '../../workflow-execution/contracts';
import { buildStepInputSnapshot } from './execution-snapshot';
import {
  buildWorkflowRunFailureMessage,
  serializeExecutionError,
} from './execution-error-serializer';
import { toExecutableWorkflowStep } from './executable-step.normalizer';
import type {
  StepRunResponse,
  WorkflowRunDetailResponse,
} from './workflow-runs.types';

/**
 * Orchestrates one manual workflow execution end to end: verifies
 * ownership, creates the `workflow_runs` row, builds one isolated
 * execution context, runs every enabled step in ascending position
 * order through `StepExecutorRegistry`, persists a `step_runs` row per
 * attempted step, stops on the first failure, and finalizes the
 * `workflow_runs` row.
 *
 * Deliberately separate from `WorkflowsService`/`WorkflowStepsService`
 * (which own CRUD, not execution) — this is the only service in the
 * codebase that calls into `@nestjs/workflow-execution`'s registry.
 *
 * Transaction boundaries (see `apps/api/README.md` "Manual workflow
 * execution" for the full rationale): the *only* `db.transaction(...)`
 * in this service wraps ownership verification, loading the project,
 * workflow, and ordered steps, and inserting the initial `workflow_runs`
 * row — everything in that transaction is a synchronous Drizzle call
 * (better-sqlite3 transactions cannot contain `await`). Every write that
 * happens after an executor call (which is asynchronous and may call
 * Supabase or wait) is a plain, individually-committed Drizzle
 * statement, never wrapped in a transaction — so no SQLite write lock is
 * ever held while this service is waiting on external/long-running work.
 */
@Injectable()
export class WorkflowRunsService {
  private readonly logger = new Logger(WorkflowRunsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly stepExecutorRegistry: StepExecutorRegistry,
    private readonly contextFactory: WorkflowExecutionContextFactory,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  async executeManual(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
  ): Promise<WorkflowRunDetailResponse> {
    this.assertCanExecute(actor);

    const { project, workflow, orderedSteps, workflowRunId, startedAt } =
      this.createRun(actor, projectId, workflowId);

    const context = this.contextFactory.create({
      projectId: project.id,
      workflowId: workflow.id,
      supabaseUrl: project.supabaseUrl,
      publishableKey: project.publishableKey,
    });

    const enabledSteps = orderedSteps.filter((step) => step.enabled);

    const stepRunResponses: StepRunResponse[] = [];
    let failureMessage: string | null = null;

    for (const step of enabledSteps) {
      const stepRunRow = await this.createStepRun(workflowRunId, step);

      try {
        const output = await this.executeStep(context, step);
        stepRunResponses.push(
          await this.finalizeStepRunSuccess(stepRunRow.id, output),
        );
      } catch (error) {
        const serialized = serializeExecutionError(error, {
          stepKey: step.stepKey,
          stepType: step.type,
        });
        stepRunResponses.push(
          await this.finalizeStepRunFailure(stepRunRow.id, serialized),
        );
        failureMessage = buildWorkflowRunFailureMessage(serialized);
        break;
      }
    }

    const finalRun = await this.finalizeWorkflowRun(
      workflowRunId,
      failureMessage,
    );

    return {
      id: finalRun.id,
      workflowId: finalRun.workflowId,
      triggerType: finalRun.triggerType,
      status: finalRun.status,
      startedAt: finalRun.startedAt ?? startedAt,
      finishedAt: finalRun.finishedAt,
      error: finalRun.error,
      stepRuns: stepRunResponses,
    };
  }

  /**
   * The one transaction in this service: proves ownership and hierarchy,
   * loads the project (for its Supabase URL/key), the workflow, and its
   * steps ordered by position, and inserts the initial `workflow_runs`
   * row — all synchronous Drizzle calls, committed together before any
   * executor is ever invoked. If the workflow/project cannot be found or
   * accessed, throws the same 404 errors as every other workflow
   * endpoint. If the insert itself fails unexpectedly, the exception
   * propagates as-is (mapped to 500 by Nest's default filter) and no
   * executor is called.
   */
  private createRun(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
  ): {
    project: Project;
    workflow: Workflow;
    orderedSteps: WorkflowStep[];
    workflowRunId: string;
    startedAt: Date;
  } {
    return this.db.transaction((tx) => {
      const [projectRow] = tx
        .select()
        .from(projects)
        .where(
          and(eq(projects.id, projectId), eq(projects.ownerId, actor.userId)),
        )
        .all();
      if (!projectRow) {
        throw new ProjectNotFoundError();
      }

      const [workflowRow] = tx
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.id, workflowId),
            eq(workflows.projectId, projectId),
            exists(
              tx
                .select()
                .from(projects)
                .where(
                  and(
                    eq(projects.id, workflows.projectId),
                    eq(projects.ownerId, actor.userId),
                  ),
                ),
            ),
          ),
        )
        .all();
      if (!workflowRow) {
        throw new WorkflowNotFoundError();
      }

      const orderedSteps = tx
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, workflowId))
        .orderBy(asc(workflowSteps.position))
        .all();

      const startedAt = new Date();
      const [runRow] = tx
        .insert(workflowRuns)
        .values({
          id: crypto.randomUUID(),
          workflowId,
          triggerType: 'manual',
          status: 'running',
          startedAt,
        })
        .returning()
        .all();

      return {
        project: projectRow,
        workflow: workflowRow,
        orderedSteps,
        workflowRunId: runRow.id,
        startedAt,
      };
    });
  }

  /** Resolves the executor for `step.type` and invokes it. May throw
   * `StepExecutorNotFoundError` (unimplemented type),
   * `InvalidPersistedStepConfigurationError` (legacy/corrupted data), a
   * `StepExecutionError` (executor-reported failure), or an unexpected
   * exception — all handled uniformly by the caller's try/catch. */
  private async executeStep(
    context: WorkflowExecutionContext,
    stepRow: WorkflowStep,
  ): Promise<Record<string, unknown> | null> {
    const executableStep = toExecutableWorkflowStep(stepRow);
    const executor = this.stepExecutorRegistry.get(stepRow.type);
    const result = await executor.execute(context, executableStep);
    return normalizeOutputForPersistence(result.output);
  }

  private async createStepRun(
    workflowRunId: string,
    step: WorkflowStep,
  ): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(stepRuns)
      .values({
        id: crypto.randomUUID(),
        workflowRunId,
        workflowStepId: step.id,
        position: step.position,
        status: 'running',
        inputSnapshot: buildStepInputSnapshot(step),
        startedAt: new Date(),
      })
      .returning();
    return row;
  }

  private async finalizeStepRunSuccess(
    stepRunId: string,
    output: Record<string, unknown> | null,
  ): Promise<StepRunResponse> {
    const [row] = await this.db
      .update(stepRuns)
      .set({
        status: 'success',
        output,
        error: null,
        finishedAt: new Date(),
      })
      .where(eq(stepRuns.id, stepRunId))
      .returning();
    return toStepRunResponse(row);
  }

  private async finalizeStepRunFailure(
    stepRunId: string,
    errorMessage: string,
  ): Promise<StepRunResponse> {
    const [row] = await this.db
      .update(stepRuns)
      .set({
        status: 'failed',
        error: errorMessage,
        finishedAt: new Date(),
      })
      .where(eq(stepRuns.id, stepRunId))
      .returning();
    return toStepRunResponse(row);
  }

  /**
   * Finalizes the workflow run as `success` (no failure occurred) or
   * `failed` (a step failed, or execution never reached any step because
   * the workflow had none enabled — that case is still `success`, see
   * below). Best-effort: if this final write itself throws, one retry is
   * attempted with the same target status before the exception is
   * allowed to propagate — no unbounded retry loop, no crash-recovery
   * reconciliation. If both attempts fail, the run can be left in
   * `running` in the database; this is a documented, accepted gap for
   * this task (see `apps/api/README.md`).
   */
  private async finalizeWorkflowRun(
    workflowRunId: string,
    failureMessage: string | null,
  ) {
    const update: {
      status: 'failed' | 'success';
      error: string | null;
      finishedAt: Date;
    } = {
      status: failureMessage ? 'failed' : 'success',
      error: failureMessage,
      finishedAt: new Date(),
    };

    try {
      const [row] = await this.db
        .update(workflowRuns)
        .set(update)
        .where(eq(workflowRuns.id, workflowRunId))
        .returning();
      return row;
    } catch (error) {
      this.logger.error(
        `Failed to finalize workflow run ${workflowRunId}; retrying once.`,
        error instanceof Error ? error.stack : undefined,
      );
      const [row] = await this.db
        .update(workflowRuns)
        .set(update)
        .where(eq(workflowRuns.id, workflowRunId))
        .returning();
      return row;
    }
  }

  private assertCanExecute(actor: AuthenticatedActor): void {
    if (actor.role !== 'admin') {
      throw new ForbiddenException(
        'Only admins may manually execute a workflow.',
      );
    }
  }
}

/**
 * `StepExecutionResult.output` is typed as `JsonValue` (which includes
 * arrays and primitives, not only objects), but `step_runs.output` is a
 * Drizzle JSON column typed as `Record<string, unknown> | null`. Every
 * current executor (`signin`, `signout`, `wait`) already returns a plain
 * object, so this normalizes defensively rather than by contract: a
 * non-object output is wrapped so it is never silently dropped, and
 * `undefined`/non-serializable results are not possible given the
 * `JsonValue` contract already enforced by `StepExecutionResult`.
 */
function normalizeOutputForPersistence(
  output: unknown,
): Record<string, unknown> | null {
  if (output === null || output === undefined) {
    return null;
  }
  if (typeof output === 'object' && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }
  return { value: output };
}

function toStepRunResponse(row: {
  id: string;
  workflowRunId: string;
  workflowStepId: string;
  position: number;
  status: string;
  inputSnapshot: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}): StepRunResponse {
  return {
    id: row.id,
    workflowRunId: row.workflowRunId,
    workflowStepId: row.workflowStepId,
    position: row.position,
    status: row.status as StepRunResponse['status'],
    inputSnapshot: row.inputSnapshot,
    output: row.output,
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}
