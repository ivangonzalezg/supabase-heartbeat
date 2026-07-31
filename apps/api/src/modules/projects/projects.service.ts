import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { projects } from '../../database/schema';
import type { Project } from '../../database/schema/types';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import type { CreateProjectDto } from './dto/create-project.dto';
import { isEmptyUpdate, type UpdateProjectDto } from './dto/update-project.dto';
import { ProjectNotFoundError } from './projects.errors';
import type { ProjectResponse } from './projects.types';

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
