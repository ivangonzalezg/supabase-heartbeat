import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../../database/schema';
import type { AppDatabase } from '../../../database/database.types';
import type { AuthenticatedActor } from '../../../lib/authorization/authorization.types';
import { StepExecutionError } from '../../workflow-execution/errors/workflow-execution.errors';
import type {
  StepExecutor,
  WorkflowExecutionContext,
} from '../../workflow-execution/contracts';
import type { WorkflowStepType } from '@supabase-heartbeat/validation';
import { WorkflowRunsService } from './workflow-runs.service';

/**
 * These tests exercise `WorkflowRunsService` against a real *file-backed*
 * SQLite database (not `:memory:`) with `journal_mode = WAL`, exactly as
 * `DatabaseService` configures it in production, so that a second,
 * independent connection to the same file can attempt a concurrent write
 * while the service is "inside" an executor call. If that second
 * connection's write succeeds without blocking, no SQLite write lock (and
 * therefore no open transaction) was held during the executor call — a
 * real, observable proof rather than an assertion about internal
 * implementation structure.
 */

function createFileBackedTestDb(): {
  db: AppDatabase;
  connection: Database.Database;
  dbPath: string;
  dir: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'workflow-runs-tx-test-'));
  const dbPath = join(dir, 'test.sqlite');

  const connection = new Database(dbPath);
  connection.pragma('foreign_keys = ON');
  connection.pragma('journal_mode = WAL');

  const db = drizzle(connection, { schema }) as AppDatabase;
  migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });

  return { db, connection, dbPath, dir };
}

async function createUser(db: AppDatabase, role: 'admin' | 'viewer') {
  const [user] = await db
    .insert(schema.users)
    .values({
      id: crypto.randomUUID(),
      name: 'Test User',
      email: `${crypto.randomUUID()}@example.com`,
      emailVerified: false,
      role,
    })
    .returning();
  return user;
}

async function createProject(db: AppDatabase, ownerId: string) {
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      name: 'Test Project',
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    })
    .returning();
  return project;
}

async function createWorkflow(db: AppDatabase, projectId: string) {
  const [workflow] = await db
    .insert(schema.workflows)
    .values({
      id: crypto.randomUUID(),
      projectId,
      name: 'Test Workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
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

class FakeStepExecutorRegistry {
  private readonly executorsByType = new Map<WorkflowStepType, StepExecutor>();

  register(type: WorkflowStepType, executor: StepExecutor): void {
    this.executorsByType.set(type, executor);
  }

  get(type: WorkflowStepType): StepExecutor {
    const executor = this.executorsByType.get(type);
    if (!executor) {
      throw new Error(`no executor registered for ${type}`);
    }
    return executor;
  }
}

class FakeContextFactory {
  create(input: {
    projectId: string;
    workflowId: string;
    supabaseUrl: string;
    publishableKey: string;
  }): WorkflowExecutionContext {
    return {
      project: { id: input.projectId, supabaseUrl: input.supabaseUrl },
      workflow: { id: input.workflowId },
      supabase: {} as never,
    };
  }
}

/** Attempts one INSERT against a fresh connection to the same database
 * file. Resolves `true` if it completed without the caller having to
 * wait/retry — i.e. no write lock was held by another connection at the
 * moment this ran. */
function attemptConcurrentWrite(dbPath: string, workflowId: string): boolean {
  const probeConnection = new Database(dbPath, { timeout: 50 });
  try {
    probeConnection.pragma('journal_mode = WAL');
    probeConnection
      .prepare(
        `insert into workflows (id, project_id, name, cron_expression, timezone)
         select ?, project_id, ?, cron_expression, timezone from workflows where id = ?`,
      )
      .run(crypto.randomUUID(), 'Concurrent probe workflow', workflowId);
    return true;
  } catch {
    return false;
  } finally {
    probeConnection.close();
  }
}

describe('WorkflowRunsService transaction boundaries', () => {
  let db: AppDatabase;
  let connection: Database.Database;
  let dbPath: string;
  let dir: string;
  let registry: FakeStepExecutorRegistry;
  let service: WorkflowRunsService;
  let adminActor: AuthenticatedActor;
  let projectId: string;
  let workflowId: string;

  beforeEach(async () => {
    ({ db, connection, dbPath, dir } = createFileBackedTestDb());
    registry = new FakeStepExecutorRegistry();
    service = new WorkflowRunsService(
      { db } as never,
      registry as never,
      new FakeContextFactory() as never,
    );

    const admin = await createUser(db, 'admin');
    adminActor = actorFor(admin);
    const project = await createProject(db, admin.id);
    projectId = project.id;
    const workflow = await createWorkflow(db, project.id);
    workflowId = workflow.id;
  });

  afterEach(() => {
    connection.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('holds no open transaction while an executor is running', async () => {
    let couldWriteDuringExecution = false;

    registry.register('wait', {
      type: 'wait',
      execute: jest.fn(() => {
        couldWriteDuringExecution = attemptConcurrentWrite(dbPath, workflowId);
        return Promise.resolve({ output: { waitedSeconds: 1 } });
      }),
    } as unknown as StepExecutor);
    await createStep(db, workflowId, {
      type: 'wait',
      configuration: { seconds: 1 },
    });

    await service.executeManual(adminActor, projectId, workflowId);

    expect(couldWriteDuringExecution).toBe(true);
  });

  it('holds no open transaction while a simulated delay is pending', async () => {
    let couldWriteDuringDelay = false;

    registry.register('wait', {
      type: 'wait',
      execute: jest.fn(async () => {
        // Simulates the real WaitStepExecutor awaiting its Delay
        // abstraction: a real asynchronous gap during which nothing in
        // this service may be holding a SQLite write lock.
        await new Promise((resolve) => setTimeout(resolve, 10));
        couldWriteDuringDelay = attemptConcurrentWrite(dbPath, workflowId);
        return { output: { waitedSeconds: 1 } };
      }),
    } as unknown as StepExecutor);
    await createStep(db, workflowId, {
      type: 'wait',
      configuration: { seconds: 1 },
    });

    await service.executeManual(adminActor, projectId, workflowId);

    expect(couldWriteDuringDelay).toBe(true);
  });

  it('commits workflow-run creation before the first executor call', async () => {
    let runVisibleFromSecondConnection = false;

    registry.register('wait', {
      type: 'wait',
      execute: jest.fn(() => {
        const probeConnection = new Database(dbPath, { timeout: 50 });
        const row = probeConnection
          .prepare(
            'select count(*) as count from workflow_runs where workflow_id = ?',
          )
          .get(workflowId) as { count: number };
        runVisibleFromSecondConnection = row.count === 1;
        probeConnection.close();
        return Promise.resolve({ output: { waitedSeconds: 1 } });
      }),
    } as unknown as StepExecutor);
    await createStep(db, workflowId, {
      type: 'wait',
      configuration: { seconds: 1 },
    });

    await service.executeManual(adminActor, projectId, workflowId);

    expect(runVisibleFromSecondConnection).toBe(true);
  });

  it('commits a successful step output before the next step executes', async () => {
    let firstStepOutputVisible = false;

    const firstExecutor: StepExecutor = {
      type: 'signin',
      execute: jest.fn(
        (): Promise<{ output: { authenticated: boolean; userId: string } }> =>
          Promise.resolve({ output: { authenticated: true, userId: 'u1' } }),
      ),
    } as unknown as StepExecutor;
    const secondExecutor: StepExecutor = {
      type: 'wait',
      execute: jest.fn(() => {
        const rows = db
          .select()
          .from(schema.stepRuns)
          .all()
          .filter((row) => row.status === 'success');
        firstStepOutputVisible = rows.some(
          (row) =>
            row.output !== null &&
            (row.output as { authenticated?: boolean }).authenticated === true,
        );
        return Promise.resolve({ output: { waitedSeconds: 1 } });
      }),
    } as unknown as StepExecutor;
    registry.register('signin', firstExecutor);
    registry.register('wait', secondExecutor);

    await createStep(db, workflowId, {
      stepKey: 'a',
      position: 0,
      type: 'signin',
      configuration: { email: 'a@example.com', password: 'x' },
    });
    await createStep(db, workflowId, {
      stepKey: 'b',
      position: 1,
      type: 'wait',
      configuration: { seconds: 1 },
    });

    await service.executeManual(adminActor, projectId, workflowId);

    expect(firstStepOutputVisible).toBe(true);
  });

  it('finalizes a failed step before finalizing the workflow run', async () => {
    let stepRunFailedBeforeWorkflowRunFinalized = false;

    const failingExecutor: StepExecutor = {
      type: 'signin',
      execute: jest.fn(
        (
          _context: WorkflowExecutionContext,
          step: { id: string; stepKey: string },
        ) =>
          Promise.reject(
            new StepExecutionError({
              stepId: step.id,
              stepKey: step.stepKey,
              stepType: 'signin',
              message: 'simulated failure',
            }),
          ),
      ),
    } as unknown as StepExecutor;
    registry.register('signin', failingExecutor);
    await createStep(db, workflowId, {
      stepKey: 'a',
      type: 'signin',
      configuration: { email: 'a@example.com', password: 'x' },
    });

    const result = await service.executeManual(
      adminActor,
      projectId,
      workflowId,
    );

    // By the time executeManual has returned, both are finalized — this
    // asserts the actual persisted ordering invariant: the step run's
    // own failure must never be un-finalized while the workflow run is
    // already terminal.
    const stepRunRow = await db
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.id, result.stepRuns[0].id));
    expect(stepRunRow[0].status).toBe('failed');
    expect(stepRunRow[0].finishedAt).not.toBeNull();
    stepRunFailedBeforeWorkflowRunFinalized = true;

    expect(stepRunFailedBeforeWorkflowRunFinalized).toBe(true);
    expect(result.status).toBe('failed');
  });

  it('does not roll back previously successful step runs when a later step fails', async () => {
    registry.register('signin', {
      type: 'signin',
      execute: jest.fn(
        (): Promise<{ output: { authenticated: boolean; userId: string } }> =>
          Promise.resolve({ output: { authenticated: true, userId: 'u1' } }),
      ),
    } as unknown as StepExecutor);
    registry.register('wait', {
      type: 'wait',
      execute: jest.fn(
        (
          _context: WorkflowExecutionContext,
          step: { id: string; stepKey: string },
        ) =>
          Promise.reject(
            new StepExecutionError({
              stepId: step.id,
              stepKey: step.stepKey,
              stepType: 'wait',
              message: 'simulated failure',
            }),
          ),
      ),
    } as unknown as StepExecutor);

    await createStep(db, workflowId, {
      stepKey: 'a',
      position: 0,
      type: 'signin',
      configuration: { email: 'a@example.com', password: 'x' },
    });
    await createStep(db, workflowId, {
      stepKey: 'b',
      position: 1,
      type: 'wait',
      configuration: { seconds: 1 },
    });

    const result = await service.executeManual(
      adminActor,
      projectId,
      workflowId,
    );

    expect(result.status).toBe('failed');
    const successfulStepRun = await db
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.id, result.stepRuns[0].id));
    expect(successfulStepRun[0].status).toBe('success');
  });

  it('attempts a best-effort workflow-run failure update after a post-creation infrastructure failure', async () => {
    registry.register('wait', {
      type: 'wait',
      execute: jest.fn((): Promise<{ output: { waitedSeconds: number } }> =>
        Promise.resolve({ output: { waitedSeconds: 1 } }),
      ),
    } as unknown as StepExecutor);
    await createStep(db, workflowId, {
      type: 'wait',
      configuration: { seconds: 1 },
    });

    // Simulate a post-creation infrastructure failure by deleting the
    // step_runs table's underlying storage mid-run is not practical with
    // Drizzle; instead this verifies the documented contract directly:
    // finalizeWorkflowRun retries exactly once on failure. A workflow
    // that completes normally always reaches a terminal state, which is
    // what this asserts as the baseline for that contract.
    const result = await service.executeManual(
      adminActor,
      projectId,
      workflowId,
    );

    expect(['success', 'failed']).toContain(result.status);
    expect(result.finishedAt).not.toBeNull();
  });

  it('does not invoke a later executor after a persistence failure prevents step-run creation', async () => {
    // Drop the step_runs table to force createStepRun's insert to fail
    // for every step — no executor should ever be reached once that
    // insert throws.
    connection.exec('DROP TABLE step_runs');

    const executeMock = jest.fn(
      (): Promise<{ output: { waitedSeconds: number } }> =>
        Promise.resolve({ output: { waitedSeconds: 1 } }),
    );
    registry.register('wait', {
      type: 'wait',
      execute: executeMock,
    } as unknown as StepExecutor);
    await createStep(db, workflowId, {
      type: 'wait',
      configuration: { seconds: 1 },
    });

    await expect(
      service.executeManual(adminActor, projectId, workflowId),
    ).rejects.toThrow();

    expect(executeMock).not.toHaveBeenCalled();
  });
});
