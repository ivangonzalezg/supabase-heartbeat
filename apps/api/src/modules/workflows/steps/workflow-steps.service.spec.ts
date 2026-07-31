import { join } from 'path';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../../database/schema';
import type { AppDatabase } from '../../../database/database.types';
import type { AuthenticatedActor } from '../../../lib/authorization/authorization.types';
import { ProjectNotFoundError } from '../../projects/projects.errors';
import { WorkflowNotFoundError } from '../workflows.errors';
import { WorkflowStepsService } from './workflow-steps.service';
import {
  DuplicateStepKeyError,
  LastStepDeletionError,
  WorkflowStepNotFoundError,
  WorkflowStepOrderConflictError,
} from './workflow-steps.errors';

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

async function createWorkflow(
  db: AppDatabase,
  projectId: string,
  overrides: Partial<schema.NewWorkflow> = {},
) {
  const [workflow] = await db
    .insert(schema.workflows)
    .values({
      id: crypto.randomUUID(),
      projectId,
      name: 'Test Workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      ...overrides,
    })
    .returning();
  return workflow;
}

async function createStep(
  db: AppDatabase,
  workflowId: string,
  overrides: Partial<schema.NewWorkflowStep> = {},
) {
  const [step] = await db
    .insert(schema.workflowSteps)
    .values({
      id: crypto.randomUUID(),
      workflowId,
      stepKey: 'step',
      type: 'wait',
      position: 0,
      configuration: { seconds: 1 },
      ...overrides,
    })
    .returning();
  return step;
}

function actorFor(user: {
  id: string;
  role: string | null;
}): AuthenticatedActor {
  return { userId: user.id, role: user.role as 'admin' | 'viewer' };
}

describe('WorkflowStepsService', () => {
  let db: AppDatabase;
  let connection: Database.Database;
  let service: WorkflowStepsService;

  let adminA: Awaited<ReturnType<typeof createUser>>;
  let adminB: Awaited<ReturnType<typeof createUser>>;
  let viewerA: Awaited<ReturnType<typeof createUser>>;
  let adminAActor: AuthenticatedActor;
  let adminBActor: AuthenticatedActor;
  let viewerAActor: AuthenticatedActor;

  let projectA: Awaited<ReturnType<typeof createProject>>;
  let projectB: Awaited<ReturnType<typeof createProject>>;
  let projectViewer: Awaited<ReturnType<typeof createProject>>;

  let workflowA: Awaited<ReturnType<typeof createWorkflow>>;
  let workflowB: Awaited<ReturnType<typeof createWorkflow>>;
  let workflowViewer: Awaited<ReturnType<typeof createWorkflow>>;

  beforeEach(async () => {
    ({ db, connection } = createTestDb());
    service = new WorkflowStepsService({ db } as never);

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

    workflowA = await createWorkflow(db, projectA.id, { name: 'Workflow A' });
    workflowB = await createWorkflow(db, projectB.id, { name: 'Workflow B' });
    workflowViewer = await createWorkflow(db, projectViewer.id, {
      name: 'Workflow Viewer',
    });
  });

  afterEach(() => {
    connection.close();
  });

  describe('list', () => {
    it('lists steps ordered by position ascending', async () => {
      await createStep(db, workflowA.id, { stepKey: 'b', position: 1 });
      await createStep(db, workflowA.id, { stepKey: 'a', position: 0 });

      const result = await service.list(adminAActor, projectA.id, workflowA.id);

      expect(result.map((s) => s.stepKey)).toEqual(['a', 'b']);
    });

    it('lets a viewer list steps in their own project', async () => {
      await createStep(db, workflowViewer.id);

      const result = await service.list(
        viewerAActor,
        projectViewer.id,
        workflowViewer.id,
      );

      expect(result).toHaveLength(1);
    });

    it('rejects listing under a foreign project with not found', async () => {
      await expect(
        service.list(adminAActor, projectB.id, workflowB.id),
      ).rejects.toThrow(ProjectNotFoundError);
    });

    it('rejects a workflow ID from a different project with not found', async () => {
      await expect(
        service.list(adminAActor, projectA.id, workflowB.id),
      ).rejects.toThrow(WorkflowNotFoundError);
    });
  });

  describe('findById', () => {
    it('reads a step scoped by workflow', async () => {
      const step = await createStep(db, workflowA.id);

      const found = await service.findById(
        adminAActor,
        projectA.id,
        workflowA.id,
        step.id,
      );

      expect(found.id).toBe(step.id);
    });

    it('rejects a step belonging to a different workflow with not found', async () => {
      const step = await createStep(db, workflowB.id);

      await expect(
        service.findById(adminAActor, projectA.id, workflowA.id, step.id),
      ).rejects.toThrow(WorkflowStepNotFoundError);
    });

    it('rejects a nonexistent step with not found', async () => {
      await expect(
        service.findById(
          adminAActor,
          projectA.id,
          workflowA.id,
          crypto.randomUUID(),
        ),
      ).rejects.toThrow(WorkflowStepNotFoundError);
    });

    it('rejects cross-owner access with not found', async () => {
      const step = await createStep(db, workflowB.id);

      await expect(
        service.findById(adminAActor, projectB.id, workflowB.id, step.id),
      ).rejects.toThrow(ProjectNotFoundError);
    });
  });

  describe('create', () => {
    it('appends a step at position 0 for an empty workflow', async () => {
      const step = await service.create(
        adminAActor,
        projectA.id,
        workflowA.id,
        {
          stepKey: 'first',
          type: 'signin',
          configuration: {},
        },
      );

      expect(step.position).toBe(0);
    });

    it('appends a step at MAX(position) + 1', async () => {
      await createStep(db, workflowA.id, { stepKey: 'existing', position: 0 });
      await createStep(db, workflowA.id, {
        stepKey: 'existing-2',
        position: 1,
      });

      const step = await service.create(
        adminAActor,
        projectA.id,
        workflowA.id,
        {
          stepKey: 'new',
          type: 'signout',
          configuration: {},
        },
      );

      expect(step.position).toBe(2);
    });

    it('rejects a viewer attempting to append', async () => {
      await expect(
        service.create(viewerAActor, projectA.id, workflowA.id, {
          stepKey: 'first',
          type: 'signin',
          configuration: {},
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a duplicate stepKey within the same workflow with conflict', async () => {
      await createStep(db, workflowA.id, { stepKey: 'dup', position: 0 });

      await expect(
        service.create(adminAActor, projectA.id, workflowA.id, {
          stepKey: 'dup',
          type: 'signin',
          configuration: {},
        }),
      ).rejects.toThrow(DuplicateStepKeyError);
    });

    it('rejects appending under a foreign workflow with not found', async () => {
      await expect(
        service.create(adminAActor, projectA.id, workflowB.id, {
          stepKey: 'first',
          type: 'signin',
          configuration: {},
        }),
      ).rejects.toThrow(WorkflowNotFoundError);
    });
  });

  describe('update', () => {
    it('applies a valid partial update', async () => {
      const step = await createStep(db, workflowA.id, {
        stepKey: 'wait-step',
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const updated = await service.update(
        adminAActor,
        projectA.id,
        workflowA.id,
        step.id,
        { configuration: { seconds: 30 } },
      );

      expect(updated.configuration).toEqual({ seconds: 30 });
    });

    it('rejects a merged type+configuration mismatch', async () => {
      const step = await createStep(db, workflowA.id, {
        stepKey: 'wait-step',
        type: 'wait',
        configuration: { seconds: 1 },
      });

      await expect(
        service.update(adminAActor, projectA.id, workflowA.id, step.id, {
          type: 'signout',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a simultaneous type+configuration change validated as the new pair', async () => {
      const step = await createStep(db, workflowA.id, {
        stepKey: 'wait-step',
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const updated = await service.update(
        adminAActor,
        projectA.id,
        workflowA.id,
        step.id,
        { type: 'signout', configuration: {} },
      );

      expect(updated.type).toBe('signout');
      expect(updated.configuration).toEqual({});
    });

    it('updates enabled independently', async () => {
      const step = await createStep(db, workflowA.id, { enabled: true });

      const updated = await service.update(
        adminAActor,
        projectA.id,
        workflowA.id,
        step.id,
        { enabled: false },
      );

      expect(updated.enabled).toBe(false);
    });

    it('never accepts a position field', async () => {
      const step = await createStep(db, workflowA.id, { position: 0 });

      const updated = await service.update(
        adminAActor,
        projectA.id,
        workflowA.id,
        step.id,
        { ...({ position: 99 } as Record<string, unknown>), enabled: false },
      );

      expect(updated.position).toBe(0);
    });

    it('rejects a viewer attempting to update', async () => {
      const step = await createStep(db, workflowA.id);

      await expect(
        service.update(viewerAActor, projectA.id, workflowA.id, step.id, {
          enabled: false,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an empty update body', async () => {
      const step = await createStep(db, workflowA.id);

      await expect(
        service.update(adminAActor, projectA.id, workflowA.id, step.id, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cross-owner update with not found', async () => {
      const step = await createStep(db, workflowB.id);

      await expect(
        service.update(adminAActor, projectA.id, workflowA.id, step.id, {
          enabled: false,
        }),
      ).rejects.toThrow(WorkflowStepNotFoundError);
    });

    it('rejects renaming to a stepKey already used in the same workflow with conflict', async () => {
      await createStep(db, workflowA.id, { stepKey: 'taken', position: 0 });
      const step = await createStep(db, workflowA.id, {
        stepKey: 'renameable',
        position: 1,
      });

      await expect(
        service.update(adminAActor, projectA.id, workflowA.id, step.id, {
          stepKey: 'taken',
        }),
      ).rejects.toThrow(DuplicateStepKeyError);
    });
  });

  describe('delete', () => {
    it('deletes a step and compacts remaining positions contiguously', async () => {
      await createStep(db, workflowA.id, { stepKey: 's0', position: 0 });
      const s1 = await createStep(db, workflowA.id, {
        stepKey: 's1',
        position: 1,
      });
      await createStep(db, workflowA.id, { stepKey: 's2', position: 2 });
      await createStep(db, workflowA.id, { stepKey: 's3', position: 3 });

      await service.delete(adminAActor, projectA.id, workflowA.id, s1.id);

      const remaining = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.workflowId, workflowA.id))
        .orderBy(asc(schema.workflowSteps.position));

      expect(remaining.map((s) => [s.stepKey, s.position])).toEqual([
        ['s0', 0],
        ['s2', 1],
        ['s3', 2],
      ]);
    });

    it('rejects a viewer attempting to delete', async () => {
      await createStep(db, workflowA.id, { stepKey: 's0', position: 0 });
      const step = await createStep(db, workflowA.id, {
        stepKey: 's1',
        position: 1,
      });

      await expect(
        service.delete(viewerAActor, projectA.id, workflowA.id, step.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cross-owner delete with not found', async () => {
      const step = await createStep(db, workflowB.id);

      await expect(
        service.delete(adminAActor, projectA.id, workflowA.id, step.id),
      ).rejects.toThrow(WorkflowStepNotFoundError);
    });

    it('rejects deleting the last remaining step with conflict', async () => {
      const step = await createStep(db, workflowA.id);

      await expect(
        service.delete(adminAActor, projectA.id, workflowA.id, step.id),
      ).rejects.toThrow(LastStepDeletionError);

      const stillThere = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.id, step.id));
      expect(stillThere).toHaveLength(1);
    });

    it('enforces the unique position constraint is never violated during compaction', async () => {
      const steps = await Promise.all(
        [0, 1, 2].map((position) =>
          createStep(db, workflowA.id, {
            stepKey: `s${position}`,
            position,
          }),
        ),
      );

      await service.delete(adminAActor, projectA.id, workflowA.id, steps[0].id);

      const positions = (
        await db
          .select({ position: schema.workflowSteps.position })
          .from(schema.workflowSteps)
          .where(eq(schema.workflowSteps.workflowId, workflowA.id))
      ).map((r) => r.position);
      expect(new Set(positions).size).toBe(positions.length);
    });
  });

  describe('reorder', () => {
    async function seedFourSteps() {
      const a = await createStep(db, workflowA.id, {
        stepKey: 'a',
        position: 0,
      });
      const b = await createStep(db, workflowA.id, {
        stepKey: 'b',
        position: 1,
      });
      const c = await createStep(db, workflowA.id, {
        stepKey: 'c',
        position: 2,
      });
      const d = await createStep(db, workflowA.id, {
        stepKey: 'd',
        position: 3,
      });
      return { a, b, c, d };
    }

    it('lets an admin reverse an owned workflow steps order', async () => {
      const { a, b, c, d } = await seedFourSteps();

      const result = await service.reorder(
        adminAActor,
        projectA.id,
        workflowA.id,
        { stepIds: [d.id, c.id, b.id, a.id] },
      );

      expect(result.map((s) => s.stepKey)).toEqual(['d', 'c', 'b', 'a']);
      expect(result.map((s) => s.position)).toEqual([0, 1, 2, 3]);
    });

    it('persists an arbitrary valid order correctly', async () => {
      const { a, b, c, d } = await seedFourSteps();

      await service.reorder(adminAActor, projectA.id, workflowA.id, {
        stepIds: [c.id, a.id, d.id, b.id],
      });

      const persisted = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.workflowId, workflowA.id))
        .orderBy(asc(schema.workflowSteps.position));
      expect(persisted.map((s) => s.stepKey)).toEqual(['c', 'a', 'd', 'b']);
    });

    it('assigns exactly contiguous 0..n-1 positions', async () => {
      const { a, b, c, d } = await seedFourSteps();

      const result = await service.reorder(
        adminAActor,
        projectA.id,
        workflowA.id,
        { stepIds: [b.id, d.id, a.id, c.id] },
      );

      expect(result.map((s) => s.position)).toEqual([0, 1, 2, 3]);
    });

    it('returns the response ordered exactly as the submitted stepIds', async () => {
      const { a, b, c, d } = await seedFourSteps();

      const result = await service.reorder(
        adminAActor,
        projectA.id,
        workflowA.id,
        { stepIds: [b.id, d.id, a.id, c.id] },
      );

      expect(result.map((s) => s.id)).toEqual([b.id, d.id, a.id, c.id]);
    });

    it('succeeds as a no-op when submitting the current order', async () => {
      const { a, b, c, d } = await seedFourSteps();

      const result = await service.reorder(
        adminAActor,
        projectA.id,
        workflowA.id,
        { stepIds: [a.id, b.id, c.id, d.id] },
      );

      expect(result.map((s) => [s.stepKey, s.position])).toEqual([
        ['a', 0],
        ['b', 1],
        ['c', 2],
        ['d', 3],
      ]);
    });

    it('does not write any row when the submitted order is a no-op', async () => {
      const { a, b, c, d } = await seedFourSteps();
      void b;
      void c;

      await service.reorder(adminAActor, projectA.id, workflowA.id, {
        stepIds: [a.id, b.id, c.id, d.id],
      });

      const after = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.id, a.id));
      expect(after[0].updatedAt.getTime()).toBe(a.updatedAt.getTime());
    });

    it('rejects a request missing a current step ID with conflict', async () => {
      const { a, b, c } = await seedFourSteps();

      await expect(
        service.reorder(adminAActor, projectA.id, workflowA.id, {
          stepIds: [a.id, b.id, c.id],
        }),
      ).rejects.toThrow(WorkflowStepOrderConflictError);
    });

    it('rejects a request with an extra unknown step ID with conflict', async () => {
      const { a, b, c, d } = await seedFourSteps();

      await expect(
        service.reorder(adminAActor, projectA.id, workflowA.id, {
          stepIds: [a.id, b.id, c.id, d.id, crypto.randomUUID()],
        }),
      ).rejects.toThrow(WorkflowStepOrderConflictError);
    });

    it('rejects a request containing a step ID from another workflow with conflict', async () => {
      const { a, b, c, d } = await seedFourSteps();
      const foreign = await createStep(db, workflowB.id, { stepKey: 'x' });

      await expect(
        service.reorder(adminAActor, projectA.id, workflowA.id, {
          stepIds: [a.id, b.id, c.id, foreign.id],
        }),
      ).rejects.toThrow(WorkflowStepOrderConflictError);

      // d, the actually-missing step, still occupies its original position.
      const dRow = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.id, d.id));
      expect(dRow[0].position).toBe(3);
    });

    it('rejects a viewer attempting to reorder', async () => {
      const { a, b, c, d } = await seedFourSteps();

      await expect(
        service.reorder(viewerAActor, projectA.id, workflowA.id, {
          stepIds: [d.id, c.id, b.id, a.id],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects another owner attempting to reorder with not found', async () => {
      const { a, b, c, d } = await seedFourSteps();

      // adminB does not own projectA at all, so this is caught by the
      // project-ownership check rather than the workflow lookup — both
      // are NotFoundException subclasses and produce the same 404.
      await expect(
        service.reorder(adminBActor, projectA.id, workflowA.id, {
          stepIds: [d.id, c.id, b.id, a.id],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a mismatched project/workflow hierarchy with not found', async () => {
      const { a, b, c, d } = await seedFourSteps();

      await expect(
        service.reorder(adminAActor, projectA.id, workflowB.id, {
          stepIds: [d.id, c.id, b.id, a.id],
        }),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('rejects reordering under a foreign project with not found', async () => {
      const { a, b, c, d } = await seedFourSteps();

      await expect(
        service.reorder(adminAActor, projectB.id, workflowA.id, {
          stepIds: [d.id, c.id, b.id, a.id],
        }),
      ).rejects.toThrow(ProjectNotFoundError);
    });

    it('never violates the unique position constraint during reorder', async () => {
      const { a, b, c, d } = await seedFourSteps();

      await service.reorder(adminAActor, projectA.id, workflowA.id, {
        stepIds: [d.id, a.id, c.id, b.id],
      });

      const positions = (
        await db
          .select({ position: schema.workflowSteps.position })
          .from(schema.workflowSteps)
          .where(eq(schema.workflowSteps.workflowId, workflowA.id))
      ).map((r) => r.position);
      expect(new Set(positions).size).toBe(positions.length);
      expect(positions.every((p) => p >= 0)).toBe(true);
    });

    it('leaves every original position untouched when the request is rejected before any write', async () => {
      const { a, b, c } = await seedFourSteps();

      await expect(
        service.reorder(adminAActor, projectA.id, workflowA.id, {
          stepIds: [a.id, b.id, c.id],
        }),
      ).rejects.toThrow(WorkflowStepOrderConflictError);

      const persisted = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.workflowId, workflowA.id))
        .orderBy(asc(schema.workflowSteps.position));
      expect(persisted.map((s) => [s.stepKey, s.position])).toEqual([
        ['a', 0],
        ['b', 1],
        ['c', 2],
        ['d', 3],
      ]);
      // No row was ever moved to a temporary position — the conflict is
      // detected before applyContiguousPositions runs at all.
      expect(persisted.every((s) => s.position < 4)).toBe(true);
    });

    it('bumps updatedAt only for steps whose position actually changes', async () => {
      const { a, b, c, d } = await seedFourSteps();

      // Swap only b and c; a and d keep their position.
      await service.reorder(adminAActor, projectA.id, workflowA.id, {
        stepIds: [a.id, c.id, b.id, d.id],
      });

      const rows = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.workflowId, workflowA.id));
      const byId = new Map(rows.map((row) => [row.id, row]));

      expect(byId.get(a.id)?.updatedAt.getTime()).toBe(a.updatedAt.getTime());
      expect(byId.get(d.id)?.updatedAt.getTime()).toBe(d.updatedAt.getTime());
      expect(byId.get(b.id)?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        b.updatedAt.getTime(),
      );
      expect(byId.get(c.id)?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        c.updatedAt.getTime(),
      );
    });

    it('leaves every other field unchanged besides position and updatedAt', async () => {
      const { a, b, c, d } = await seedFourSteps();

      const result = await service.reorder(
        adminAActor,
        projectA.id,
        workflowA.id,
        { stepIds: [d.id, c.id, b.id, a.id] },
      );

      const dResult = result.find((s) => s.id === d.id);
      expect(dResult).toMatchObject({
        id: d.id,
        workflowId: workflowA.id,
        stepKey: 'd',
        type: 'wait',
        configuration: { seconds: 1 },
        enabled: true,
        createdAt: d.createdAt,
      });
    });
  });
});
