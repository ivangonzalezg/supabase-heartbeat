import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, asc, desc, eq, exists } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { projects, workflows, workflowSteps } from '../../database/schema';
import type { Workflow, WorkflowStep } from '../../database/schema/types';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import { ProjectNotFoundError } from '../projects/projects.errors';
import type { CreateWorkflowDto } from './dto/create-workflow.dto';
import {
  isEmptyUpdate,
  type UpdateWorkflowDto,
} from './dto/update-workflow.dto';
import { WorkflowNotFoundError } from './workflows.errors';
import type {
  WorkflowDetailResponse,
  WorkflowResponse,
} from './workflows.types';
import type { WorkflowStepResponse } from './steps/workflow-steps.types';

@Injectable()
export class WorkflowsService {
  constructor(private readonly databaseService: DatabaseService) {}

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
   */
  async create(
    actor: AuthenticatedActor,
    projectId: string,
    input: CreateWorkflowDto,
  ): Promise<WorkflowDetailResponse> {
    this.assertCanMutate(actor);
    await this.assertOwnedProject(actor, projectId);

    return this.db.transaction((tx) => {
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

    return toWorkflowResponse(row);
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
