import { join } from 'path';
import { ForbiddenException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../database/schema';
import type { AppDatabase } from '../../database/database.types';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import { ProjectsService } from './projects.service';
import { ProjectNotFoundError } from './projects.errors';

function createTestDb(): { db: AppDatabase; connection: Database.Database } {
  const connection = new Database(':memory:');
  connection.pragma('foreign_keys = ON');

  const db = drizzle(connection, { schema }) as AppDatabase;
  migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });

  return { db, connection };
}

async function createUser(
  db: AppDatabase,
  role: 'admin' | 'viewer',
  overrides: Partial<schema.NewUser> = {},
) {
  const [user] = await db
    .insert(schema.users)
    .values({
      id: crypto.randomUUID(),
      name: 'Test User',
      email: `${crypto.randomUUID()}@example.com`,
      emailVerified: false,
      role,
      ...overrides,
    })
    .returning();
  return user;
}

function actorFor(user: {
  id: string;
  role: string | null;
}): AuthenticatedActor {
  return { userId: user.id, role: user.role as 'admin' | 'viewer' };
}

const validCreateInput = {
  name: 'Production Project',
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_examplekey',
};

describe('ProjectsService', () => {
  let db: AppDatabase;
  let connection: Database.Database;
  let service: ProjectsService;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let otherAdmin: Awaited<ReturnType<typeof createUser>>;
  let viewer: Awaited<ReturnType<typeof createUser>>;
  let adminActor: AuthenticatedActor;
  let otherAdminActor: AuthenticatedActor;
  let viewerActor: AuthenticatedActor;

  beforeEach(async () => {
    ({ db, connection } = createTestDb());
    service = new ProjectsService({ db } as never);

    admin = await createUser(db, 'admin');
    otherAdmin = await createUser(db, 'admin');
    viewer = await createUser(db, 'viewer');
    adminActor = actorFor(admin);
    otherAdminActor = actorFor(otherAdmin);
    viewerActor = actorFor(viewer);
  });

  afterEach(() => {
    connection.close();
  });

  describe('create', () => {
    it('lets an admin create a project', async () => {
      const project = await service.create(adminActor, validCreateInput);

      expect(project.name).toBe('Production Project');
    });

    it('sets the owner to the actor user ID', async () => {
      const project = await service.create(adminActor, validCreateInput);

      expect(project.ownerId).toBe(admin.id);
    });

    it('ignores any client-provided ownerId-shaped field and uses the actor', async () => {
      const project = await service.create(adminActor, {
        ...validCreateInput,
        ...({ ownerId: otherAdmin.id } as Record<string, unknown>),
      });

      expect(project.ownerId).toBe(admin.id);
    });

    it('rejects a viewer attempting to create a project', async () => {
      await expect(
        service.create(viewerActor, validCreateInput),
      ).rejects.toThrow(ForbiddenException);
    });

    it('defaults enabled to true when not provided', async () => {
      const project = await service.create(adminActor, validCreateInput);

      expect(project.enabled).toBe(true);
    });

    it('respects an explicit enabled: false', async () => {
      const project = await service.create(adminActor, {
        ...validCreateInput,
        enabled: false,
      });

      expect(project.enabled).toBe(false);
    });
  });

  describe('list', () => {
    it('returns only projects owned by the actor for an admin', async () => {
      await service.create(adminActor, { ...validCreateInput, name: 'A' });
      await service.create(otherAdminActor, { ...validCreateInput, name: 'B' });

      const result = await service.list(adminActor);

      expect(result).toHaveLength(1);
      expect(result[0].ownerId).toBe(admin.id);
    });

    it('returns only projects owned by the actor for a viewer', async () => {
      // Seed a project directly (viewers cannot create through the service).
      await db.insert(schema.projects).values({
        id: crypto.randomUUID(),
        ownerId: viewer.id,
        name: 'Viewer Project',
        supabaseUrl: 'https://viewer.supabase.co',
        publishableKey: 'sb_publishable_viewer',
      });
      await service.create(adminActor, validCreateInput);

      const result = await service.list(viewerActor);

      expect(result).toHaveLength(1);
      expect(result[0].ownerId).toBe(viewer.id);
    });

    it('never leaks another user project through the list query', async () => {
      await service.create(otherAdminActor, validCreateInput);

      const result = await service.list(adminActor);

      expect(result).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('lets the owner read their own project', async () => {
      const created = await service.create(adminActor, validCreateInput);

      const found = await service.findById(adminActor, created.id);

      expect(found.id).toBe(created.id);
    });

    it('lets a viewer read their own project', async () => {
      const [seeded] = await db
        .insert(schema.projects)
        .values({
          id: crypto.randomUUID(),
          ownerId: viewer.id,
          name: 'Viewer Project',
          supabaseUrl: 'https://viewer.supabase.co',
          publishableKey: 'sb_publishable_viewer',
        })
        .returning();

      const found = await service.findById(viewerActor, seeded.id);

      expect(found.id).toBe(seeded.id);
    });

    it('throws ProjectNotFoundError for another user project', async () => {
      const created = await service.create(otherAdminActor, validCreateInput);

      await expect(service.findById(adminActor, created.id)).rejects.toThrow(
        ProjectNotFoundError,
      );
    });

    it('throws ProjectNotFoundError for a nonexistent project', async () => {
      await expect(
        service.findById(adminActor, crypto.randomUUID()),
      ).rejects.toThrow(ProjectNotFoundError);
    });
  });

  describe('update', () => {
    it('lets an admin update their own project', async () => {
      const created = await service.create(adminActor, validCreateInput);

      const updated = await service.update(adminActor, created.id, {
        name: 'Renamed',
      });

      expect(updated.name).toBe('Renamed');
    });

    it('changes updatedAt on update', async () => {
      const created = await service.create(adminActor, validCreateInput);
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const updated = await service.update(adminActor, created.id, {
        name: 'Renamed',
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        created.updatedAt.getTime(),
      );
    });

    it('rejects an admin updating another user project with not found', async () => {
      const created = await service.create(otherAdminActor, validCreateInput);

      await expect(
        service.update(adminActor, created.id, { name: 'Hijacked' }),
      ).rejects.toThrow(ProjectNotFoundError);
    });

    it('rejects a viewer attempting to update a project', async () => {
      const [seeded] = await db
        .insert(schema.projects)
        .values({
          id: crypto.randomUUID(),
          ownerId: viewer.id,
          name: 'Viewer Project',
          supabaseUrl: 'https://viewer.supabase.co',
          publishableKey: 'sb_publishable_viewer',
        })
        .returning();

      await expect(
        service.update(viewerActor, seeded.id, { name: 'Nope' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an empty update body', async () => {
      const created = await service.create(adminActor, validCreateInput);

      await expect(
        service.update(adminActor, created.id, {}),
      ).rejects.toThrow();
    });

    it('does not modify the target project when update fails ownership', async () => {
      const created = await service.create(otherAdminActor, validCreateInput);

      await expect(
        service.update(adminActor, created.id, { name: 'Hijacked' }),
      ).rejects.toThrow(ProjectNotFoundError);

      const [stillOriginal] = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, created.id));

      expect(stillOriginal?.name).toBe(validCreateInput.name);
    });
  });

  describe('delete', () => {
    it('lets an admin delete their own project', async () => {
      const created = await service.create(adminActor, validCreateInput);

      await service.delete(adminActor, created.id);

      await expect(service.findById(adminActor, created.id)).rejects.toThrow(
        ProjectNotFoundError,
      );
    });

    it('rejects an admin deleting another user project with not found', async () => {
      const created = await service.create(otherAdminActor, validCreateInput);

      await expect(service.delete(adminActor, created.id)).rejects.toThrow(
        ProjectNotFoundError,
      );

      const stillThere = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, created.id));
      expect(stillThere).toHaveLength(1);
    });

    it('rejects a viewer attempting to delete a project', async () => {
      const [seeded] = await db
        .insert(schema.projects)
        .values({
          id: crypto.randomUUID(),
          ownerId: viewer.id,
          name: 'Viewer Project',
          supabaseUrl: 'https://viewer.supabase.co',
          publishableKey: 'sb_publishable_viewer',
        })
        .returning();

      await expect(service.delete(viewerActor, seeded.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('removes the full child hierarchy through cascades', async () => {
      const created = await service.create(adminActor, validCreateInput);
      const [workflow] = await db
        .insert(schema.workflows)
        .values({
          id: crypto.randomUUID(),
          projectId: created.id,
          name: 'Workflow',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
        })
        .returning();
      const [step] = await db
        .insert(schema.workflowSteps)
        .values({
          id: crypto.randomUUID(),
          workflowId: workflow.id,
          stepKey: 'step_1',
          type: 'wait',
          position: 0,
          configuration: {},
        })
        .returning();
      const [run] = await db
        .insert(schema.workflowRuns)
        .values({
          id: crypto.randomUUID(),
          workflowId: workflow.id,
          triggerType: 'manual',
          status: 'pending',
        })
        .returning();
      await db.insert(schema.stepRuns).values({
        id: crypto.randomUUID(),
        workflowRunId: run.id,
        workflowStepId: step.id,
        position: 0,
        status: 'pending',
      });

      await service.delete(adminActor, created.id);

      expect(await db.select().from(schema.workflows)).toHaveLength(0);
      expect(await db.select().from(schema.workflowSteps)).toHaveLength(0);
      expect(await db.select().from(schema.workflowRuns)).toHaveLength(0);
      expect(await db.select().from(schema.stepRuns)).toHaveLength(0);
    });
  });
});
