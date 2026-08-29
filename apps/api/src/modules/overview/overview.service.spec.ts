import { join } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../database/schema';
import type { AppDatabase } from '../../database/database.types';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import { OverviewService } from './overview.service';

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
      name: 'Project',
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
      name: 'Workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      ...overrides,
    })
    .returning();
  return workflow;
}

async function createWorkflowRun(
  db: AppDatabase,
  workflowId: string,
  overrides: Partial<schema.NewWorkflowRun> = {},
) {
  const [run] = await db
    .insert(schema.workflowRuns)
    .values({
      id: crypto.randomUUID(),
      workflowId,
      triggerType: 'manual',
      status: 'success',
      ...overrides,
    })
    .returning();
  return run;
}

describe('OverviewService', () => {
  let db: AppDatabase;
  let connection: Database.Database;
  let service: OverviewService;
  let owner: Awaited<ReturnType<typeof createUser>>;
  let otherOwner: Awaited<ReturnType<typeof createUser>>;
  let ownerActor: AuthenticatedActor;

  beforeEach(async () => {
    ({ db, connection } = createTestDb());
    service = new OverviewService({ db } as never);

    owner = await createUser(db, 'admin');
    otherOwner = await createUser(db, 'admin');
    ownerActor = actorFor(owner);
  });

  afterEach(() => {
    connection.close();
  });

  it('returns an all-empty/zeroed response for an actor with no projects', async () => {
    const result = await service.get(ownerActor);

    expect(result).toEqual({
      metrics: {
        totalProjects: 0,
        activeWorkflows: 0,
        totalRuns: 0,
        failedRuns: 0,
        lastActivity: null,
        nextRun: null,
        nextRunWorkflowName: null,
        nextRunProjectName: null,
      },
      projects: [],
      recentRuns: [],
      upcomingRuns: [],
    });
  });

  it('scopes everything to the actor own projects, excluding other owners', async () => {
    const ownProject = await createProject(db, owner.id, { name: 'Mine' });
    const otherProject = await createProject(db, otherOwner.id, {
      name: 'Not mine',
    });
    await createWorkflow(db, ownProject.id, { name: 'Mine workflow' });
    await createWorkflow(db, otherProject.id, { name: 'Not mine workflow' });

    const result = await service.get(ownerActor);

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].name).toBe('Mine');
    expect(result.metrics.activeWorkflows).toBe(1);
  });

  it('computes totalProjects and per-project totalWorkflows/activeWorkflows', async () => {
    const projectA = await createProject(db, owner.id, { name: 'A' });
    const projectB = await createProject(db, owner.id, { name: 'B' });
    await createWorkflow(db, projectA.id, { enabled: true });
    await createWorkflow(db, projectA.id, { enabled: false });
    await createWorkflow(db, projectB.id, { enabled: true });

    const result = await service.get(ownerActor);

    expect(result.metrics.totalProjects).toBe(2);
    expect(result.metrics.activeWorkflows).toBe(2);

    const summaryA = result.projects.find((p) => p.id === projectA.id);
    const summaryB = result.projects.find((p) => p.id === projectB.id);
    expect(summaryA).toMatchObject({ totalWorkflows: 2, activeWorkflows: 1 });
    expect(summaryB).toMatchObject({ totalWorkflows: 1, activeWorkflows: 1 });
  });

  it("reflects the project's own enabled flag regardless of its workflows", async () => {
    const disabledProject = await createProject(db, owner.id, {
      name: 'Internal API',
      enabled: false,
    });

    const result = await service.get(ownerActor);

    expect(result.projects[0]).toMatchObject({
      id: disabledProject.id,
      enabled: false,
      totalWorkflows: 0,
      activeWorkflows: 0,
    });
  });

  it('windows totalRuns/failedRuns to the last 7 days', async () => {
    const project = await createProject(db, owner.id);
    const workflow = await createWorkflow(db, project.id);
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

    await createWorkflowRun(db, workflow.id, { status: 'success' });
    await createWorkflowRun(db, workflow.id, { status: 'failed' });
    await createWorkflowRun(db, workflow.id, {
      status: 'failed',
      createdAt: eightDaysAgo,
    });

    const result = await service.get(ownerActor);

    expect(result.metrics.totalRuns).toBe(2);
    expect(result.metrics.failedRuns).toBe(1);
  });

  it('computes lastActivity as the most recent startedAt across every project', async () => {
    const projectA = await createProject(db, owner.id);
    const projectB = await createProject(db, owner.id);
    const workflowA = await createWorkflow(db, projectA.id);
    const workflowB = await createWorkflow(db, projectB.id);

    await createWorkflowRun(db, workflowA.id, {
      startedAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 60_000),
    });
    const latest = await createWorkflowRun(db, workflowB.id, {
      startedAt: new Date(),
    });

    const result = await service.get(ownerActor);

    expect(result.metrics.lastActivity).toEqual(latest.startedAt);
  });

  it('computes recentRuns across every project, joined with workflow and project names, newest first', async () => {
    const projectA = await createProject(db, owner.id, { name: 'A' });
    const projectB = await createProject(db, owner.id, { name: 'B' });
    const workflowA = await createWorkflow(db, projectA.id, {
      name: 'Workflow A',
    });
    const workflowB = await createWorkflow(db, projectB.id, {
      name: 'Workflow B',
    });

    await createWorkflowRun(db, workflowA.id, {
      status: 'success',
      createdAt: new Date(Date.now() - 1000),
    });
    await createWorkflowRun(db, workflowB.id, {
      status: 'failed',
      triggerType: 'scheduled',
    });

    const result = await service.get(ownerActor);

    expect(result.recentRuns).toHaveLength(2);
    expect(result.recentRuns[0]).toMatchObject({
      workflowId: workflowB.id,
      workflowName: 'Workflow B',
      projectId: projectB.id,
      projectName: 'B',
      status: 'failed',
      triggerType: 'scheduled',
    });
    expect(result.recentRuns[1]).toMatchObject({
      workflowId: workflowA.id,
      workflowName: 'Workflow A',
      projectId: projectA.id,
      projectName: 'A',
      status: 'success',
    });
  });

  it('resolves failedStepKey for a failed run in recentRuns', async () => {
    const project = await createProject(db, owner.id);
    const workflow = await createWorkflow(db, project.id);
    const [step] = await db
      .insert(schema.workflowSteps)
      .values({
        id: crypto.randomUUID(),
        workflowId: workflow.id,
        stepKey: 'update_activity',
        type: 'wait',
        position: 0,
        configuration: {},
      })
      .returning();
    const run = await createWorkflowRun(db, workflow.id, { status: 'failed' });
    await db.insert(schema.stepRuns).values({
      id: crypto.randomUUID(),
      workflowRunId: run.id,
      workflowStepId: step.id,
      position: 0,
      status: 'failed',
    });

    const result = await service.get(ownerActor);

    expect(result.recentRuns[0].failedStepKey).toBe('update_activity');
  });

  it('bounds recentRuns to the most recent 10 runs', async () => {
    const project = await createProject(db, owner.id);
    const workflow = await createWorkflow(db, project.id);
    for (let i = 0; i < 12; i++) {
      await createWorkflowRun(db, workflow.id, {
        createdAt: new Date(Date.now() - i * 1000),
      });
    }

    const result = await service.get(ownerActor);

    expect(result.recentRuns).toHaveLength(10);
  });

  it('computes upcomingRuns only for enabled workflows, sorted ascending by nextRun', async () => {
    const project = await createProject(db, owner.id, { name: 'Production' });
    const hourly = await createWorkflow(db, project.id, {
      name: 'Hourly',
      cronExpression: '0 * * * *',
      enabled: true,
    });
    const daily = await createWorkflow(db, project.id, {
      name: 'Daily',
      cronExpression: '0 0 * * *',
      enabled: true,
    });
    await createWorkflow(db, project.id, {
      name: 'Disabled',
      cronExpression: '0 * * * *',
      enabled: false,
    });

    const result = await service.get(ownerActor);

    expect(result.upcomingRuns.map((r) => r.workflowId)).toEqual([
      hourly.id,
      daily.id,
    ]);
    expect(result.upcomingRuns[0]).toMatchObject({
      workflowId: hourly.id,
      workflowName: 'Hourly',
      projectId: project.id,
      projectName: 'Production',
      cronExpression: '0 * * * *',
    });
    expect(result.upcomingRuns[0].nextRun.getTime()).toBeLessThanOrEqual(
      result.upcomingRuns[1].nextRun.getTime(),
    );
  });

  it('bounds upcomingRuns to 10 entries', async () => {
    const project = await createProject(db, owner.id);
    for (let i = 0; i < 12; i++) {
      await createWorkflow(db, project.id, {
        cronExpression: `${i} * * * *`,
        enabled: true,
      });
    }

    const result = await service.get(ownerActor);

    expect(result.upcomingRuns).toHaveLength(10);
  });

  it("sets metrics.nextRun/nextRunWorkflowName/nextRunProjectName from the earliest upcoming run", async () => {
    const project = await createProject(db, owner.id, { name: 'Production' });
    const workflow = await createWorkflow(db, project.id, {
      name: 'Database Keepalive',
      cronExpression: '0 * * * *',
      enabled: true,
    });

    const result = await service.get(ownerActor);

    expect(result.metrics.nextRun).toEqual(result.upcomingRuns[0]?.nextRun);
    expect(result.metrics.nextRunWorkflowName).toBe('Database Keepalive');
    expect(result.metrics.nextRunProjectName).toBe('Production');
    expect(workflow.enabled).toBe(true);
  });

  it('sets a project summary nextRun to the earliest upcoming run within that project only', async () => {
    const projectA = await createProject(db, owner.id, { name: 'A' });
    const projectB = await createProject(db, owner.id, { name: 'B' });
    await createWorkflow(db, projectA.id, {
      cronExpression: '0 0 * * *',
      enabled: true,
    });
    const soonInB = await createWorkflow(db, projectB.id, {
      cronExpression: '0 * * * *',
      enabled: true,
    });

    const result = await service.get(ownerActor);

    const summaryB = result.projects.find((p) => p.id === projectB.id);
    expect(summaryB?.nextRun).toEqual(
      result.upcomingRuns.find((r) => r.workflowId === soonInB.id)?.nextRun,
    );
  });

  it('leaves nextRun/lastActivity null for a project with no runs or enabled workflows', async () => {
    const project = await createProject(db, owner.id);
    await createWorkflow(db, project.id, { enabled: false });

    const result = await service.get(ownerActor);

    expect(result.projects[0]).toMatchObject({
      lastActivity: null,
      nextRun: null,
    });
  });
});
