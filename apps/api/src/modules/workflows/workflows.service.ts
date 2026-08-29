import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, asc, desc, eq, exists } from 'drizzle-orm';
import type { JsonValue } from '@supabase-heartbeat/validation';
import { DatabaseService } from '../../database/database.service';
import { projects, workflows, workflowSteps } from '../../database/schema';
import type { Workflow, WorkflowStep } from '../../database/schema/types';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import { ProjectNotFoundError } from '../projects/projects.errors';
import type { CreateWorkflowDto } from './dto/create-workflow.dto';
import type { ReplaceWorkflowDto } from './dto/replace-workflow.dto';
import {
  isEmptyUpdate,
  type UpdateWorkflowDto,
} from './dto/update-workflow.dto';
import { WorkflowNotFoundError } from './workflows.errors';
import type {
  WorkflowDetailResponse,
  WorkflowOverviewResponse,
  WorkflowResponse,
} from './workflows.types';
import type { WorkflowStepResponse } from './steps/workflow-steps.types';
import { validateWorkflowReferences } from './references/validate-workflow-references';
import { WorkflowRunsService } from './runs/workflow-runs.service';
import { WorkflowSchedulerService } from './scheduler/workflow-scheduler.service';
import { computeNextRun } from './lib/compute-next-run';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly workflowRunsService: WorkflowRunsService,
    private readonly workflowSchedulerService: WorkflowSchedulerService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Only workflows whose parent project belongs to the actor, ordered by
   * creation date descending (most recently created workflow first).
   */
  async list(
    actor: AuthenticatedActor,
    projectId: string,
  ): Promise<WorkflowResponse[]> {
    await this.assertOwnedProject(actor, projectId);

    const rows = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, projectId))
      .orderBy(desc(workflows.createdAt));

    return rows.map(toWorkflowResponse);
  }

  /**
   * Creates the workflow and its complete ordered step list in a single
   * transaction: if any step insert fails (or the workflow insert fails),
   * nothing is persisted. `input.steps` has already been fully validated
   * (metadata, array bounds, duplicate keys, per-step type/configuration
   * pairing) by the DTO's own decorators before this method runs, so the
   * transaction body only needs to assign positions and persist.
   *
   * `input.steps` array order **is** the proposed execution order —
   * `validateWorkflowReferences` runs against it before the transaction
   * opens, so a workflow with an invalid step-output reference (unknown
   * key, forward reference, self-reference, disabled-step reference, or
   * malformed/partial-interpolation syntax) creates neither the workflow
   * nor any step; nothing is persisted on failure, exactly like the
   * per-step insert-failure rollback this method already guarantees.
   * `configuration` is already `JsonValue`-shaped at this point (each
   * step already passed the shared Zod schema via `IsWorkflowStepArray`
   * before this method runs).
   */
  async create(
    actor: AuthenticatedActor,
    projectId: string,
    input: CreateWorkflowDto,
  ): Promise<WorkflowDetailResponse> {
    this.assertCanMutate(actor);
    await this.assertOwnedProject(actor, projectId);

    validateWorkflowReferences(
      input.steps.map((step) => ({
        stepKey: step.stepKey,
        enabled: step.enabled ?? true,
        configuration: step.configuration as JsonValue,
      })),
    );

    const result = this.db.transaction((tx) => {
      const [workflowRow] = tx
        .insert(workflows)
        .values({
          id: crypto.randomUUID(),
          projectId,
          name: input.name,
          description: input.description ?? null,
          cronExpression: input.cronExpression,
          timezone: input.timezone,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.overlapPolicy === undefined
            ? {}
            : { overlapPolicy: input.overlapPolicy }),
        })
        .returning()
        .all();

      const stepRows = input.steps.map(
        (step, position) =>
          tx
            .insert(workflowSteps)
            .values({
              id: crypto.randomUUID(),
              workflowId: workflowRow.id,
              stepKey: step.stepKey,
              type: step.type,
              position,
              configuration: step.configuration,
              ...(step.enabled === undefined ? {} : { enabled: step.enabled }),
            })
            .returning()
            .all()[0],
      );

      return {
        ...toWorkflowResponse(workflowRow),
        steps: stepRows.map(toWorkflowStepResponse),
      };
    });

    await this.workflowSchedulerService.registerOrReplace(result.id);

    return result;
  }

  async findById(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
  ): Promise<WorkflowDetailResponse> {
    await this.assertOwnedProject(actor, projectId);

    const [row] = await this.db
      .select()
      .from(workflows)
      .where(
        and(eq(workflows.id, workflowId), eq(workflows.projectId, projectId)),
      );

    if (!row) {
      throw new WorkflowNotFoundError();
    }

    const stepRows = await this.db
      .select()
      .from(workflowSteps)
      .where(eq(workflowSteps.workflowId, row.id))
      .orderBy(asc(workflowSteps.position));

    return {
      ...toWorkflowResponse(row),
      steps: stepRows.map(toWorkflowStepResponse),
    };
  }

  /**
   * A strict superset of `findById`: the same workflow detail (including
   * steps) plus operational-summary metrics and the last 10 runs, so a
   * page needing both never issues two requests. `nextRun` is computed
   * here (not in `WorkflowRunsService.getSummaryMetrics`, which has no
   * access to the workflow row) via the `cron` package, purely as a
   * date-math utility — the returned `CronJob` is never `.start()`ed, so
   * this introduces no scheduler. Always `null` when the workflow is
   * disabled, checked before `cron` is ever invoked.
   */
  async findOverview(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
  ): Promise<WorkflowOverviewResponse> {
    const detail = await this.findById(actor, projectId, workflowId);
    const { metrics, recentRuns } =
      await this.workflowRunsService.getSummaryMetrics(workflowId);

    return {
      ...detail,
      metrics: {
        ...metrics,
        nextRun: computeNextRun(detail),
      },
      recentRuns,
    };
  }

  async update(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
    input: UpdateWorkflowDto,
  ): Promise<WorkflowResponse> {
    this.assertCanMutate(actor);

    if (isEmptyUpdate(input)) {
      throw new BadRequestException('At least one field must be provided.');
    }

    const [row] = await this.db
      .update(workflows)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.cronExpression === undefined
          ? {}
          : { cronExpression: input.cronExpression }),
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.overlapPolicy === undefined
          ? {}
          : { overlapPolicy: input.overlapPolicy }),
        updatedAt: new Date(),
      })
      .where(this.ownedWorkflowCondition(actor, projectId, workflowId))
      .returning();

    if (!row) {
      throw new WorkflowNotFoundError();
    }

    await this.workflowSchedulerService.registerOrReplace(row.id);

    return toWorkflowResponse(row);
  }

  /**
   * Replaces the workflow's metadata and its complete ordered step list
   * in a single transaction, diffing `input.steps` against the current
   * rows rather than requiring the caller to issue the many separate
   * step calls `WorkflowStepsService` exposes (create/update/delete/
   * reorder). Each step entry with an `id` matching a current row
   * updates that row in place (preserving its `id`/`createdAt`); an
   * entry with no `id`, or an `id` matching no current row, is inserted
   * as a new step; any current row whose `id` is absent from
   * `input.steps` is deleted. `steps[0]` becomes position 0, `steps[1]`
   * position 1, and so on — the array order **is** the proposed final
   * execution order, validated via `validateWorkflowReferences` before
   * the transaction opens, exactly like `create`.
   *
   * Position rewrites use the same collision-safe two-pass technique as
   * `WorkflowStepsService`'s `applyContiguousPositions` (temporarily
   * offsetting every surviving/updated row before writing final
   * positions), since `(workflow_id, position)` is uniquely constrained
   * and a naive single-pass rewrite of reordered rows would collide
   * mid-write. New rows are inserted directly at their final position
   * (never occupied by a surviving row after the offset pass), and
   * deletions run first so no stale row can collide with an incoming
   * final position either.
   */
  async replace(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
    input: ReplaceWorkflowDto,
  ): Promise<WorkflowDetailResponse> {
    this.assertCanMutate(actor);
    await this.assertOwnedProject(actor, projectId);

    const [workflowRow] = await this.db
      .select()
      .from(workflows)
      .where(
        and(eq(workflows.id, workflowId), eq(workflows.projectId, projectId)),
      );
    if (!workflowRow) {
      throw new WorkflowNotFoundError();
    }

    const currentSteps = await this.db
      .select()
      .from(workflowSteps)
      .where(eq(workflowSteps.workflowId, workflowId))
      .orderBy(asc(workflowSteps.position));
    const currentStepById = new Map(
      currentSteps.map((step) => [step.id, step]),
    );

    validateWorkflowReferences(
      input.steps.map((step) => ({
        stepKey: step.stepKey,
        enabled: step.enabled ?? true,
        configuration: step.configuration as JsonValue,
      })),
    );

    const submittedIds = new Set(
      input.steps
        .map((step) => step.id)
        .filter(
          (id): id is string => id !== undefined && currentStepById.has(id),
        ),
    );
    const idsToDelete = currentSteps
      .filter((step) => !submittedIds.has(step.id))
      .map((step) => step.id);

    const result = this.db.transaction((tx) => {
      const [updatedWorkflowRow] = tx
        .update(workflows)
        .set({
          name: input.name,
          description: input.description ?? null,
          cronExpression: input.cronExpression,
          timezone: input.timezone,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.overlapPolicy === undefined
            ? {}
            : { overlapPolicy: input.overlapPolicy }),
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, workflowId))
        .returning()
        .all();

      idsToDelete.forEach((id) => {
        tx.delete(workflowSteps)
          .where(
            and(
              eq(workflowSteps.id, id),
              eq(workflowSteps.workflowId, workflowId),
            ),
          )
          .run();
      });

      // Offset every surviving row to a collision-free temporary
      // position before writing final positions — mirrors
      // `applyContiguousPositions`'s two-pass rewrite, since
      // `(workflow_id, position)` is uniquely constrained and a
      // reordered pair written in one pass could collide mid-write.
      const highestCurrentPosition = currentSteps.reduce(
        (max, step) => Math.max(max, step.position),
        -1,
      );
      const temporaryOffset =
        Math.max(highestCurrentPosition, input.steps.length - 1) + 1;
      const now = new Date();

      input.steps.forEach((step, index) => {
        if (step.id !== undefined && currentStepById.has(step.id)) {
          tx.update(workflowSteps)
            .set({ position: temporaryOffset + index, updatedAt: now })
            .where(eq(workflowSteps.id, step.id))
            .run();
        }
      });

      const stepRows = input.steps.map((step, position) => {
        if (step.id !== undefined && currentStepById.has(step.id)) {
          return tx
            .update(workflowSteps)
            .set({
              stepKey: step.stepKey,
              type: step.type,
              configuration: step.configuration,
              enabled: step.enabled ?? true,
              position,
              updatedAt: now,
            })
            .where(eq(workflowSteps.id, step.id))
            .returning()
            .all()[0];
        }

        return tx
          .insert(workflowSteps)
          .values({
            id: crypto.randomUUID(),
            workflowId,
            stepKey: step.stepKey,
            type: step.type,
            position,
            configuration: step.configuration,
            ...(step.enabled === undefined ? {} : { enabled: step.enabled }),
          })
          .returning()
          .all()[0];
      });

      return {
        ...toWorkflowResponse(updatedWorkflowRow),
        steps: stepRows.map(toWorkflowStepResponse),
      };
    });

    await this.workflowSchedulerService.registerOrReplace(result.id);

    return result;
  }

  async delete(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
  ): Promise<void> {
    this.assertCanMutate(actor);

    const deletedRows = await this.db
      .delete(workflows)
      .where(this.ownedWorkflowCondition(actor, projectId, workflowId))
      .returning({ id: workflows.id });

    if (deletedRows.length === 0) {
      throw new WorkflowNotFoundError();
    }

    this.workflowSchedulerService.unregister(workflowId);
  }

  /**
   * The condition proving, in the same statement, that `workflowId`
   * belongs to `projectId` AND that `projectId` is owned by the actor —
   * via a correlated `EXISTS` subquery against `projects`, rather than an
   * unscoped lookup followed by an unscoped mutation.
   */
  private ownedWorkflowCondition(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
  ) {
    return and(
      eq(workflows.id, workflowId),
      eq(workflows.projectId, projectId),
      exists(
        this.db
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.id, workflows.projectId),
              eq(projects.ownerId, actor.userId),
            ),
          ),
      ),
    );
  }

  /**
   * Verifies the route's projectId exists and is owned by the actor.
   * Used by list/create/findById, which need the parent-ownership check
   * as a standalone step (list and create have no workflow row of their
   * own yet to correlate against).
   */
  private async assertOwnedProject(
    actor: AuthenticatedActor,
    projectId: string,
  ): Promise<void> {
    const [row] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.ownerId, actor.userId)),
      );

    if (!row) {
      throw new ProjectNotFoundError();
    }
  }

  /**
   * Mutations (create/update/delete) are admin-only. Also enforced at the
   * HTTP layer via `@Roles(['admin'])`; this is a defense-in-depth
   * backstop for any caller that reaches the service directly.
   */
  private assertCanMutate(actor: AuthenticatedActor): void {
    if (actor.role !== 'admin') {
      throw new ForbiddenException(
        'Only admins may create, update, or delete workflows.',
      );
    }
  }
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

function toWorkflowStepResponse(row: WorkflowStep): WorkflowStepResponse {
  return {
    id: row.id,
    workflowId: row.workflowId,
    stepKey: row.stepKey,
    type: row.type,
    position: row.position,
    configuration: row.configuration,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
