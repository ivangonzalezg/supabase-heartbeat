import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, asc, eq, exists, max, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { projects, workflows, workflowSteps } from '../../../database/schema';
import type { WorkflowStep } from '../../../database/schema/types';
import type { AuthenticatedActor } from '../../../lib/authorization/authorization.types';
import { ProjectNotFoundError } from '../../projects/projects.errors';
import { WorkflowNotFoundError } from '../workflows.errors';
import type { CreateWorkflowStepDto } from './dto/create-workflow-step.dto';
import {
  isEmptyStepUpdate,
  type UpdateWorkflowStepDto,
} from './dto/update-workflow-step.dto';
import {
  DuplicateStepKeyError,
  LastStepDeletionError,
  WorkflowStepNotFoundError,
} from './workflow-steps.errors';
import type { WorkflowStepResponse } from './workflow-steps.types';
import { parseWorkflowStepConfiguration } from '@supabase-heartbeat/validation';

@Injectable()
export class WorkflowStepsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Both admin and viewer may list. Ordered by `position` ascending —
   * the persisted execution order.
   */
  async list(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
  ): Promise<WorkflowStepResponse[]> {
    await this.assertOwnedWorkflow(actor, projectId, workflowId);

    const rows = await this.db
      .select()
      .from(workflowSteps)
      .where(eq(workflowSteps.workflowId, workflowId))
      .orderBy(asc(workflowSteps.position));

    return rows.map(toWorkflowStepResponse);
  }

  async findById(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
    stepId: string,
  ): Promise<WorkflowStepResponse> {
    await this.assertOwnedWorkflow(actor, projectId, workflowId);

    const row = await this.findOwnedStep(workflowId, stepId);

    return toWorkflowStepResponse(row);
  }

  /**
   * Appends a new step at `MAX(existing position) + 1` (0 if this is the
   * first step), inside a transaction, so the position read and the
   * insert are atomic with respect to concurrent appends. The unique
   * `(workflow_id, position)` constraint is the final safety net against
   * a race this transaction somehow missed.
   */
  async create(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
    input: CreateWorkflowStepDto,
  ): Promise<WorkflowStepResponse> {
    this.assertCanMutate(actor);
    await this.assertOwnedWorkflow(actor, projectId, workflowId);

    const existingWithKey = await this.db
      .select({ id: workflowSteps.id })
      .from(workflowSteps)
      .where(
        and(
          eq(workflowSteps.workflowId, workflowId),
          eq(workflowSteps.stepKey, input.stepKey),
        ),
      );
    if (existingWithKey.length > 0) {
      throw new DuplicateStepKeyError();
    }

    const row = this.db.transaction((tx) => {
      const [{ nextPosition }] = tx
        .select({
          nextPosition: sql<number>`coalesce(${max(workflowSteps.position)}, -1) + 1`,
        })
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, workflowId))
        .all();

      const [inserted] = tx
        .insert(workflowSteps)
        .values({
          id: crypto.randomUUID(),
          workflowId,
          stepKey: input.stepKey,
          type: input.type,
          position: nextPosition,
          configuration: input.configuration,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        })
        .returning()
        .all();

      return inserted;
    });

    return toWorkflowStepResponse(row);
  }

  /**
   * `position` is never accepted. If `type` or `configuration` changes,
   * the merged result (existing row overridden by the patch) is
   * re-validated as a whole pair via the shared
   * `parseWorkflowStepConfiguration` schema — so e.g. switching `type`
   * from `wait` to `signout` while the old `wait`-shaped configuration
   * still applies is rejected unless a valid `signout` configuration is
   * supplied in the same patch.
   */
  async update(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
    stepId: string,
    input: UpdateWorkflowStepDto,
  ): Promise<WorkflowStepResponse> {
    this.assertCanMutate(actor);

    if (isEmptyStepUpdate(input)) {
      throw new BadRequestException('At least one field must be provided.');
    }

    await this.assertOwnedWorkflow(actor, projectId, workflowId);
    const current = await this.findOwnedStep(workflowId, stepId);

    const mergedType = input.type ?? current.type;
    const mergedConfiguration = input.configuration ?? current.configuration;
    const parsed = parseWorkflowStepConfiguration({
      type: mergedType,
      configuration: mergedConfiguration,
    });
    if (!parsed.success) {
      const [firstIssue] = parsed.error.issues;
      throw new BadRequestException(
        `Invalid step configuration for type "${mergedType}"` +
          (firstIssue
            ? `: ${firstIssue.path.join('.')} ${firstIssue.message}`
            : '.'),
      );
    }

    if (input.stepKey !== undefined && input.stepKey !== current.stepKey) {
      const existingWithKey = await this.db
        .select({ id: workflowSteps.id })
        .from(workflowSteps)
        .where(
          and(
            eq(workflowSteps.workflowId, workflowId),
            eq(workflowSteps.stepKey, input.stepKey),
          ),
        );
      if (existingWithKey.length > 0) {
        throw new DuplicateStepKeyError();
      }
    }

    const [row] = await this.db
      .update(workflowSteps)
      .set({
        ...(input.stepKey === undefined ? {} : { stepKey: input.stepKey }),
        type: mergedType,
        configuration: mergedConfiguration,
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowSteps.id, stepId),
          eq(workflowSteps.workflowId, workflowId),
        ),
      )
      .returning();

    if (!row) {
      throw new WorkflowStepNotFoundError();
    }

    return toWorkflowStepResponse(row);
  }

  /**
   * Deletes the step and compacts remaining positions to stay contiguous
   * (e.g. deleting position 1 from [0,1,2,3] yields [0,1,2], not
   * [0,2,3]). Rejects deleting the last remaining step, for consistency
   * with the aggregate create endpoint's "at least one step" rule — the
   * workflow itself can still be deleted through the workflow endpoint.
   *
   * Compaction runs inside the same transaction as the delete. Because
   * `(workflow_id, position)` is uniquely constrained (and `position`
   * must be `>= 0` per the database's own check constraint), positions
   * are first shifted to a temporary large offset — guaranteed not to
   * collide with any real position, since the number of steps is bounded
   * by `MAX_STEPS_PER_WORKFLOW` far below the offset — before being
   * rewritten to their final compacted values, a collision-safe two-pass
   * rewrite.
   */
  async delete(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
    stepId: string,
  ): Promise<void> {
    this.assertCanMutate(actor);
    await this.assertOwnedWorkflow(actor, projectId, workflowId);
    await this.findOwnedStep(workflowId, stepId);

    const totalSteps = await this.db
      .select({ id: workflowSteps.id })
      .from(workflowSteps)
      .where(eq(workflowSteps.workflowId, workflowId));
    if (totalSteps.length <= 1) {
      throw new LastStepDeletionError();
    }

    this.db.transaction((tx) => {
      tx.delete(workflowSteps)
        .where(
          and(
            eq(workflowSteps.id, stepId),
            eq(workflowSteps.workflowId, workflowId),
          ),
        )
        .run();

      const remaining = tx
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, workflowId))
        .orderBy(asc(workflowSteps.position))
        .all();

      // Pass 1: move every remaining row to a collision-free large
      // offset, since final compacted positions may overlap current
      // ones. `position` must stay >= 0 (database check constraint), so
      // a large positive offset is used instead of a negative one.
      const COMPACTION_OFFSET = 1_000_000;
      remaining.forEach((step, index) => {
        tx.update(workflowSteps)
          .set({ position: COMPACTION_OFFSET + index })
          .where(eq(workflowSteps.id, step.id))
          .run();
      });

      // Pass 2: rewrite to final contiguous 0..n-1 positions.
      remaining.forEach((step, index) => {
        tx.update(workflowSteps)
          .set({ position: index })
          .where(eq(workflowSteps.id, step.id))
          .run();
      });
    });
  }

  /**
   * Verifies, in one round trip, that `workflowId` belongs to `projectId`
   * and that `projectId` is owned by the actor — the same
   * `EXISTS`-correlated-subquery pattern `WorkflowsService` uses, so a
   * mismatched hierarchy never leaks information through timing or
   * distinct error types.
   */
  private async assertOwnedWorkflow(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
  ): Promise<void> {
    const [row] = await this.db
      .select({ id: workflows.id })
      .from(workflows)
      .where(
        and(
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
        ),
      );

    if (!row) {
      // Distinguish "project not owned/nonexistent" from "workflow not
      // in that project" only for the thrown type, not for the HTTP
      // status (both are 404) — mirrors WorkflowsService's convention.
      const [projectRow] = await this.db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(eq(projects.id, projectId), eq(projects.ownerId, actor.userId)),
        );
      if (!projectRow) {
        throw new ProjectNotFoundError();
      }
      throw new WorkflowNotFoundError();
    }
  }

  /**
   * Fetches the step scoped by `id AND workflow_id`, after
   * `assertOwnedWorkflow` has already proven the workflow/project
   * hierarchy — never queries a step globally by ID.
   */
  private async findOwnedStep(
    workflowId: string,
    stepId: string,
  ): Promise<WorkflowStep> {
    const [row] = await this.db
      .select()
      .from(workflowSteps)
      .where(
        and(
          eq(workflowSteps.id, stepId),
          eq(workflowSteps.workflowId, workflowId),
        ),
      );

    if (!row) {
      throw new WorkflowStepNotFoundError();
    }

    return row;
  }

  private assertCanMutate(actor: AuthenticatedActor): void {
    if (actor.role !== 'admin') {
      throw new ForbiddenException(
        'Only admins may create, update, or delete workflow steps.',
      );
    }
  }
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
