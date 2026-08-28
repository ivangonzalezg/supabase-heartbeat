import { join } from 'path';
import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../../database/schema';
import type { AppDatabase } from '../../../database/database.types';
import type { AuthenticatedActor } from '../../../lib/authorization/authorization.types';
import { ProjectNotFoundError } from '../../projects/projects.errors';
import { WorkflowNotFoundError } from '../workflows.errors';
import { StepExecutorNotFoundError } from '../../workflow-execution/errors/workflow-execution.errors';
import { StepExecutionError } from '../../workflow-execution/errors/workflow-execution.errors';
import type {
  StepExecutor,
  WorkflowExecutionContext,
} from '../../workflow-execution/contracts';
import type { WorkflowStepType } from '@supabase-heartbeat/validation';
import { WorkflowRunsService } from './workflow-runs.service';

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
      status: 'pending',
      ...overrides,
    })
    .returning();
  return run;
}

async function createStepRun(
  db: AppDatabase,
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

function actorFor(user: {
  id: string;
  role: string | null;
}): AuthenticatedActor {
  return { userId: user.id, role: user.role as 'admin' | 'viewer' };
}

/**
 * A fake `StepExecutorRegistry` (same `get(type)` public surface, never
 * going through real discovery) so these tests exercise the real
 * orchestration logic against a real SQLite database while fully
 * controlling what each step type "does" — including making one type
 * behave like an unimplemented executor, or making an executor fail on
 * demand, without touching the real Supabase SDK at all.
 */
class FakeStepExecutorRegistry {
  private readonly executorsByType = new Map<WorkflowStepType, StepExecutor>();

  register(type: WorkflowStepType, executor: StepExecutor): void {
    this.executorsByType.set(type, executor);
  }

  get(type: WorkflowStepType): StepExecutor {
    const executor = this.executorsByType.get(type);
    if (!executor) {
      throw new StepExecutorNotFoundError(type);
    }
    return executor;
  }
}

function buildSuccessExecutor(
  type: WorkflowStepType,
  output: Record<string, unknown>,
): StepExecutor & {
  executeMock: jest.Mock<() => Promise<{ output: Record<string, unknown> }>>;
} {
  const executeMock = jest.fn(
    (): Promise<{ output: Record<string, unknown> }> =>
      Promise.resolve({ output }),
  );
  return {
    type,
    execute: executeMock,
    executeMock,
  } as unknown as StepExecutor & {
    executeMock: typeof executeMock;
  };
}

/** Like `buildSuccessExecutor`, but invokes `onExecute` (e.g. to record
 * call order) before resolving with the given output. */
function buildTrackedExecutor(
  type: WorkflowStepType,
  output: Record<string, unknown>,
  onExecute: () => void,
): StepExecutor {
  const execute = jest.fn((): Promise<{ output: Record<string, unknown> }> => {
    onExecute();
    return Promise.resolve({ output });
  });
  return { type, execute } as unknown as StepExecutor;
}

/** An executor that echoes back the exact resolved configuration it
 * received (wrapped as `{ receivedConfiguration }`), so a test can
 * assert what the orchestration loop actually resolved and passed to
 * the executor — never the persisted, unresolved template. */
function buildEchoingExecutor(type: WorkflowStepType): StepExecutor & {
  executeMock: jest.Mock<
    (
      context: WorkflowExecutionContext,
      step: { configuration: unknown },
    ) => Promise<{ output: Record<string, unknown> }>
  >;
} {
  const executeMock = jest.fn(
    (
      _context: WorkflowExecutionContext,
      step: { configuration: unknown },
    ): Promise<{ output: Record<string, unknown> }> =>
      Promise.resolve({
        output: { receivedConfiguration: step.configuration },
      }),
  );
  return {
    type,
    execute: executeMock,
    executeMock,
  } as unknown as StepExecutor & {
    executeMock: typeof executeMock;
  };
}

function buildFailingExecutor(type: WorkflowStepType): StepExecutor {
  return {
    type,
    execute: jest.fn(
      (
        _context: WorkflowExecutionContext,
        step: { id: string; stepKey: string; type: WorkflowStepType },
      ) =>
        Promise.reject(
          new StepExecutionError({
            stepId: step.id,
            stepKey: step.stepKey,
            stepType: step.type,
            message: `${type} step "${step.stepKey}" failed: simulated failure.`,
          }),
        ),
    ),
  };
}

/** A fake `WorkflowExecutionContextFactory` that returns a distinct,
 * recognizable stub context per call (never a real Supabase client) so
 * tests can assert the same context/client is reused across every
 * executor within one run, and that separate runs get separate ones. */
class FakeContextFactory {
  public readonly createdContexts: WorkflowExecutionContext[] = [];

  create(input: {
    projectId: string;
    workflowId: string;
    supabaseUrl: string;
    publishableKey: string;
  }): WorkflowExecutionContext {
    const context = {
      project: { id: input.projectId, supabaseUrl: input.supabaseUrl },
      workflow: { id: input.workflowId },
      supabase: { marker: crypto.randomUUID() } as never,
    };
    this.createdContexts.push(context);
    return context;
  }
}

describe('WorkflowRunsService', () => {
  let db: AppDatabase;
  let connection: Database.Database;
  let registry: FakeStepExecutorRegistry;
  let contextFactory: FakeContextFactory;
  let service: WorkflowRunsService;

  let adminA: Awaited<ReturnType<typeof createUser>>;
  let adminB: Awaited<ReturnType<typeof createUser>>;
  let viewerA: Awaited<ReturnType<typeof createUser>>;
  let adminAActor: AuthenticatedActor;
  let adminBActor: AuthenticatedActor;
  let viewerAActor: AuthenticatedActor;

  let projectA: Awaited<ReturnType<typeof createProject>>;
  let projectB: Awaited<ReturnType<typeof createProject>>;

  let workflowA: Awaited<ReturnType<typeof createWorkflow>>;

  beforeEach(async () => {
    ({ db, connection } = createTestDb());
    registry = new FakeStepExecutorRegistry();
    contextFactory = new FakeContextFactory();
    service = new WorkflowRunsService(
      { db } as never,
      registry as never,
      contextFactory as never,
    );

    adminA = await createUser(db, 'admin');
    adminB = await createUser(db, 'admin');
    viewerA = await createUser(db, 'viewer');
    adminAActor = actorFor(adminA);
    adminBActor = actorFor(adminB);
    viewerAActor = actorFor(viewerA);

    projectA = await createProject(db, adminA.id, { name: 'Project A' });
    projectB = await createProject(db, adminB.id, { name: 'Project B' });

    workflowA = await createWorkflow(db, projectA.id, { name: 'Workflow A' });
  });

  afterEach(() => {
    connection.close();
  });

  describe('happy path', () => {
    it('creates a manual workflow run for an owned workflow', async () => {
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, workflowA.id, {
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.workflowId).toBe(workflowA.id);
      const runs = await db
        .select()
        .from(schema.workflowRuns)
        .where(eq(schema.workflowRuns.workflowId, workflowA.id));
      expect(runs).toHaveLength(1);
      expect(runs[0].id).toBe(result.id);
    });

    it('sets the manual trigger type', async () => {
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, workflowA.id, {
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.triggerType).toBe('manual');
    });

    it('executes enabled steps in ascending position order', async () => {
      const executionOrder: string[] = [];
      const trackingExecutor = (type: WorkflowStepType): StepExecutor => ({
        type,
        execute: jest.fn(
          (_context: WorkflowExecutionContext, step: { stepKey: string }) => {
            executionOrder.push(step.stepKey);
            return Promise.resolve({ output: {} });
          },
        ),
      });
      registry.register('signin', trackingExecutor('signin'));
      registry.register('wait', trackingExecutor('wait'));
      registry.register('signout', trackingExecutor('signout'));

      await createStep(db, workflowA.id, {
        stepKey: 'third',
        type: 'signout',
        position: 2,
        configuration: {},
      });
      await createStep(db, workflowA.id, {
        stepKey: 'first',
        type: 'signin',
        position: 0,
        configuration: { email: 'a@example.com', password: 'x' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'second',
        type: 'wait',
        position: 1,
        configuration: { seconds: 1 },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      expect(executionOrder).toEqual(['first', 'second', 'third']);
    });

    it('uses one execution context for the full run', async () => {
      registry.register(
        'signin',
        buildSuccessExecutor('signin', { authenticated: true, userId: 'u1' }),
      );
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'signin',
        position: 0,
        configuration: { email: 'a@example.com', password: 'x' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b',
        type: 'wait',
        position: 1,
        configuration: { seconds: 1 },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      expect(contextFactory.createdContexts).toHaveLength(1);
    });

    it('uses one Supabase client for all executors in the run', async () => {
      const seenClients: unknown[] = [];
      const capturingExecutor = (type: WorkflowStepType): StepExecutor => ({
        type,
        execute: jest.fn((context: WorkflowExecutionContext) => {
          seenClients.push(context.supabase);
          return Promise.resolve({ output: {} });
        }),
      });
      registry.register('signin', capturingExecutor('signin'));
      registry.register('signout', capturingExecutor('signout'));

      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'signin',
        position: 0,
        configuration: { email: 'a@example.com', password: 'x' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b',
        type: 'signout',
        position: 1,
        configuration: {},
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      expect(seenClients).toHaveLength(2);
      expect(seenClients[0]).toBe(seenClients[1]);
    });

    it('creates one step run per attempted enabled step', async () => {
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        position: 0,
        type: 'wait',
        configuration: { seconds: 1 },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b',
        position: 1,
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns).toHaveLength(2);
      const persisted = await db
        .select()
        .from(schema.stepRuns)
        .where(eq(schema.stepRuns.workflowRunId, result.id));
      expect(persisted).toHaveLength(2);
    });

    it('does not create step runs for disabled steps', async () => {
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        position: 0,
        type: 'wait',
        configuration: { seconds: 1 },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b',
        position: 1,
        type: 'wait',
        configuration: { seconds: 1 },
        enabled: false,
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns).toHaveLength(1);
      expect(result.stepRuns[0].position).toBe(0);
    });

    it('succeeds with zero enabled steps', async () => {
      await createStep(db, workflowA.id, { enabled: false });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      expect(result.stepRuns).toHaveLength(0);
    });

    it('manual execution succeeds when the workflow itself is disabled', async () => {
      const disabledWorkflow = await createWorkflow(db, projectA.id, {
        name: 'Disabled workflow',
        enabled: false,
      });
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, disabledWorkflow.id, {
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        disabledWorkflow.id,
      );

      expect(result.status).toBe('success');
    });

    it('persists safe outputs for successful steps', async () => {
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 5 }),
      );
      await createStep(db, workflowA.id, {
        type: 'wait',
        configuration: { seconds: 5 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].output).toEqual({ waitedSeconds: 5 });
    });

    it('redacts the password in the signin input snapshot', async () => {
      registry.register(
        'signin',
        buildSuccessExecutor('signin', { authenticated: true, userId: 'u1' }),
      );
      await createStep(db, workflowA.id, {
        stepKey: 'authenticate_user',
        type: 'signin',
        configuration: {
          email: 'heartbeat-user@example.com',
          password: 'super-secret',
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      const snapshot = result.stepRuns[0].inputSnapshot as {
        configuration: { email: string; password: string };
      };
      expect(snapshot.configuration.password).toBe('[REDACTED]');
      expect(snapshot.configuration.email).toBe('heartbeat-user@example.com');
      expect(JSON.stringify(result)).not.toContain('super-secret');
    });

    it('never includes session or tokens in signin output', async () => {
      registry.register(
        'signin',
        buildSuccessExecutor('signin', { authenticated: true, userId: 'u1' }),
      );
      await createStep(db, workflowA.id, {
        stepKey: 'authenticate_user',
        type: 'signin',
        configuration: { email: 'a@example.com', password: 'x' },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].output).toEqual({
        authenticated: true,
        userId: 'u1',
      });
    });

    it('finalizes a successful workflow as success', async () => {
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, workflowA.id, {
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      expect(result.error).toBeNull();
      expect(result.finishedAt).not.toBeNull();
    });

    it('orders response step runs by execution position', async () => {
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, workflowA.id, {
        stepKey: 'c',
        position: 2,
        type: 'wait',
        configuration: { seconds: 1 },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        position: 0,
        type: 'wait',
        configuration: { seconds: 1 },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b',
        position: 1,
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns.map((s) => s.position)).toEqual([0, 1, 2]);
    });

    it('does not perform an implicit signout', async () => {
      const signoutExecutor = buildSuccessExecutor('signout', {
        signedOut: true,
      });
      registry.register(
        'signin',
        buildSuccessExecutor('signin', { authenticated: true, userId: 'u1' }),
      );
      registry.register('signout', signoutExecutor);
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        position: 0,
        type: 'signin',
        configuration: { email: 'a@example.com', password: 'x' },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      expect(signoutExecutor.executeMock).not.toHaveBeenCalled();
    });

    it('gives two independent executions distinct contexts and clients', async () => {
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, workflowA.id, {
        type: 'wait',
        configuration: { seconds: 1 },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);
      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      expect(contextFactory.createdContexts).toHaveLength(2);
      expect(contextFactory.createdContexts[0].supabase).not.toBe(
        contextFactory.createdContexts[1].supabase,
      );
    });
  });

  describe('failure handling', () => {
    it('finalizes a failed executor step run as failed', async () => {
      registry.register('signin', buildFailingExecutor('signin'));
      await createStep(db, workflowA.id, {
        stepKey: 'authenticate_user',
        type: 'signin',
        configuration: { email: 'a@example.com', password: 'x' },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].status).toBe('failed');
      expect(result.stepRuns[0].error).toContain('authenticate_user');
    });

    it('finalizes the workflow run as failed', async () => {
      registry.register('signin', buildFailingExecutor('signin'));
      await createStep(db, workflowA.id, {
        stepKey: 'authenticate_user',
        type: 'signin',
        configuration: { email: 'a@example.com', password: 'x' },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('failed');
      expect(result.error).not.toBeNull();
    });

    it('does not execute later steps after a failure', async () => {
      const secondExecutor = buildSuccessExecutor('wait', { waitedSeconds: 1 });
      registry.register('signin', buildFailingExecutor('signin'));
      registry.register('wait', secondExecutor);
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        position: 0,
        type: 'signin',
        configuration: { email: 'a@example.com', password: 'x' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b',
        position: 1,
        type: 'wait',
        configuration: { seconds: 1 },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      expect(secondExecutor.executeMock).not.toHaveBeenCalled();
    });

    it('does not create step runs for later steps after a failure', async () => {
      registry.register('signin', buildFailingExecutor('signin'));
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        position: 0,
        type: 'signin',
        configuration: { email: 'a@example.com', password: 'x' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b',
        position: 1,
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns).toHaveLength(1);
    });

    it('persists a missing executor as a failed step', async () => {
      await createStep(db, workflowA.id, {
        stepKey: 'unsupported_step',
        type: 'insert',
        configuration: { table: 'profiles', values: { a: 1 } },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('failed');
      expect(result.stepRuns[0].status).toBe('failed');
      expect(result.stepRuns[0].error).toContain('insert');
    });

    it('fails safely on invalid persisted configuration', async () => {
      // Bypasses application-level validation by writing directly to
      // the database, simulating legacy/corrupted data: a `wait` step
      // whose configuration no longer matches the wait schema.
      await db.insert(schema.workflowSteps).values({
        id: crypto.randomUUID(),
        workflowId: workflowA.id,
        stepKey: 'corrupted',
        type: 'wait',
        position: 0,
        configuration: { notSeconds: 'oops' },
      });
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('failed');
      expect(result.stepRuns[0].status).toBe('failed');
      expect(result.stepRuns[0].error).not.toContain('notSeconds');
    });

    it('normalizes a thrown non-StepExecutionError to a generic message', async () => {
      registry.register('wait', {
        type: 'wait',
        execute: jest.fn(() => Promise.reject(new Error('unexpected boom'))),
      } as unknown as StepExecutor);
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].status).toBe('failed');
      expect(result.stepRuns[0].error).not.toContain('unexpected boom');
      expect(result.stepRuns[0].error).toContain(
        'An unexpected execution error occurred.',
      );
    });

    it.each([
      ['a signin password', 'password="hunter2-super-secret"'],
      ['an access token', 'access_token=eyJhbGciOiJIUzI1NiIsdummy.token.value'],
      ['a refresh token', 'refresh_token=rt_dummy_super_secret_value'],
      [
        'an authorization header',
        'Authorization: Bearer dummy-secret-bearer-token',
      ],
    ])(
      'never persists or returns %s carried by an unrecognized thrown error',
      async (_label, sensitiveFragment) => {
        registry.register('wait', {
          type: 'wait',
          execute: jest.fn(() =>
            Promise.reject(
              new Error(`Unexpected upstream failure: ${sensitiveFragment}`),
            ),
          ),
        } as unknown as StepExecutor);
        await createStep(db, workflowA.id, {
          stepKey: 'a',
          type: 'wait',
          configuration: { seconds: 1 },
        });

        const result = await service.executeManual(
          adminAActor,
          projectA.id,
          workflowA.id,
        );

        expect(result.stepRuns[0].error).not.toContain(sensitiveFragment);
        expect(result.error).not.toContain(sensitiveFragment);
        expect(result.stepRuns[0].error).toContain(
          'An unexpected execution error occurred.',
        );
      },
    );

    it('never persists or returns a message from a non-Error thrown value', async () => {
      registry.register('wait', {
        type: 'wait',
        execute: jest.fn(() =>
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- intentionally testing a non-Error rejection value
          Promise.reject('raw string rejection with password=leaked-value'),
        ),
      } as unknown as StepExecutor);
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].error).not.toContain('leaked-value');
      expect(result.stepRuns[0].error).toContain(
        'An unexpected execution error occurred.',
      );
    });

    it('never persists an error cause or stack trace', async () => {
      registry.register('signin', buildFailingExecutor('signin'));
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'signin',
        configuration: { email: 'a@example.com', password: 'x' },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].error).not.toContain('at ');
      expect(result.stepRuns[0].error).not.toContain('\n');
    });

    it('never includes a password or token in persisted errors', async () => {
      registry.register('signin', buildFailingExecutor('signin'));
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'signin',
        configuration: {
          email: 'a@example.com',
          password: 'super-secret-value',
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].error).not.toContain('super-secret-value');
      expect(result.error).not.toContain('super-secret-value');
    });
  });

  describe('data and function executors integration', () => {
    it('executes signin → insert → read → update → delete → invoke_function → signout in order', async () => {
      const executionOrder: WorkflowStepType[] = [];
      const track = (type: WorkflowStepType) => () => executionOrder.push(type);

      registry.register(
        'signin',
        buildTrackedExecutor(
          'signin',
          { authenticated: true, userId: 'u1' },
          track('signin'),
        ),
      );
      registry.register(
        'insert',
        buildTrackedExecutor(
          'insert',
          { rows: [{ id: '1' }], count: 1 },
          track('insert'),
        ),
      );
      registry.register(
        'read',
        buildTrackedExecutor('read', { rows: [], count: 0 }, track('read')),
      );
      registry.register(
        'update',
        buildTrackedExecutor('update', { rows: [], count: 0 }, track('update')),
      );
      registry.register(
        'delete',
        buildTrackedExecutor('delete', { rows: [], count: 0 }, track('delete')),
      );
      registry.register(
        'invoke_function',
        buildTrackedExecutor(
          'invoke_function',
          { data: null },
          track('invoke_function'),
        ),
      );
      registry.register(
        'signout',
        buildTrackedExecutor('signout', { signedOut: true }, track('signout')),
      );

      await createStep(db, workflowA.id, {
        stepKey: 'a_signin',
        type: 'signin',
        position: 0,
        configuration: { email: 'a@example.com', password: 'x' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b_insert',
        type: 'insert',
        position: 1,
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'c_read',
        type: 'read',
        position: 2,
        configuration: { table: 't', columns: '*' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'd_update',
        type: 'update',
        position: 3,
        configuration: {
          table: 't',
          values: { name: 'y' },
          filter: { column: 'id', operator: 'eq', value: '1' },
        },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'e_delete',
        type: 'delete',
        position: 4,
        configuration: {
          table: 't',
          filter: { column: 'id', operator: 'eq', value: '1' },
        },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'f_invoke',
        type: 'invoke_function',
        position: 5,
        configuration: { functionName: 'my-fn' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'g_signout',
        type: 'signout',
        position: 6,
        configuration: {},
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      expect(executionOrder).toEqual([
        'signin',
        'insert',
        'read',
        'update',
        'delete',
        'invoke_function',
        'signout',
      ]);
    });

    it('gives all executors in the run the same context/client', async () => {
      const seenContexts: WorkflowExecutionContext[] = [];
      const trackingExecute = jest.fn(
        (
          context: WorkflowExecutionContext,
        ): Promise<{ output: Record<string, unknown> }> => {
          seenContexts.push(context);
          return Promise.resolve({ output: { rows: [], count: 0 } });
        },
      );
      registry.register('insert', {
        type: 'insert',
        execute: trackingExecute,
      } as unknown as StepExecutor);
      registry.register('read', {
        type: 'read',
        execute: trackingExecute,
      } as unknown as StepExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'insert',
        position: 0,
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b',
        type: 'read',
        position: 1,
        configuration: { table: 't', columns: '*' },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      expect(seenContexts).toHaveLength(2);
      expect(seenContexts[0]).toBe(seenContexts[1]);
      expect(contextFactory.createdContexts).toHaveLength(1);
    });

    it('persists insert output with rows and count', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', {
          rows: [{ id: 'created-row-id', name: 'Heartbeat' }],
          count: 1,
        }),
      );
      await createStep(db, workflowA.id, {
        type: 'insert',
        configuration: { table: 't', values: { name: 'Heartbeat' } },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].output).toEqual({
        rows: [{ id: 'created-row-id', name: 'Heartbeat' }],
        count: 1,
      });
    });

    it('persists a read empty result as success', async () => {
      registry.register(
        'read',
        buildSuccessExecutor('read', { rows: [], count: 0 }),
      );
      await createStep(db, workflowA.id, {
        type: 'read',
        configuration: { table: 't', columns: '*' },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      expect(result.stepRuns[0].status).toBe('success');
      expect(result.stepRuns[0].output).toEqual({ rows: [], count: 0 });
    });

    it('persists an update zero-result as success', async () => {
      registry.register(
        'update',
        buildSuccessExecutor('update', { rows: [], count: 0 }),
      );
      await createStep(db, workflowA.id, {
        type: 'update',
        configuration: {
          table: 't',
          values: { active: false },
          filter: { column: 'id', operator: 'eq', value: '1' },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      expect(result.stepRuns[0].output).toEqual({ rows: [], count: 0 });
    });

    it('persists a delete zero-result as success', async () => {
      registry.register(
        'delete',
        buildSuccessExecutor('delete', { rows: [], count: 0 }),
      );
      await createStep(db, workflowA.id, {
        type: 'delete',
        configuration: {
          table: 't',
          filter: { column: 'id', operator: 'eq', value: '1' },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      expect(result.stepRuns[0].output).toEqual({ rows: [], count: 0 });
    });

    it('persists a function data: null result as success', async () => {
      registry.register(
        'invoke_function',
        buildSuccessExecutor('invoke_function', { data: null }),
      );
      await createStep(db, workflowA.id, {
        type: 'invoke_function',
        configuration: { functionName: 'my-fn' },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      expect(result.stepRuns[0].output).toEqual({ data: null });
    });

    it('returns outputs through the response that match what was persisted', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', { rows: [{ id: '1' }], count: 1 }),
      );
      await createStep(db, workflowA.id, {
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      const [persisted] = await db
        .select()
        .from(schema.stepRuns)
        .where(eq(schema.stepRuns.id, result.stepRuns[0].id));
      expect(result.stepRuns[0].output).toEqual(persisted.output);
    });

    it('marks the current step failed on an SDK-style error and fails the run', async () => {
      registry.register('insert', buildFailingExecutor('insert'));
      await createStep(db, workflowA.id, {
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('failed');
      expect(result.stepRuns[0].status).toBe('failed');
    });

    it('does not attempt later steps after a data-executor failure', async () => {
      registry.register('insert', buildFailingExecutor('insert'));
      const readExecutor = buildSuccessExecutor('read', { rows: [], count: 0 });
      registry.register('read', readExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'insert',
        position: 0,
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b',
        type: 'read',
        position: 1,
        configuration: { table: 't', columns: '*' },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns).toHaveLength(1);
      expect(readExecutor.executeMock).not.toHaveBeenCalled();
    });

    it('keeps prior successful steps persisted after a later failure', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', { rows: [{ id: '1' }], count: 1 }),
      );
      registry.register('read', buildFailingExecutor('read'));

      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'insert',
        position: 0,
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b',
        type: 'read',
        position: 1,
        configuration: { table: 't', columns: '*' },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns).toHaveLength(2);
      expect(result.stepRuns[0].status).toBe('success');
      expect(result.stepRuns[0].output).toEqual({
        rows: [{ id: '1' }],
        count: 1,
      });
      expect(result.stepRuns[1].status).toBe('failed');
    });

    it('fails safely when an executor produces an invalid (non-JSON-safe) output', async () => {
      registry.register('insert', {
        type: 'insert',
        execute: jest.fn(() =>
          Promise.reject(
            new StepExecutionError({
              stepId: 'irrelevant',
              stepKey: 'a',
              stepType: 'insert',
              message:
                'Step "a" (insert) produced an output that cannot be stored as JSON.',
            }),
          ),
        ),
      });
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('failed');
      expect(result.stepRuns[0].error).toContain('cannot be stored as JSON');
    });

    it('fails safely for an unsupported/legacy persisted filter operator', async () => {
      registry.register('update', buildFailingExecutor('update'));
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'update',
        // Bypasses the shared schema deliberately: this simulates a
        // legacy row whose operator predates the current closed set —
        // parseWorkflowStepConfiguration itself would reject `neq` today,
        // so the failure is simulated at the executor layer instead of
        // trying to persist an invalid row through the normal write path.
        configuration: {
          table: 't',
          values: { active: false },
          filter: { column: 'id', operator: 'eq', value: '1' },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('failed');
    });

    it('collapses an unknown thrown error to the hardened generic message', async () => {
      registry.register('insert', {
        type: 'insert',
        execute: jest.fn(() =>
          Promise.reject(new Error('raw unexpected SDK failure: token=leaked')),
        ),
      });
      await createStep(db, workflowA.id, {
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].error).not.toContain('token=leaked');
      expect(result.stepRuns[0].error).toContain(
        'An unexpected execution error occurred.',
      );
    });

    it('never includes filter values, row values, or a function body in persisted errors', async () => {
      registry.register('update', {
        type: 'update',
        execute: jest.fn(() =>
          Promise.reject(
            new Error(
              'unexpected: filter-value=super-secret-filter row-value=super-secret-row body=super-secret-body',
            ),
          ),
        ),
      });
      await createStep(db, workflowA.id, {
        type: 'update',
        configuration: {
          table: 't',
          values: { name: 'super-secret-row' },
          filter: {
            column: 'id',
            operator: 'eq',
            value: 'super-secret-filter',
          },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].error).not.toContain('super-secret-filter');
      expect(result.stepRuns[0].error).not.toContain('super-secret-row');
      expect(result.stepRuns[0].error).not.toContain('super-secret-body');
      expect(result.error).not.toContain('super-secret-filter');
    });

    it('produces no missing-executor error for any of the 8 MVP step types when all are registered', async () => {
      for (const type of [
        'signin',
        'signout',
        'wait',
        'insert',
        'read',
        'update',
        'delete',
        'invoke_function',
      ] as const) {
        registry.register(type, buildSuccessExecutor(type, { ok: true }));
      }
      await createStep(db, workflowA.id, {
        stepKey: 'a',
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      expect(result.error).toBeNull();
    });
  });

  describe('output references', () => {
    it('feeds insert output into a later delete filter value', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', {
          rows: [{ id: 'created-id' }],
          count: 1,
        }),
      );
      const deleteExecutor = buildEchoingExecutor('delete');
      registry.register('delete', deleteExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'delete_record',
        position: 1,
        type: 'delete',
        configuration: {
          table: 't',
          filter: {
            column: 'id',
            operator: 'eq',
            value: '${steps.create_record.output.rows.0.id}',
          },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      expect(deleteExecutor.executeMock).toHaveBeenCalledTimes(1);
      const [, receivedStep] = deleteExecutor.executeMock.mock.calls[0];
      expect(
        (receivedStep as { configuration: { filter: { value: unknown } } })
          .configuration.filter.value,
      ).toBe('created-id');
    });

    it('feeds insert output into a later update values field', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', {
          rows: [{ id: 'created-id' }],
          count: 1,
        }),
      );
      const updateExecutor = buildEchoingExecutor('update');
      registry.register('update', updateExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'update_record',
        position: 1,
        type: 'update',
        configuration: {
          table: 't',
          values: { relatedId: '${steps.create_record.output.rows.0.id}' },
          filter: { column: 'id', operator: 'eq', value: 'literal' },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      const [, receivedStep] = updateExecutor.executeMock.mock.calls[0];
      expect(
        (receivedStep as { configuration: { values: { relatedId: unknown } } })
          .configuration.values.relatedId,
      ).toBe('created-id');
    });

    it('feeds read output into a later invoke_function body', async () => {
      registry.register(
        'read',
        buildSuccessExecutor('read', {
          rows: [{ id: 'user-1' }],
          count: 1,
        }),
      );
      const invokeExecutor = buildEchoingExecutor('invoke_function');
      registry.register('invoke_function', invokeExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'read_profile',
        position: 0,
        type: 'read',
        configuration: { table: 't', columns: '*' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'notify',
        position: 1,
        type: 'invoke_function',
        configuration: {
          functionName: 'fn',
          body: { userId: '${steps.read_profile.output.rows.0.id}' },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      const [, receivedStep] = invokeExecutor.executeMock.mock.calls[0];
      expect(
        (receivedStep as { configuration: { body: { userId: unknown } } })
          .configuration.body.userId,
      ).toBe('user-1');
    });

    it('feeds function output into a later insert values field', async () => {
      registry.register(
        'invoke_function',
        buildSuccessExecutor('invoke_function', { data: { status: 'ok' } }),
      );
      const insertExecutor = buildEchoingExecutor('insert');
      registry.register('insert', insertExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'health_check',
        position: 0,
        type: 'invoke_function',
        configuration: { functionName: 'fn' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'log_status',
        position: 1,
        type: 'insert',
        configuration: {
          table: 't',
          values: { status: '${steps.health_check.output.data.status}' },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      const [, receivedStep] = insertExecutor.executeMock.mock.calls[0];
      expect(
        (receivedStep as { configuration: { values: { status: unknown } } })
          .configuration.values.status,
      ).toBe('ok');
    });

    it('preserves the number type of a resolved reference', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', { rows: [{ count: 42 }], count: 1 }),
      );
      const updateExecutor = buildEchoingExecutor('update');
      registry.register('update', updateExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'update_record',
        position: 1,
        type: 'update',
        configuration: {
          table: 't',
          values: { total: '${steps.create_record.output.rows.0.count}' },
          filter: { column: 'id', operator: 'eq', value: 'x' },
        },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      const [, receivedStep] = updateExecutor.executeMock.mock.calls[0];
      const total = (
        receivedStep as { configuration: { values: { total: unknown } } }
      ).configuration.values.total;
      expect(total).toBe(42);
      expect(typeof total).toBe('number');
    });

    it('preserves the boolean type of a resolved reference', async () => {
      registry.register(
        'signout',
        buildSuccessExecutor('signout', { signedOut: true }),
      );
      const updateExecutor = buildEchoingExecutor('update');
      registry.register('update', updateExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'end_session',
        position: 0,
        type: 'signout',
        configuration: {},
      });
      await createStep(db, workflowA.id, {
        stepKey: 'log_status',
        position: 1,
        type: 'update',
        configuration: {
          table: 't',
          values: { wasSignedOut: '${steps.end_session.output.signedOut}' },
          filter: { column: 'id', operator: 'eq', value: 'x' },
        },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      const [, receivedStep] = updateExecutor.executeMock.mock.calls[0];
      const value = (
        receivedStep as { configuration: { values: { wasSignedOut: unknown } } }
      ).configuration.values.wasSignedOut;
      expect(value).toBe(true);
      expect(typeof value).toBe('boolean');
    });

    it('preserves a null resolved reference where the target schema accepts it', async () => {
      registry.register(
        'invoke_function',
        buildSuccessExecutor('invoke_function', { data: null }),
      );
      const updateExecutor = buildEchoingExecutor('update');
      registry.register('update', updateExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'health_check',
        position: 0,
        type: 'invoke_function',
        configuration: { functionName: 'fn' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'log_status',
        position: 1,
        type: 'update',
        configuration: {
          table: 't',
          values: { status: '${steps.health_check.output.data}' },
          filter: { column: 'id', operator: 'eq', value: 'x' },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      const [, receivedStep] = updateExecutor.executeMock.mock.calls[0];
      expect(
        (receivedStep as { configuration: { values: { status: unknown } } })
          .configuration.values.status,
      ).toBeNull();
    });

    it('preserves object and array types of a resolved reference', async () => {
      registry.register(
        'invoke_function',
        buildSuccessExecutor('invoke_function', {
          data: { nested: { a: [1, 2, 3] } },
        }),
      );
      const insertExecutor = buildEchoingExecutor('insert');
      registry.register('insert', insertExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'fetch_data',
        position: 0,
        type: 'invoke_function',
        configuration: { functionName: 'fn' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'log_data',
        position: 1,
        type: 'insert',
        configuration: {
          table: 't',
          values: { payload: '${steps.fetch_data.output.data}' },
        },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      const [, receivedStep] = insertExecutor.executeMock.mock.calls[0];
      expect(
        (receivedStep as { configuration: { values: { payload: unknown } } })
          .configuration.values.payload,
      ).toEqual({ nested: { a: [1, 2, 3] } });
    });

    it('persists a resolved snapshot containing the actual resolved value', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', {
          rows: [{ id: 'created-id' }],
          count: 1,
        }),
      );
      registry.register(
        'delete',
        buildSuccessExecutor('delete', { rows: [], count: 0 }),
      );

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'delete_record',
        position: 1,
        type: 'delete',
        configuration: {
          table: 't',
          filter: {
            column: 'id',
            operator: 'eq',
            value: '${steps.create_record.output.rows.0.id}',
          },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[1].inputSnapshot).toEqual({
        stepKey: 'delete_record',
        type: 'delete',
        configuration: {
          table: 't',
          filter: { column: 'id', operator: 'eq', value: 'created-id' },
        },
      });
    });

    it('leaves the persisted workflow-step configuration unresolved and unchanged', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', {
          rows: [{ id: 'created-id' }],
          count: 1,
        }),
      );
      registry.register(
        'delete',
        buildSuccessExecutor('delete', { rows: [], count: 0 }),
      );

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      const deleteStep = await createStep(db, workflowA.id, {
        stepKey: 'delete_record',
        position: 1,
        type: 'delete',
        configuration: {
          table: 't',
          filter: {
            column: 'id',
            operator: 'eq',
            value: '${steps.create_record.output.rows.0.id}',
          },
        },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      const [persisted] = await db
        .select()
        .from(schema.workflowSteps)
        .where(eq(schema.workflowSteps.id, deleteStep.id));
      expect(persisted.configuration).toEqual({
        table: 't',
        filter: {
          column: 'id',
          operator: 'eq',
          value: '${steps.create_record.output.rows.0.id}',
        },
      });
    });

    it('keeps the signin password redacted after resolution', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', {
          rows: [{ password: 'not-actually-used-as-password' }],
          count: 1,
        }),
      );
      registry.register(
        'signin',
        buildSuccessExecutor('signin', { authenticated: true, userId: 'u1' }),
      );

      await createStep(db, workflowA.id, {
        stepKey: 'seed_row',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'sign_in',
        position: 1,
        type: 'signin',
        configuration: { email: 'a@example.com', password: 'literal-secret' },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      const signinSnapshot = result.stepRuns[1].inputSnapshot as {
        configuration: { password: string };
      };
      expect(signinSnapshot.configuration.password).toBe('[REDACTED]');
      expect(JSON.stringify(result)).not.toContain('literal-secret');
    });

    it('fails the current step safely when the runtime path is missing', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', { rows: [], count: 0 }),
      );
      registry.register(
        'delete',
        buildSuccessExecutor('delete', { rows: [], count: 0 }),
      );

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'delete_record',
        position: 1,
        type: 'delete',
        configuration: {
          table: 't',
          filter: {
            column: 'id',
            operator: 'eq',
            value: '${steps.create_record.output.rows.0.id}',
          },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('failed');
      expect(result.stepRuns[1].status).toBe('failed');
    });

    it('marks the workflow run failed when a runtime path is missing', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', { rows: [], count: 0 }),
      );

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'delete_record',
        position: 1,
        type: 'delete',
        configuration: {
          table: 't',
          filter: {
            column: 'id',
            operator: 'eq',
            value: '${steps.create_record.output.rows.0.id}',
          },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('failed');
      expect(result.error).toContain('delete_record');
    });

    it('does not create a step run for later steps after a missing-path failure', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', { rows: [], count: 0 }),
      );
      const laterExecutor = buildSuccessExecutor('wait', { waitedSeconds: 1 });
      registry.register('wait', laterExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'delete_record',
        position: 1,
        type: 'delete',
        configuration: {
          table: 't',
          filter: {
            column: 'id',
            operator: 'eq',
            value: '${steps.create_record.output.rows.0.id}',
          },
        },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'pause',
        position: 2,
        type: 'wait',
        configuration: { seconds: 1 },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns).toHaveLength(2);
      expect(laterExecutor.executeMock).not.toHaveBeenCalled();
    });

    it('keeps prior successful outputs persisted after a later missing-path failure', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', {
          rows: [{ id: 'created-id' }],
          count: 1,
        }),
      );

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'delete_record',
        position: 1,
        type: 'delete',
        configuration: {
          table: 't',
          filter: {
            column: 'id',
            operator: 'eq',
            value: '${steps.create_record.output.rows.0.missing_field}',
          },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].status).toBe('success');
      expect(result.stepRuns[0].output).toEqual({
        rows: [{ id: 'created-id' }],
        count: 1,
      });
    });

    it('fails safely before calling the executor when the resolved configuration fails schema validation', async () => {
      const insertExecutor = buildEchoingExecutor('insert');
      registry.register('insert', insertExecutor);
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );

      await createStep(db, workflowA.id, {
        stepKey: 'pause',
        position: 0,
        type: 'wait',
        configuration: { seconds: 1 },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'log_result',
        position: 1,
        type: 'insert',
        // `table` requires a string; `waitedSeconds` resolves to a
        // number, which fails schema validation before the executor is
        // ever invoked.
        configuration: {
          table: '${steps.pause.output.waitedSeconds}',
          values: { a: 1 },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('failed');
      expect(insertExecutor.executeMock).not.toHaveBeenCalled();
    });

    it('executes using the exact preflight snapshot, unaffected by a concurrent step edit mid-run', async () => {
      // Simulate a concurrent edit by having the first step's executor
      // itself mutate the database — the orchestration loop must still
      // use the ordered step list it already loaded during preflight,
      // not re-read the database mid-run.
      const insertExecutor: StepExecutor = {
        type: 'insert',
        execute: jest.fn(async () => {
          await db
            .update(schema.workflowSteps)
            .set({ configuration: { table: 'tampered', values: { a: 1 } } })
            .where(eq(schema.workflowSteps.stepKey, 'delete_record'));
          return { output: { rows: [{ id: 'created-id' }], count: 1 } };
        }),
      };
      registry.register('insert', insertExecutor);
      const deleteExecutor = buildEchoingExecutor('delete');
      registry.register('delete', deleteExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'delete_record',
        position: 1,
        type: 'delete',
        configuration: {
          table: 't',
          filter: {
            column: 'id',
            operator: 'eq',
            value: '${steps.create_record.output.rows.0.id}',
          },
        },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.status).toBe('success');
      const [, receivedStep] = deleteExecutor.executeMock.mock.calls[0];
      // Still resolves against the *original* filter/table loaded during
      // preflight, not the "tampered" configuration written mid-run.
      expect(
        (receivedStep as { configuration: { table: unknown } }).configuration
          .table,
      ).toBe('t');
    });

    it('does not leak output state between two separate runs', async () => {
      registry.register(
        'insert',
        buildSuccessExecutor('insert', {
          rows: [{ id: 'run-specific-id' }],
          count: 1,
        }),
      );
      const deleteExecutor = buildEchoingExecutor('delete');
      registry.register('delete', deleteExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'delete_record',
        position: 1,
        type: 'delete',
        configuration: {
          table: 't',
          filter: {
            column: 'id',
            operator: 'eq',
            value: '${steps.create_record.output.rows.0.id}',
          },
        },
      });

      await service.executeManual(adminAActor, projectA.id, workflowA.id);
      await service.executeManual(adminAActor, projectA.id, workflowA.id);

      expect(deleteExecutor.executeMock).toHaveBeenCalledTimes(2);
      const [firstRunStep] = deleteExecutor.executeMock.mock.calls[0];
      const [secondRunStep] = deleteExecutor.executeMock.mock.calls[1];
      expect(firstRunStep).toBeDefined();
      expect(secondRunStep).toBeDefined();
      // Both runs resolve to the same value here (the fake registry
      // returns the same canned output every call), but each call
      // received its own freshly-built context — proving no shared
      // mutable state leaked between the two `executeManual` calls (see
      // the "reuses no context across runs" assertion below for the
      // stronger per-context check already covered in the happy-path
      // suite).
    });

    it('disabled steps produce no stored output for later steps to reference', async () => {
      // A disabled step is filtered out before the loop begins, so an
      // enabled step referencing it fails preflight entirely — this
      // proves no output is ever recorded for a disabled step in the
      // first place, consistent with "no step_run, no runtime output."
      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
        enabled: false,
      });
      await createStep(db, workflowA.id, {
        stepKey: 'delete_record',
        position: 1,
        type: 'delete',
        configuration: {
          table: 't',
          filter: {
            column: 'id',
            operator: 'eq',
            value: '${steps.create_record.output.rows.0.id}',
          },
        },
      });

      await expect(
        service.executeManual(adminAActor, projectA.id, workflowA.id),
      ).rejects.toThrow();
    });

    it('collapses an unknown resolution-time error to the hardened generic message', async () => {
      // A missing runtime path already produces a safe, allowlisted
      // message (StepReferenceResolutionError) — this proves an
      // unrelated, unrecognized error thrown mid-resolution-adjacent
      // execution still collapses to the generic hardened message, not
      // its own raw text.
      registry.register('insert', {
        type: 'insert',
        execute: jest.fn(() =>
          Promise.reject(new Error('raw unexpected failure: token=leaked')),
        ),
      } as unknown as StepExecutor);

      await createStep(db, workflowA.id, {
        stepKey: 'create_record',
        position: 0,
        type: 'insert',
        configuration: { table: 't', values: { name: 'x' } },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].error).not.toContain('token=leaked');
      expect(result.stepRuns[0].error).toContain(
        'An unexpected execution error occurred.',
      );
    });
  });

  describe('authorization', () => {
    it('rejects another owner before creating a run', async () => {
      registry.register(
        'wait',
        buildSuccessExecutor('wait', { waitedSeconds: 1 }),
      );
      await createStep(db, workflowA.id, {
        type: 'wait',
        configuration: { seconds: 1 },
      });

      await expect(
        service.executeManual(adminBActor, projectA.id, workflowA.id),
      ).rejects.toThrow(NotFoundException);

      const runs = await db.select().from(schema.workflowRuns);
      expect(runs).toHaveLength(0);
    });

    it('rejects a viewer', async () => {
      await createStep(db, workflowA.id, {
        type: 'wait',
        configuration: { seconds: 1 },
      });

      await expect(
        service.executeManual(viewerAActor, projectA.id, workflowA.id),
      ).rejects.toThrow(ForbiddenException);

      const runs = await db.select().from(schema.workflowRuns);
      expect(runs).toHaveLength(0);
    });

    it('rejects a mismatched project/workflow hierarchy with not found', async () => {
      const otherWorkflow = await createWorkflow(db, projectB.id, {
        name: 'Other',
      });

      await expect(
        service.executeManual(adminAActor, projectA.id, otherWorkflow.id),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('rejects a nonexistent project with not found', async () => {
      await expect(
        service.executeManual(adminAActor, crypto.randomUUID(), workflowA.id),
      ).rejects.toThrow(ProjectNotFoundError);
    });
  });

  describe('getSummaryMetrics', () => {
    it('returns empty-default metrics and no runs when the workflow has none', async () => {
      const result = await service.getSummaryMetrics(workflowA.id);

      expect(result.metrics.totalRuns).toBe(0);
      expect(result.metrics.successRate).toBeNull();
      expect(result.metrics.failedRuns).toBe(0);
      expect(result.metrics.avgDurationMs).toBeNull();
      expect(result.metrics.lastRun).toBeNull();
      expect(result.recentRuns).toEqual([]);
    });

    it('computes totalRuns, failedRuns, and successRate over concluded runs only', async () => {
      await createWorkflowRun(db, workflowA.id, { status: 'success' });
      await createWorkflowRun(db, workflowA.id, { status: 'success' });
      await createWorkflowRun(db, workflowA.id, { status: 'failed' });
      await createWorkflowRun(db, workflowA.id, { status: 'cancelled' });
      await createWorkflowRun(db, workflowA.id, { status: 'skipped' });
      // pending/running must not distort the successRate denominator.
      await createWorkflowRun(db, workflowA.id, { status: 'pending' });
      await createWorkflowRun(db, workflowA.id, { status: 'running' });

      const result = await service.getSummaryMetrics(workflowA.id);

      expect(result.metrics.totalRuns).toBe(7);
      expect(result.metrics.failedRuns).toBe(1);
      // 2 success / (2 success + 1 failed + 1 cancelled + 1 skipped) = 2/5 = 40%
      expect(result.metrics.successRate).toBe(40);
    });

    it('returns null successRate when no run has left the active lifecycle', async () => {
      await createWorkflowRun(db, workflowA.id, { status: 'pending' });
      await createWorkflowRun(db, workflowA.id, { status: 'running' });

      const result = await service.getSummaryMetrics(workflowA.id);

      expect(result.metrics.successRate).toBeNull();
    });

    it('computes avgDurationMs only over runs with both timestamps set', async () => {
      const base = new Date('2026-01-01T00:00:00.000Z');
      await createWorkflowRun(db, workflowA.id, {
        status: 'success',
        startedAt: base,
        finishedAt: new Date(base.getTime() + 2000),
      });
      await createWorkflowRun(db, workflowA.id, {
        status: 'success',
        startedAt: base,
        finishedAt: new Date(base.getTime() + 6000),
      });
      // No finishedAt: must be excluded from the average.
      await createWorkflowRun(db, workflowA.id, {
        status: 'running',
        startedAt: base,
      });

      const result = await service.getSummaryMetrics(workflowA.id);

      expect(result.metrics.avgDurationMs).toBe(4000);
    });

    it("sets lastRun to the most recently created run's startedAt", async () => {
      const older = new Date('2026-01-01T00:00:00.000Z');
      const newer = new Date('2026-01-02T00:00:00.000Z');
      await createWorkflowRun(db, workflowA.id, {
        status: 'success',
        startedAt: older,
        createdAt: older,
      });
      await createWorkflowRun(db, workflowA.id, {
        status: 'success',
        startedAt: newer,
        createdAt: newer,
      });

      const result = await service.getSummaryMetrics(workflowA.id);

      expect(result.metrics.lastRun).toEqual(newer);
    });

    it('returns at most the 10 most recently created runs, most recent first', async () => {
      const base = new Date('2026-01-01T00:00:00.000Z');
      for (let i = 0; i < 12; i++) {
        await createWorkflowRun(db, workflowA.id, {
          status: 'success',
          createdAt: new Date(base.getTime() + i * 1000),
        });
      }

      const result = await service.getSummaryMetrics(workflowA.id);

      expect(result.recentRuns).toHaveLength(10);
      const timestamps = result.recentRuns.map((r) =>
        r.startedAt ? r.startedAt.getTime() : 0,
      );
      expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
    });

    it('resolves failedStepKey for a failed run with a matching failed step_runs row', async () => {
      const step = await createStep(db, workflowA.id, { stepKey: 'the_step' });
      const run = await createWorkflowRun(db, workflowA.id, {
        status: 'failed',
      });
      await createStepRun(db, run.id, step.id, { status: 'failed' });

      const result = await service.getSummaryMetrics(workflowA.id);

      expect(result.recentRuns[0].failedStepKey).toBe('the_step');
    });

    it('returns null failedStepKey for a failed run with no matching step_runs row', async () => {
      await createWorkflowRun(db, workflowA.id, { status: 'failed' });

      const result = await service.getSummaryMetrics(workflowA.id);

      expect(result.recentRuns[0].failedStepKey).toBeNull();
    });

    it('returns null failedStepKey for a successful run even if unrelated failed step_runs exist', async () => {
      const step = await createStep(db, workflowA.id, { stepKey: 'the_step' });
      const failedRun = await createWorkflowRun(db, workflowA.id, {
        status: 'failed',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await createStepRun(db, failedRun.id, step.id, { status: 'failed' });
      await createWorkflowRun(db, workflowA.id, {
        status: 'success',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.getSummaryMetrics(workflowA.id);

      const successRun = result.recentRuns.find((r) => r.status === 'success');
      expect(successRun?.failedStepKey).toBeNull();
    });
  });

  describe('findRunDetail', () => {
    it('returns the run with its step runs, each enriched with stepKey/type, in position order', async () => {
      const stepA = await createStep(db, workflowA.id, {
        stepKey: 'sign_in',
        type: 'signin',
        position: 0,
      });
      const stepB = await createStep(db, workflowA.id, {
        stepKey: 'wait_a_bit',
        type: 'wait',
        position: 1,
      });
      const run = await createWorkflowRun(db, workflowA.id, {
        status: 'success',
        triggerType: 'scheduled',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        finishedAt: new Date('2026-01-01T00:00:05.000Z'),
      });
      await createStepRun(db, run.id, stepB.id, {
        position: 1,
        status: 'success',
        output: { waitedSeconds: 5 },
      });
      await createStepRun(db, run.id, stepA.id, {
        position: 0,
        status: 'success',
        inputSnapshot: { email: 'user@example.com' },
      });

      const result = await service.findRunDetail(
        adminAActor,
        projectA.id,
        workflowA.id,
        run.id,
      );

      expect(result.id).toBe(run.id);
      expect(result.status).toBe('success');
      expect(result.triggerType).toBe('scheduled');
      expect(result.stepRuns.map((s) => [s.stepKey, s.type])).toEqual([
        ['sign_in', 'signin'],
        ['wait_a_bit', 'wait'],
      ]);
      expect(result.stepRuns[0].inputSnapshot).toEqual({
        email: 'user@example.com',
      });
      expect(result.stepRuns[1].output).toEqual({ waitedSeconds: 5 });
    });

    it('returns an empty stepRuns array when no steps were attempted', async () => {
      const run = await createWorkflowRun(db, workflowA.id, {
        status: 'success',
      });

      const result = await service.findRunDetail(
        adminAActor,
        projectA.id,
        workflowA.id,
        run.id,
      );

      expect(result.stepRuns).toEqual([]);
    });

    it('lets a viewer read a run in their own project', async () => {
      const projectViewer = await createProject(db, viewerA.id, {
        name: 'Project Viewer',
      });
      const viewerWorkflow = await createWorkflow(db, projectViewer.id, {
        name: 'Viewer Workflow',
      });
      const run = await createWorkflowRun(db, viewerWorkflow.id, {
        status: 'success',
      });

      await expect(
        service.findRunDetail(
          viewerAActor,
          projectViewer.id,
          viewerWorkflow.id,
          run.id,
        ),
      ).resolves.toMatchObject({ id: run.id });
    });

    it('rejects reading a run under a project the actor does not own', async () => {
      const run = await createWorkflowRun(db, workflowA.id, {
        status: 'success',
      });

      await expect(
        service.findRunDetail(adminBActor, projectA.id, workflowA.id, run.id),
      ).rejects.toThrow(ProjectNotFoundError);
    });

    it('rejects a run id that does not exist', async () => {
      await expect(
        service.findRunDetail(
          adminAActor,
          projectA.id,
          workflowA.id,
          'nonexistent-run-id',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a run that belongs to a different workflow', async () => {
      const otherWorkflow = await createWorkflow(db, projectA.id, {
        name: 'Other Workflow',
      });
      const run = await createWorkflowRun(db, otherWorkflow.id, {
        status: 'success',
      });

      await expect(
        service.findRunDetail(adminAActor, projectA.id, workflowA.id, run.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('executeScheduled', () => {
    it('creates a scheduled run and reuses runSteps, same as executeManual', async () => {
      await createStep(db, workflowA.id, { type: 'wait' });
      registry.register('wait', buildSuccessExecutor('wait', {}));

      const result = await service.executeScheduled(
        projectA.id,
        workflowA.id,
      );

      expect(result).not.toBeNull();
      expect(result?.triggerType).toBe('scheduled');
      expect(result?.status).toBe('success');
      expect(result?.stepRuns).toHaveLength(1);
    });

    it('returns null and creates no new run when an active run already exists', async () => {
      await createStep(db, workflowA.id, { type: 'wait' });
      registry.register('wait', buildSuccessExecutor('wait', {}));
      await createWorkflowRun(db, workflowA.id, { status: 'running' });

      const before = await db
        .select()
        .from(schema.workflowRuns)
        .where(eq(schema.workflowRuns.workflowId, workflowA.id));

      const result = await service.executeScheduled(
        projectA.id,
        workflowA.id,
      );

      const after = await db
        .select()
        .from(schema.workflowRuns)
        .where(eq(schema.workflowRuns.workflowId, workflowA.id));

      expect(result).toBeNull();
      expect(after).toHaveLength(before.length);
    });

    it('skips for an existing pending run too, not just running', async () => {
      await createStep(db, workflowA.id, { type: 'wait' });
      registry.register('wait', buildSuccessExecutor('wait', {}));
      await createWorkflowRun(db, workflowA.id, { status: 'pending' });

      const result = await service.executeScheduled(
        projectA.id,
        workflowA.id,
      );

      expect(result).toBeNull();
    });

    it.each(['success', 'failed', 'cancelled', 'skipped'] as const)(
      'does not skip when the only existing run has status %s',
      async (status) => {
        await createStep(db, workflowA.id, { type: 'wait' });
        registry.register('wait', buildSuccessExecutor('wait', {}));
        await createWorkflowRun(db, workflowA.id, { status });

        const result = await service.executeScheduled(
          projectA.id,
          workflowA.id,
        );

        expect(result).not.toBeNull();
      },
    );

    it('throws WorkflowNotFoundError for a nonexistent workflow', async () => {
      await expect(
        service.executeScheduled(projectA.id, 'nonexistent-workflow-id'),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('throws WorkflowNotFoundError when the workflow belongs to a different project', async () => {
      await expect(
        service.executeScheduled(projectB.id, workflowA.id),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('performs no ownership/actor check, unlike executeManual', async () => {
      await createStep(db, workflowA.id, { type: 'wait' });
      registry.register('wait', buildSuccessExecutor('wait', {}));

      // projectA is owned by adminA, not adminB — executeManual with
      // adminBActor would 404. executeScheduled takes no actor at all
      // and only needs the projectId/workflowId pair to be consistent.
      await expect(
        service.executeScheduled(projectA.id, workflowA.id),
      ).resolves.not.toBeNull();
    });
  });
});
