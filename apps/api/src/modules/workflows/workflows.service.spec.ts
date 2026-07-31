import { join } from 'path';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../database/schema';
import type { AppDatabase } from '../../database/database.types';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import { WorkflowsService } from './workflows.service';
import { WorkflowNotFoundError } from './workflows.errors';
import { ProjectNotFoundError } from '../projects/projects.errors';

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

async function createProject(
  db: AppDatabase,
  ownerId: string,
  overrides: Partial<schema.NewProject> = {},
) {
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      name: 'Test Project',
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
      ...overrides,
    })
    .returning();
  return project;
}

function actorFor(user: {
  id: string;
  role: string | null;
}): AuthenticatedActor {
  return { userId: user.id, role: user.role as 'admin' | 'viewer' };
}

const validCreateInput = {
  name: 'Nightly heartbeat',
  cronExpression: '0 */6 * * *',
  timezone: 'UTC',
};

describe('WorkflowsService', () => {
  let db: AppDatabase;
  let connection: Database.Database;
  let service: WorkflowsService;

  let adminA: Awaited<ReturnType<typeof createUser>>;
  let adminB: Awaited<ReturnType<typeof createUser>>;
  let viewerA: Awaited<ReturnType<typeof createUser>>;
  let adminAActor: AuthenticatedActor;
  let adminBActor: AuthenticatedActor;
  let viewerAActor: AuthenticatedActor;

  let projectA: Awaited<ReturnType<typeof createProject>>;
  let projectB: Awaited<ReturnType<typeof createProject>>;
  let projectViewer: Awaited<ReturnType<typeof createProject>>;

  beforeEach(async () => {
    ({ db, connection } = createTestDb());
    service = new WorkflowsService({ db } as never);

    adminA = await createUser(db, 'admin');
    adminB = await createUser(db, 'admin');
    viewerA = await createUser(db, 'viewer');
    adminAActor = actorFor(adminA);
    adminBActor = actorFor(adminB);
    viewerAActor = actorFor(viewerA);

    projectA = await createProject(db, adminA.id, { name: 'Project A' });
    projectB = await createProject(db, adminB.id, { name: 'Project B' });
    projectViewer = await createProject(db, viewerA.id, {
      name: 'Project Viewer',
    });
  });

  afterEach(() => {
    connection.close();
  });

  describe('create', () => {
    it('lets an admin create a workflow under their own project', async () => {
      const workflow = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      expect(workflow.name).toBe('Nightly heartbeat');
    });

    it('uses the route project ID as projectId', async () => {
      const workflow = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      expect(workflow.projectId).toBe(projectA.id);
    });

    it('ignores any client-provided projectId-shaped field and uses the route project', async () => {
      const workflow = await service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        ...({ projectId: projectB.id } as Record<string, unknown>),
      });

      expect(workflow.projectId).toBe(projectA.id);
    });

    it('rejects an admin creating under another user project with not found', async () => {
      await expect(
        service.create(adminAActor, projectB.id, validCreateInput),
      ).rejects.toThrow(ProjectNotFoundError);
    });

    it('rejects a viewer attempting to create a workflow', async () => {
      await expect(
        service.create(viewerAActor, projectA.id, validCreateInput),
      ).rejects.toThrow(ForbiddenException);
    });

    it('defaults enabled to true and overlapPolicy to skip', async () => {
      const workflow = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      expect(workflow.enabled).toBe(true);
      expect(workflow.overlapPolicy).toBe('skip');
    });
  });

  describe('list', () => {
    it('lets an admin list workflows from their own project', async () => {
      await service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        name: 'A',
      });

      const result = await service.list(adminAActor, projectA.id);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('A');
    });

    it('lets a viewer list workflows from their own project', async () => {
      // Seed directly, since viewers cannot create.
      await db.insert(schema.workflows).values({
        id: crypto.randomUUID(),
        projectId: projectViewer.id,
        name: 'Seeded',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
      });

      const result = await service.list(viewerAActor, projectViewer.id);

      expect(result).toHaveLength(1);
    });

    it('does not leak workflows from another project or owner', async () => {
      await service.create(adminBActor, projectB.id, validCreateInput);

      const result = await service.list(adminAActor, projectA.id);

      expect(result).toHaveLength(0);
    });

    it('rejects listing under another user project with not found', async () => {
      await expect(service.list(adminAActor, projectB.id)).rejects.toThrow(
        ProjectNotFoundError,
      );
    });

    it('orders results by creation date descending', async () => {
      const first = await service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        name: 'First',
      });
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const second = await service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        name: 'Second',
      });

      const result = await service.list(adminAActor, projectA.id);

      expect(result.map((w) => w.id)).toEqual([second.id, first.id]);
    });
  });

  describe('findById', () => {
    it('lets the owner read a workflow', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      const found = await service.findById(
        adminAActor,
        projectA.id,
        created.id,
      );

      expect(found.id).toBe(created.id);
    });

    it('lets a viewer read a workflow in their own project', async () => {
      const [seeded] = await db
        .insert(schema.workflows)
        .values({
          id: crypto.randomUUID(),
          projectId: projectViewer.id,
          name: 'Seeded',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
        })
        .returning();

      const found = await service.findById(
        viewerAActor,
        projectViewer.id,
        seeded.id,
      );

      expect(found.id).toBe(seeded.id);
    });

    it('rejects another user reading it, with not found', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      // adminB does not own projectA at all, so this is caught by the
      // project-ownership check rather than the workflow lookup — both
      // are NotFoundException subclasses and produce the same 404
      // behavior, disclosing nothing about which resource exists.
      await expect(
        service.findById(adminBActor, projectA.id, created.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an owned project ID paired with a workflow from another project, with not found', async () => {
      const workflowInB = await service.create(
        adminBActor,
        projectB.id,
        validCreateInput,
      );

      await expect(
        service.findById(adminAActor, projectA.id, workflowInB.id),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('rejects a nonexistent workflow with not found', async () => {
      await expect(
        service.findById(adminAActor, projectA.id, crypto.randomUUID()),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('rejects reading under another user project with not found', async () => {
      await expect(
        service.findById(adminAActor, projectB.id, crypto.randomUUID()),
      ).rejects.toThrow(ProjectNotFoundError);
    });
  });

  describe('update', () => {
    it('lets an admin update an owned workflow', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      const updated = await service.update(
        adminAActor,
        projectA.id,
        created.id,
        {
          name: 'Renamed',
        },
      );

      expect(updated.name).toBe('Renamed');
    });

    it('changes updatedAt on update', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const updated = await service.update(
        adminAActor,
        projectA.id,
        created.id,
        {
          name: 'Renamed',
        },
      );

      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        created.updatedAt.getTime(),
      );
    });

    it('rejects an admin updating another user workflow with not found', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      await expect(
        service.update(adminBActor, projectA.id, created.id, {
          name: 'Hijacked',
        }),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('rejects a viewer attempting to update', async () => {
      const [seeded] = await db
        .insert(schema.workflows)
        .values({
          id: crypto.randomUUID(),
          projectId: projectA.id,
          name: 'Seeded',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
        })
        .returning();

      await expect(
        service.update(viewerAActor, projectA.id, seeded.id, {
          name: 'Nope',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an empty update body', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      await expect(
        service.update(adminAActor, projectA.id, created.id, {}),
      ).rejects.toThrow();
    });

    it('does not modify the target workflow when update fails ownership', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      await expect(
        service.update(adminBActor, projectA.id, created.id, {
          name: 'Hijacked',
        }),
      ).rejects.toThrow(WorkflowNotFoundError);

      const [stillOriginal] = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, created.id));
      expect(stillOriginal.name).toBe(validCreateInput.name);
    });

    it('clears description when explicitly set to null', async () => {
      const created = await service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        description: 'Initial description',
      });

      const updated = await service.update(
        adminAActor,
        projectA.id,
        created.id,
        {
          description: null,
        },
      );

      expect(updated.description).toBeNull();
    });

    it('leaves description unchanged when omitted', async () => {
      const created = await service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        description: 'Initial description',
      });

      const updated = await service.update(
        adminAActor,
        projectA.id,
        created.id,
        {
          name: 'Renamed',
        },
      );

      expect(updated.description).toBe('Initial description');
    });
  });

  describe('delete', () => {
    it('lets an admin delete an owned workflow', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      await service.delete(adminAActor, projectA.id, created.id);

      await expect(
        service.findById(adminAActor, projectA.id, created.id),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('rejects an admin deleting another user workflow with not found', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      await expect(
        service.delete(adminBActor, projectA.id, created.id),
      ).rejects.toThrow(WorkflowNotFoundError);

      const [stillThere] = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, created.id));
      expect(stillThere).toBeDefined();
    });

    it('rejects a viewer attempting to delete', async () => {
      const [seeded] = await db
        .insert(schema.workflows)
        .values({
          id: crypto.randomUUID(),
          projectId: projectA.id,
          name: 'Seeded',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
        })
        .returning();

      await expect(
        service.delete(viewerAActor, projectA.id, seeded.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cascades to workflow steps, workflow runs, and step runs', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );
      const [step] = await db
        .insert(schema.workflowSteps)
        .values({
          id: crypto.randomUUID(),
          workflowId: created.id,
          stepKey: 'step-1',
          type: 'wait',
          position: 0,
          configuration: {},
        })
        .returning();
      const [run] = await db
        .insert(schema.workflowRuns)
        .values({
          id: crypto.randomUUID(),
          workflowId: created.id,
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

      await service.delete(adminAActor, projectA.id, created.id);

      expect(await db.select().from(schema.workflowSteps)).toHaveLength(0);
      expect(await db.select().from(schema.workflowRuns)).toHaveLength(0);
      expect(await db.select().from(schema.stepRuns)).toHaveLength(0);
    });
  });
});
