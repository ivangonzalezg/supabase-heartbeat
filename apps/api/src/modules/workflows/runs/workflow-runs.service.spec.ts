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
        stepKey: 'authenticate-user',
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
        stepKey: 'authenticate-user',
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
        stepKey: 'authenticate-user',
        type: 'signin',
        configuration: { email: 'a@example.com', password: 'x' },
      });

      const result = await service.executeManual(
        adminAActor,
        projectA.id,
        workflowA.id,
      );

      expect(result.stepRuns[0].status).toBe('failed');
      expect(result.stepRuns[0].error).toContain('authenticate-user');
    });

    it('finalizes the workflow run as failed', async () => {
      registry.register('signin', buildFailingExecutor('signin'));
      await createStep(db, workflowA.id, {
        stepKey: 'authenticate-user',
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
        stepKey: 'unsupported-step',
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
        stepKey: 'a-signin',
        type: 'signin',
        position: 0,
        configuration: { email: 'a@example.com', password: 'x' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'b-insert',
        type: 'insert',
        position: 1,
        configuration: { table: 't', values: { name: 'x' } },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'c-read',
        type: 'read',
        position: 2,
        configuration: { table: 't', columns: '*' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'd-update',
        type: 'update',
        position: 3,
        configuration: {
          table: 't',
          values: { name: 'y' },
          filter: { column: 'id', operator: 'eq', value: '1' },
        },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'e-delete',
        type: 'delete',
        position: 4,
        configuration: {
          table: 't',
          filter: { column: 'id', operator: 'eq', value: '1' },
        },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'f-invoke',
        type: 'invoke_function',
        position: 5,
        configuration: { functionName: 'my-fn' },
      });
      await createStep(db, workflowA.id, {
        stepKey: 'g-signout',
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
});
