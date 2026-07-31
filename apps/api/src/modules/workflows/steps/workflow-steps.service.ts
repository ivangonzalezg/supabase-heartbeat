import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, asc, eq, exists, max, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { projects, workflows, workflowSteps } from '../../../database/schema';
import type { AppDatabase } from '../../../database/database.types';
import type { WorkflowStep } from '../../../database/schema/types';
import type { AuthenticatedActor } from '../../../lib/authorization/authorization.types';
import { ProjectNotFoundError } from '../../projects/projects.errors';
import { WorkflowNotFoundError } from '../workflows.errors';
import type { CreateWorkflowStepDto } from './dto/create-workflow-step.dto';
import type { ReorderWorkflowStepsDto } from './dto/reorder-workflow-steps.dto';
import {
  isEmptyStepUpdate,
  type UpdateWorkflowStepDto,
} from './dto/update-workflow-step.dto';
import {
  DuplicateStepKeyError,
  LastStepDeletionError,
  WorkflowStepNotFoundError,
  WorkflowStepOrderConflictError,
} from './workflow-steps.errors';
import type { WorkflowStepResponse } from './workflow-steps.types';
import { parseWorkflowStepConfiguration } from '@supabase-heartbeat/validation';

/**
 * The transaction handle type Drizzle passes into `db.transaction`'s
 * callback — inferred directly from `AppDatabase.transaction` rather
 * than hand-written, since `BetterSQLite3Database`'s transaction
 * generics are not meant to be spelled out at call sites. Both
 * `delete()` and `reorder()` open their own transaction and pass the
 * resulting `tx` to `applyContiguousPositions` below.
 */
type WorkflowStepsTransaction = Parameters<
  AppDatabase['transaction']
>[0] extends (tx: infer Tx) => unknown
  ? Tx
  : never;

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

      applyContiguousPositions(
        tx,
        workflowId,
        remaining.map((step) => step.id),
      );
    });
  }

  /**
   * Replaces the workflow's complete step order in one transaction.
   * `stepIds` must contain every one of the workflow's current step IDs
   * exactly once — no missing, extra, or foreign ID — checked inside the
   * same transaction as the position rewrite, immediately after loading
   * the current steps, so the comparison can never observe a stale set.
   * `stepIds[0]` becomes position 0, `stepIds[1]` position 1, and so on.
   *
   * Only rows whose position actually changes have their `updatedAt`
   * bumped (see `applyContiguousPositions`) — a no-op reorder (submitting
   * the current order) therefore performs zero writes and returns the
   * unchanged current step list.
   */
  async reorder(
    actor: AuthenticatedActor,
    projectId: string,
    workflowId: string,
    input: ReorderWorkflowStepsDto,
  ): Promise<WorkflowStepResponse[]> {
    this.assertCanMutate(actor);
    await this.assertOwnedWorkflow(actor, projectId, workflowId);

    const rows = this.db.transaction((tx) => {
      const current = tx
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, workflowId))
        .orderBy(asc(workflowSteps.position))
        .all();

      const currentIds = new Set(current.map((step) => step.id));
      const submittedIds = new Set(input.stepIds);
      const sameSize = currentIds.size === submittedIds.size;
      const sameMembers =
        sameSize && input.stepIds.every((id) => currentIds.has(id));
      if (!sameSize || !sameMembers) {
        throw new WorkflowStepOrderConflictError();
      }

      applyContiguousPositions(tx, workflowId, input.stepIds);

      return tx
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, workflowId))
        .orderBy(asc(workflowSteps.position))
        .all();
    });

    return rows.map(toWorkflowStepResponse);
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

/**
 * Rewrites a workflow's step positions to be contiguous, zero-based, and
 * ordered exactly as `orderedStepIds` specifies — shared by `delete()`'s
 * post-deletion compaction and `reorder()`'s full replacement, since both
 * are, at their core, "given a final ordered ID list for this workflow,
 * make the persisted positions match it."
 *
 * Must run inside the caller's already-open transaction (`tx`): the read
 * of current positions and every position write must be atomic together
 * with whatever the caller already did in the same transaction (a prior
 * delete, or the caller's own ID-set validation).
 *
 * Because `(workflow_id, position)` is uniquely constrained and
 * `position` must stay `>= 0` (database check constraint), a naive
 * single-pass rewrite of two swapped rows would collide mid-write. This
 * uses a collision-safe two-pass rewrite: every changed row is first
 * moved to a temporary position at `temporaryOffset` or higher, then
 * rewritten to its final `0..n-1` position. `temporaryOffset` is derived
 * as `max(every row's current position, orderedStepIds.length - 1) + 1`
 * — strictly greater than both the final range (every final position is
 * `< orderedStepIds.length`) AND every row's current position, including
 * rows not yet visited by pass 1 in the same call. (A fixed offset
 * derived from list length alone is not sufficient: e.g. deleting
 * position 1 from `[0,1,2,3]` leaves current positions `[0,2,3]` with
 * `orderedStepIds.length === 3`, so a temporary offset of exactly `3`
 * would collide with the row still sitting at current position `3`
 * before pass 1 reaches it.) This stays correct regardless of how
 * `MAX_STEPS_PER_WORKFLOW` is configured or how sparse current positions
 * are.
 *
 * Only rows whose position actually changes are written — a step
 * already at its target position is left untouched (including its
 * `updatedAt`), so a full no-op reorder (or a delete that doesn't
 * actually shift any remaining row, which cannot currently happen but is
 * handled correctly regardless) performs zero writes.
 */
function applyContiguousPositions(
  tx: WorkflowStepsTransaction,
  workflowId: string,
  orderedStepIds: string[],
): void {
  const currentRows = tx
    .select({ id: workflowSteps.id, position: workflowSteps.position })
    .from(workflowSteps)
    .where(eq(workflowSteps.workflowId, workflowId))
    .all();
  const currentPositionById = new Map(
    currentRows.map((row) => [row.id, row.position]),
  );

  const changedIds = orderedStepIds.filter(
    (id, index) => currentPositionById.get(id) !== index,
  );
  if (changedIds.length === 0) {
    return;
  }

  // Temporary offset: must exceed both the final range (every final
  // position is < orderedStepIds.length) AND every row's *current*
  // position (a row not yet moved to its temporary slot could otherwise
  // still occupy a position inside the temporary range — e.g. deleting
  // position 1 from [0,1,2,3] leaves remaining current positions
  // [0,2,3], where 3 is >= orderedStepIds.length (3) but not yet moved).
  // Using max(currentPosition, orderedStepIds.length - 1) + 1 as the
  // base guarantees no temporary write ever collides with a real,
  // not-yet-touched position.
  const highestCurrentPosition = currentRows.reduce(
    (max, row) => Math.max(max, row.position),
    -1,
  );
  const temporaryOffset =
    Math.max(highestCurrentPosition, orderedStepIds.length - 1) + 1;
  const now = new Date();

  // Pass 1: move every changed row to a collision-free temporary
  // position ahead of the final range.
  changedIds.forEach((id, index) => {
    tx.update(workflowSteps)
      .set({ position: temporaryOffset + index, updatedAt: now })
      .where(eq(workflowSteps.id, id))
      .run();
  });

  // Pass 2: rewrite each changed row to its final position.
  changedIds.forEach((id) => {
    const finalPosition = orderedStepIds.indexOf(id);
    tx.update(workflowSteps)
      .set({ position: finalPosition, updatedAt: now })
      .where(eq(workflowSteps.id, id))
      .run();
  });
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
