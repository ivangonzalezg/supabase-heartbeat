import { join } from 'path';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../database/schema';
import type { AppDatabase } from '../../database/database.types';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import { CronJob } from 'cron';
import { WorkflowsService } from './workflows.service';
import { WorkflowNotFoundError } from './workflows.errors';
import { ProjectNotFoundError } from '../projects/projects.errors';
import { WorkflowRunsService } from './runs/workflow-runs.service';

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
  steps: [
    { stepKey: 'wait_1', type: 'wait' as const, configuration: { seconds: 5 } },
  ],
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
    service = new WorkflowsService(
      { db } as never,
      new WorkflowRunsService({ db } as never, {} as never, {} as never),
    );

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

    it('persists a single step at position 0 and returns it in the response', async () => {
      const workflow = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      expect(workflow.steps).toHaveLength(1);
      expect(workflow.steps[0]).toMatchObject({
        stepKey: 'wait_1',
        type: 'wait',
        position: 0,
        configuration: { seconds: 5 },
        enabled: true,
      });

      const persisted = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.workflowId, workflow.id));
      expect(persisted).toHaveLength(1);
      expect(persisted[0].position).toBe(0);
    });

    it('persists multiple steps with server-assigned sequential positions matching array order', async () => {
      const workflow = await service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        steps: [
          {
            stepKey: 'first',
            type: 'signin',
            configuration: {
              email: 'heartbeat-user@example.com',
              password: 'test-password',
            },
          },
          { stepKey: 'second', type: 'wait', configuration: { seconds: 1 } },
          { stepKey: 'third', type: 'signout', configuration: {} },
        ],
      });

      expect(workflow.steps.map((s) => [s.stepKey, s.position])).toEqual([
        ['first', 0],
        ['second', 1],
        ['third', 2],
      ]);
    });

    it('rolls back the workflow and all earlier steps when a later step insert fails', async () => {
      const beforeWorkflowCount = (await db.select().from(schema.workflows))
        .length;

      await expect(
        service.create(adminAActor, projectA.id, {
          ...validCreateInput,
          steps: [
            {
              stepKey: 'first',
              type: 'signin',
              configuration: {
                email: 'heartbeat-user@example.com',
                password: 'test-password',
              },
            },
            { stepKey: 'second', type: 'wait', configuration: { seconds: 1 } },
            // Duplicate stepKey within the same workflow forces the
            // database's own unique constraint to reject this insert,
            // simulating a failure during a later step.
            { stepKey: 'first', type: 'signout', configuration: {} },
          ],
        }),
      ).rejects.toThrow();

      const afterWorkflowCount = (await db.select().from(schema.workflows))
        .length;
      expect(afterWorkflowCount).toBe(beforeWorkflowCount);

      const allSteps = await db.select().from(schema.workflowSteps);
      expect(allSteps).toHaveLength(0);
    });
  });

  describe('output references', () => {
    it('creates a workflow whose steps contain valid earlier-step references', async () => {
      const workflow = await service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        steps: [
          {
            stepKey: 'create_record',
            type: 'insert',
            configuration: { table: 't', values: { name: 'x' } },
          },
          {
            stepKey: 'delete_record',
            type: 'delete',
            configuration: {
              table: 't',
              filter: {
                column: 'id',
                operator: 'eq',
                value: '${steps.create_record.output.rows.0.id}',
              },
            },
          },
        ],
      });

      expect(workflow.steps).toHaveLength(2);
    });

    it('rolls back the entire creation when a step references an unknown step', async () => {
      const beforeWorkflowCount = (await db.select().from(schema.workflows))
        .length;

      await expect(
        service.create(adminAActor, projectA.id, {
          ...validCreateInput,
          steps: [
            {
              stepKey: 'delete_record',
              type: 'delete',
              configuration: {
                table: 't',
                filter: {
                  column: 'id',
                  operator: 'eq',
                  value: '${steps.unknown_step.output.id}',
                },
              },
            },
          ],
        }),
      ).rejects.toThrow();

      const afterWorkflowCount = (await db.select().from(schema.workflows))
        .length;
      expect(afterWorkflowCount).toBe(beforeWorkflowCount);
      expect(await db.select().from(schema.workflowSteps)).toHaveLength(0);
    });

    it('rolls back the entire creation when a step references a later step', async () => {
      const beforeWorkflowCount = (await db.select().from(schema.workflows))
        .length;

      await expect(
        service.create(adminAActor, projectA.id, {
          ...validCreateInput,
          steps: [
            {
              stepKey: 'delete_record',
              type: 'delete',
              configuration: {
                table: 't',
                filter: {
                  column: 'id',
                  operator: 'eq',
                  value: '${steps.create_record.output.rows.0.id}',
                },
              },
            },
            {
              stepKey: 'create_record',
              type: 'insert',
              configuration: { table: 't', values: { name: 'x' } },
            },
          ],
        }),
      ).rejects.toThrow();

      const afterWorkflowCount = (await db.select().from(schema.workflows))
        .length;
      expect(afterWorkflowCount).toBe(beforeWorkflowCount);
      expect(await db.select().from(schema.workflowSteps)).toHaveLength(0);
    });

    it('rejects a dangerous path segment during creation and creates no workflow run', async () => {
      const beforeWorkflowCount = (await db.select().from(schema.workflows))
        .length;

      await expect(
        service.create(adminAActor, projectA.id, {
          ...validCreateInput,
          steps: [
            {
              stepKey: 'create_record',
              type: 'insert',
              configuration: { table: 't', values: { name: 'x' } },
            },
            {
              stepKey: 'delete_record',
              type: 'delete',
              configuration: {
                table: 't',
                filter: {
                  column: 'id',
                  operator: 'eq',
                  value: '${steps.create_record.output.__proto__}',
                },
              },
            },
          ],
        }),
      ).rejects.toThrow();

      const afterWorkflowCount = (await db.select().from(schema.workflows))
        .length;
      expect(afterWorkflowCount).toBe(beforeWorkflowCount);
      expect(await db.select().from(schema.workflowSteps)).toHaveLength(0);
      // No workflow_run row is ever created for a structurally invalid
      // aggregate, since validation happens before any run can be
      // requested for a workflow that itself failed to persist.
      expect(await db.select().from(schema.workflowRuns)).toHaveLength(0);
    });

    it('rejects a reference to a disabled step', async () => {
      await expect(
        service.create(adminAActor, projectA.id, {
          ...validCreateInput,
          steps: [
            {
              stepKey: 'create_record',
              type: 'insert',
              configuration: { table: 't', values: { name: 'x' } },
              enabled: false,
            },
            {
              stepKey: 'delete_record',
              type: 'delete',
              configuration: {
                table: 't',
                filter: {
                  column: 'id',
                  operator: 'eq',
                  value: '${steps.create_record.output.rows.0.id}',
                },
              },
            },
          ],
        }),
      ).rejects.toThrow();
    });

    it('rejects partial interpolation', async () => {
      await expect(
        service.create(adminAActor, projectA.id, {
          ...validCreateInput,
          steps: [
            {
              stepKey: 'create_record',
              type: 'insert',
              configuration: { table: 't', values: { name: 'x' } },
            },
            {
              stepKey: 'notify',
              type: 'invoke_function',
              configuration: {
                functionName: 'fn',
                body: {
                  message: 'created ${steps.create_record.output.rows.0.id}',
                },
              },
            },
          ],
        }),
      ).rejects.toThrow();
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

  describe('replace', () => {
    const seedThreeSteps = () =>
      service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        steps: [
          { stepKey: 'first', type: 'wait', configuration: { seconds: 1 } },
          { stepKey: 'second', type: 'wait', configuration: { seconds: 2 } },
          { stepKey: 'third', type: 'wait', configuration: { seconds: 3 } },
        ],
      });

    it('updates workflow metadata', async () => {
      const created = await seedThreeSteps();

      const replaced = await service.replace(
        adminAActor,
        projectA.id,
        created.id,
        {
          name: 'Renamed workflow',
          cronExpression: '0 12 * * *',
          timezone: 'America/Bogota',
          enabled: false,
          overlapPolicy: 'skip',
          steps: created.steps.map((step) => ({
            id: step.id,
            stepKey: step.stepKey,
            type: step.type as 'wait',
            configuration: step.configuration,
            enabled: step.enabled,
          })),
        },
      );

      expect(replaced.name).toBe('Renamed workflow');
      expect(replaced.cronExpression).toBe('0 12 * * *');
      expect(replaced.timezone).toBe('America/Bogota');
      expect(replaced.enabled).toBe(false);
    });

    it("keeps an existing step's id when updating it in place", async () => {
      const created = await seedThreeSteps();
      const [first] = created.steps;

      const replaced = await service.replace(
        adminAActor,
        projectA.id,
        created.id,
        {
          ...validCreateInput,
          steps: created.steps.map((step) =>
            step.id === first.id
              ? {
                  id: step.id,
                  stepKey: step.stepKey,
                  type: 'wait' as const,
                  configuration: { seconds: 99 },
                  enabled: step.enabled,
                }
              : {
                  id: step.id,
                  stepKey: step.stepKey,
                  type: step.type as 'wait',
                  configuration: step.configuration,
                  enabled: step.enabled,
                },
          ),
        },
      );

      const updatedFirst = replaced.steps.find((step) => step.id === first.id);
      expect(updatedFirst).toMatchObject({
        stepKey: 'first',
        configuration: { seconds: 99 },
      });
    });

    it('creates a new step for an entry with no id', async () => {
      const created = await seedThreeSteps();

      const replaced = await service.replace(
        adminAActor,
        projectA.id,
        created.id,
        {
          ...validCreateInput,
          steps: [
            ...created.steps.map((step) => ({
              id: step.id,
              stepKey: step.stepKey,
              type: step.type as 'wait',
              configuration: step.configuration,
              enabled: step.enabled,
            })),
            { stepKey: 'fourth', type: 'wait', configuration: { seconds: 4 } },
          ],
        },
      );

      expect(replaced.steps).toHaveLength(4);
      expect(replaced.steps.map((step) => step.stepKey)).toEqual([
        'first',
        'second',
        'third',
        'fourth',
      ]);

      const persisted = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.workflowId, created.id));
      expect(persisted).toHaveLength(4);
    });

    it('deletes a step whose id is absent from the submitted steps', async () => {
      const created = await seedThreeSteps();
      const [first, , third] = created.steps;

      const replaced = await service.replace(
        adminAActor,
        projectA.id,
        created.id,
        {
          ...validCreateInput,
          steps: [
            {
              id: first.id,
              stepKey: first.stepKey,
              type: 'wait' as const,
              configuration: first.configuration,
              enabled: first.enabled,
            },
            {
              id: third.id,
              stepKey: third.stepKey,
              type: 'wait' as const,
              configuration: third.configuration,
              enabled: third.enabled,
            },
          ],
        },
      );

      expect(replaced.steps).toHaveLength(2);
      expect(replaced.steps.map((step) => step.stepKey)).toEqual([
        'first',
        'third',
      ]);

      const persisted = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.workflowId, created.id));
      expect(persisted).toHaveLength(2);
    });

    it('reorders steps to match the submitted array order and reassigns positions', async () => {
      const created = await seedThreeSteps();
      const [first, second, third] = created.steps;

      const replaced = await service.replace(
        adminAActor,
        projectA.id,
        created.id,
        {
          ...validCreateInput,
          steps: [third, second, first].map((step) => ({
            id: step.id,
            stepKey: step.stepKey,
            type: step.type as 'wait',
            configuration: step.configuration,
            enabled: step.enabled,
          })),
        },
      );

      expect(
        replaced.steps.map((step) => [step.stepKey, step.position]),
      ).toEqual([
        ['third', 0],
        ['second', 1],
        ['first', 2],
      ]);

      const persisted = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.workflowId, created.id));
      const positions = persisted.map((step) => step.position).sort();
      expect(positions).toEqual([0, 1, 2]);
    });

    it('rolls back everything when a step in the diff violates a constraint', async () => {
      const created = await seedThreeSteps();
      const beforeSteps = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.workflowId, created.id));
      const beforeWorkflow = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, created.id));

      await expect(
        service.replace(adminAActor, projectA.id, created.id, {
          ...validCreateInput,
          name: 'Should not persist',
          steps: [
            {
              id: created.steps[0].id,
              stepKey: 'duplicate',
              type: 'wait',
              configuration: { seconds: 1 },
            },
            {
              id: created.steps[1].id,
              stepKey: 'duplicate',
              type: 'wait',
              configuration: { seconds: 2 },
            },
          ],
        }),
      ).rejects.toThrow();

      const afterSteps = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.workflowId, created.id));
      const afterWorkflow = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, created.id));

      expect(afterSteps).toEqual(beforeSteps);
      expect(afterWorkflow).toEqual(beforeWorkflow);
    });

    it('rejects an admin replacing a workflow under a project they do not own', async () => {
      const created = await seedThreeSteps();

      await expect(
        service.replace(adminBActor, projectA.id, created.id, {
          ...validCreateInput,
          steps: created.steps.map((step) => ({
            id: step.id,
            stepKey: step.stepKey,
            type: step.type as 'wait',
            configuration: step.configuration,
            enabled: step.enabled,
          })),
        }),
      ).rejects.toThrow(ProjectNotFoundError);
    });

    it('rejects replacing a workflow that does not belong to the route project', async () => {
      const created = await seedThreeSteps();

      await expect(
        service.replace(adminBActor, projectB.id, created.id, {
          ...validCreateInput,
          steps: created.steps.map((step) => ({
            id: step.id,
            stepKey: step.stepKey,
            type: step.type as 'wait',
            configuration: step.configuration,
            enabled: step.enabled,
          })),
        }),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('rejects a viewer attempting to replace', async () => {
      const created = await seedThreeSteps();

      await expect(
        service.replace(viewerAActor, projectA.id, created.id, {
          ...validCreateInput,
          steps: created.steps.map((step) => ({
            id: step.id,
            stepKey: step.stepKey,
            type: step.type as 'wait',
            configuration: step.configuration,
            enabled: step.enabled,
          })),
        }),
      ).rejects.toThrow(ForbiddenException);
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
          stepKey: 'step_2',
          type: 'wait',
          position: 1,
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

  describe('findOverview', () => {
    it('includes the workflow detail fields, including steps', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      const overview = await service.findOverview(
        adminAActor,
        projectA.id,
        created.id,
      );

      expect(overview.id).toBe(created.id);
      expect(overview.name).toBe(validCreateInput.name);
      expect(overview.steps).toHaveLength(1);
    });

    it('includes empty-default metrics and no runs for a workflow with no runs', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      const overview = await service.findOverview(
        adminAActor,
        projectA.id,
        created.id,
      );

      expect(overview.metrics.totalRuns).toBe(0);
      expect(overview.metrics.successRate).toBeNull();
      expect(overview.recentRuns).toEqual([]);
    });

    it('computes nextRun from the cron expression when the workflow is enabled', async () => {
      const created = await service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        enabled: true,
      });

      const overview = await service.findOverview(
        adminAActor,
        projectA.id,
        created.id,
      );

      const expected = CronJob.from({
        cronTime: '0 9 * * *',
        timeZone: 'UTC',
        onTick: () => {},
      })
        .nextDate()
        .toJSDate();

      expect(overview.metrics.nextRun).not.toBeNull();
      // Allow a small tolerance since the expected value is computed a
      // moment after the service's own call.
      expect(
        Math.abs(
          (overview.metrics.nextRun as Date).getTime() - expected.getTime(),
        ),
      ).toBeLessThan(2000);
    });

    it('returns a null nextRun when the workflow is disabled', async () => {
      const created = await service.create(adminAActor, projectA.id, {
        ...validCreateInput,
        enabled: false,
      });

      const overview = await service.findOverview(
        adminAActor,
        projectA.id,
        created.id,
      );

      expect(overview.metrics.nextRun).toBeNull();
    });

    it('rejects another user reading it, with not found', async () => {
      const created = await service.create(
        adminAActor,
        projectA.id,
        validCreateInput,
      );

      await expect(
        service.findOverview(adminBActor, projectA.id, created.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a nonexistent workflow with not found', async () => {
      await expect(
        service.findOverview(adminAActor, projectA.id, crypto.randomUUID()),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('rejects a nonexistent project with not found', async () => {
      await expect(
        service.findOverview(
          adminAActor,
          crypto.randomUUID(),
          crypto.randomUUID(),
        ),
      ).rejects.toThrow(ProjectNotFoundError);
    });
  });
});
