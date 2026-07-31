import { join } from 'path';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './index';

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

function createTestDb(): { db: TestDb; connection: Database.Database } {
  const connection = new Database(':memory:');
  connection.pragma('foreign_keys = ON');

  const db = drizzle(connection, { schema });
  migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });

  return { db, connection };
}

async function createUser(db: TestDb, overrides: Partial<schema.NewUser> = {}) {
  const [user] = await db
    .insert(schema.users)
    .values({
      id: crypto.randomUUID(),
      name: 'Test User',
      email: `${crypto.randomUUID()}@example.com`,
      emailVerified: false,
      ...overrides,
    })
    .returning();
  return user;
}

async function createProject(
  db: TestDb,
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
      publishableKey: 'publishable-key',
      ...overrides,
    })
    .returning();
  return project;
}

async function createWorkflow(
  db: TestDb,
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

async function createWorkflowStep(
  db: TestDb,
  workflowId: string,
  overrides: Partial<schema.NewWorkflowStep> = {},
) {
  const [step] = await db
    .insert(schema.workflowSteps)
    .values({
      id: crypto.randomUUID(),
      workflowId,
      stepKey: 'step-1',
      type: 'http-request',
      position: 0,
      configuration: { url: 'https://example.com' },
      ...overrides,
    })
    .returning();
  return step;
}

async function createWorkflowRun(
  db: TestDb,
  workflowId: string,
  overrides: Partial<schema.NewWorkflowRun> = {},
) {
  const [run] = await db
    .insert(schema.workflowRuns)
    .values({
      id: crypto.randomUUID(),
      workflowId,
      triggerType: 'manual',
      status: 'pending',
      ...overrides,
    })
    .returning();
  return run;
}

async function createStepRun(
  db: TestDb,
  workflowRunId: string,
  workflowStepId: string,
  overrides: Partial<schema.NewStepRun> = {},
) {
  const [stepRun] = await db
    .insert(schema.stepRuns)
    .values({
      id: crypto.randomUUID(),
      workflowRunId,
      workflowStepId,
      position: 0,
      status: 'pending',
      ...overrides,
    })
    .returning();
  return stepRun;
}

describe('database schema', () => {
  let db: TestDb;
  let connection: Database.Database;

  beforeEach(() => {
    ({ db, connection } = createTestDb());
  });

  afterEach(() => {
    connection.close();
  });

  it('creates all expected Better Auth and application tables', () => {
    const tables = connection
      .prepare("select name from sqlite_master where type = 'table'")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        'users',
        'sessions',
        'accounts',
        'verifications',
        'projects',
        'workflows',
        'workflow_steps',
        'workflow_runs',
        'step_runs',
      ]),
    );
  });

  it('lets a user own a project', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);

    expect(project.ownerId).toBe(user.id);
  });

  it('lets a project contain multiple workflows', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    await createWorkflow(db, project.id, { name: 'Workflow A' });
    await createWorkflow(db, project.id, { name: 'Workflow B' });

    const workflows = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.projectId, project.id));

    expect(workflows).toHaveLength(2);
  });

  it('lets a workflow contain ordered steps', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    const workflow = await createWorkflow(db, project.id);
    await createWorkflowStep(db, workflow.id, {
      stepKey: 'first',
      position: 0,
    });
    await createWorkflowStep(db, workflow.id, {
      stepKey: 'second',
      position: 1,
    });

    const steps = await db
      .select()
      .from(schema.workflowSteps)
      .where(eq(schema.workflowSteps.workflowId, workflow.id))
      .orderBy(schema.workflowSteps.position);

    expect(steps.map((s) => s.stepKey)).toEqual(['first', 'second']);
  });

  it('round-trips JSON configuration through TEXT storage', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    const workflow = await createWorkflow(db, project.id);
    const configuration = {
      url: 'https://example.com/webhook',
      retries: 3,
      headers: { 'Content-Type': 'application/json' },
    };
    const step = await createWorkflowStep(db, workflow.id, { configuration });

    const [reloaded] = await db
      .select()
      .from(schema.workflowSteps)
      .where(eq(schema.workflowSteps.id, step.id));

    expect(reloaded.configuration).toEqual(configuration);
  });

  it('rejects a duplicate step_key within the same workflow', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    const workflow = await createWorkflow(db, project.id);
    await createWorkflowStep(db, workflow.id, { stepKey: 'dup', position: 0 });

    await expect(
      createWorkflowStep(db, workflow.id, { stepKey: 'dup', position: 1 }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate position within the same workflow', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    const workflow = await createWorkflow(db, project.id);
    await createWorkflowStep(db, workflow.id, {
      stepKey: 'step-a',
      position: 0,
    });

    await expect(
      createWorkflowStep(db, workflow.id, {
        stepKey: 'step-b',
        position: 0,
      }),
    ).rejects.toThrow();
  });

  it('allows the same step_key in different workflows', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    const workflowA = await createWorkflow(db, project.id, { name: 'A' });
    const workflowB = await createWorkflow(db, project.id, { name: 'B' });

    await expect(
      createWorkflowStep(db, workflowA.id, { stepKey: 'shared', position: 0 }),
    ).resolves.toBeDefined();
    await expect(
      createWorkflowStep(db, workflowB.id, { stepKey: 'shared', position: 0 }),
    ).resolves.toBeDefined();
  });

  it('deletes step runs when their workflow run is deleted', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    const workflow = await createWorkflow(db, project.id);
    const step = await createWorkflowStep(db, workflow.id);
    const run = await createWorkflowRun(db, workflow.id);
    await createStepRun(db, run.id, step.id);

    await db
      .delete(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, run.id));

    const remaining = await db
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.workflowRunId, run.id));
    expect(remaining).toHaveLength(0);
  });

  it('deletes step runs when their workflow step is deleted', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    const workflow = await createWorkflow(db, project.id);
    const step = await createWorkflowStep(db, workflow.id);
    const run = await createWorkflowRun(db, workflow.id);
    await createStepRun(db, run.id, step.id);

    await db
      .delete(schema.workflowSteps)
      .where(eq(schema.workflowSteps.id, step.id));

    const remaining = await db
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.workflowStepId, step.id));
    expect(remaining).toHaveLength(0);
  });

  it('deletes steps, runs, and step runs when a workflow is deleted', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    const workflow = await createWorkflow(db, project.id);
    const step = await createWorkflowStep(db, workflow.id);
    const run = await createWorkflowRun(db, workflow.id);
    await createStepRun(db, run.id, step.id);

    await db
      .delete(schema.workflows)
      .where(eq(schema.workflows.id, workflow.id));

    const remainingSteps = await db
      .select()
      .from(schema.workflowSteps)
      .where(eq(schema.workflowSteps.workflowId, workflow.id));
    const remainingRuns = await db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.workflowId, workflow.id));
    const remainingStepRuns = await db
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.workflowRunId, run.id));

    expect(remainingSteps).toHaveLength(0);
    expect(remainingRuns).toHaveLength(0);
    expect(remainingStepRuns).toHaveLength(0);
  });

  it('deletes workflows, steps, runs, and step runs when a project is deleted', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    const workflow = await createWorkflow(db, project.id);
    const step = await createWorkflowStep(db, workflow.id);
    const run = await createWorkflowRun(db, workflow.id);
    await createStepRun(db, run.id, step.id);

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));

    const remainingWorkflows = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.projectId, project.id));
    const remainingSteps = await db
      .select()
      .from(schema.workflowSteps)
      .where(eq(schema.workflowSteps.workflowId, workflow.id));
    const remainingRuns = await db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.workflowId, workflow.id));
    const remainingStepRuns = await db
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.workflowRunId, run.id));

    expect(remainingWorkflows).toHaveLength(0);
    expect(remainingSteps).toHaveLength(0);
    expect(remainingRuns).toHaveLength(0);
    expect(remainingStepRuns).toHaveLength(0);
  });

  it('deletes the complete owned hierarchy when a user is deleted, with no orphans', async () => {
    const user = await createUser(db);
    const project = await createProject(db, user.id);
    const workflow = await createWorkflow(db, project.id);
    const step = await createWorkflowStep(db, workflow.id);
    const run = await createWorkflowRun(db, workflow.id);
    await createStepRun(db, run.id, step.id);

    await db.delete(schema.users).where(eq(schema.users.id, user.id));

    const remainingProjects = await db.select().from(schema.projects);
    const remainingWorkflows = await db.select().from(schema.workflows);
    const remainingSteps = await db.select().from(schema.workflowSteps);
    const remainingRuns = await db.select().from(schema.workflowRuns);
    const remainingStepRuns = await db.select().from(schema.stepRuns);

    expect(remainingProjects).toHaveLength(0);
    expect(remainingWorkflows).toHaveLength(0);
    expect(remainingSteps).toHaveLength(0);
    expect(remainingRuns).toHaveLength(0);
    expect(remainingStepRuns).toHaveLength(0);
  });
});
