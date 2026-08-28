import { jest } from '@jest/globals';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../../database/schema';
import type { AppDatabase } from '../../../database/database.types';
import { WorkflowSchedulerService } from './workflow-scheduler.service';
import type { WorkflowRunsService } from '../runs/workflow-runs.service';

function createTestDb(): { db: AppDatabase; connection: Database.Database } {
  const connection = new Database(':memory:');
  connection.pragma('foreign_keys = ON');

  const db = drizzle(connection, { schema }) as AppDatabase;
  migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });

  return { db, connection };
}

async function createUser(db: AppDatabase) {
  const [user] = await db
    .insert(schema.users)
    .values({
      id: crypto.randomUUID(),
      name: 'Test User',
      email: `${crypto.randomUUID()}@example.com`,
      emailVerified: false,
      role: 'admin',
    })
    .returning();
  return user;
}

async function createProject(db: AppDatabase, overrides = {}) {
  const owner = await createUser(db);
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: crypto.randomUUID(),
      ownerId: owner.id,
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
      enabled: true,
      ...overrides,
    })
    .returning();
  return workflow;
}

function buildFakeWorkflowRunsService(): WorkflowRunsService & {
  executeScheduled: jest.Mock;
} {
  return {
    executeScheduled: jest.fn(() => Promise.resolve(null)),
  } as unknown as WorkflowRunsService & { executeScheduled: jest.Mock };
}

function buildService(
  db: AppDatabase,
  workflowRunsService: WorkflowRunsService,
): WorkflowSchedulerService {
  return new WorkflowSchedulerService({ db } as never, workflowRunsService);
}

describe('WorkflowSchedulerService', () => {
  let db: AppDatabase;
  let connection: Database.Database;
  let workflowRunsService: ReturnType<typeof buildFakeWorkflowRunsService>;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    ({ db, connection } = createTestDb());
    workflowRunsService = buildFakeWorkflowRunsService();
  });

  afterEach(() => {
    connection.close();
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  describe('onApplicationBootstrap', () => {
    it('registers zero jobs when the scheduler is disabled', async () => {
      delete process.env.SCHEDULER_ENABLED;
      const project = await createProject(db);
      await createWorkflow(db, project.id);

      const service = buildService(db, workflowRunsService);
      await service.onApplicationBootstrap();

      expect(service.getRegisteredWorkflowIds()).toEqual([]);
    });

    it('registers exactly one job per enabled workflow when enabled', async () => {
      process.env.SCHEDULER_ENABLED = 'true';
      const project = await createProject(db);
      const enabledOne = await createWorkflow(db, project.id, {
        enabled: true,
      });
      const enabledTwo = await createWorkflow(db, project.id, {
        enabled: true,
      });
      await createWorkflow(db, project.id, { enabled: false });

      const service = buildService(db, workflowRunsService);
      await service.onApplicationBootstrap();

      const registered = service.getRegisteredWorkflowIds();
      expect(registered).toHaveLength(2);
      expect(registered).toEqual(
        expect.arrayContaining([enabledOne.id, enabledTwo.id]),
      );

      await service.onApplicationShutdown();
    });
  });

  describe('registerOrReplace', () => {
    it('is a no-op when the scheduler is disabled', async () => {
      delete process.env.SCHEDULER_ENABLED;
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });

      const service = buildService(db, workflowRunsService);
      await service.registerOrReplace(workflow.id);

      expect(service.getRegisteredWorkflowIds()).toEqual([]);
    });

    it('registers a job for a newly enabled workflow', async () => {
      process.env.SCHEDULER_ENABLED = 'true';
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });

      const service = buildService(db, workflowRunsService);
      await service.registerOrReplace(workflow.id);

      expect(service.getRegisteredWorkflowIds()).toEqual([workflow.id]);

      await service.onApplicationShutdown();
    });

    it('replaces an existing job rather than double-registering', async () => {
      process.env.SCHEDULER_ENABLED = 'true';
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });

      const service = buildService(db, workflowRunsService);
      await service.registerOrReplace(workflow.id);
      await service.registerOrReplace(workflow.id);

      expect(service.getRegisteredWorkflowIds()).toEqual([workflow.id]);

      await service.onApplicationShutdown();
    });

    it('unregisters when the workflow is now disabled', async () => {
      process.env.SCHEDULER_ENABLED = 'true';
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });

      const service = buildService(db, workflowRunsService);
      await service.registerOrReplace(workflow.id);
      expect(service.getRegisteredWorkflowIds()).toEqual([workflow.id]);

      await db
        .update(schema.workflows)
        .set({ enabled: false })
        .where(eq(schema.workflows.id, workflow.id));
      await service.registerOrReplace(workflow.id);

      expect(service.getRegisteredWorkflowIds()).toEqual([]);
    });

    it('unregisters when the workflow no longer exists', async () => {
      process.env.SCHEDULER_ENABLED = 'true';
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });

      const service = buildService(db, workflowRunsService);
      await service.registerOrReplace(workflow.id);
      expect(service.getRegisteredWorkflowIds()).toEqual([workflow.id]);

      await db
        .delete(schema.workflows)
        .where(eq(schema.workflows.id, workflow.id));
      await service.registerOrReplace(workflow.id);

      expect(service.getRegisteredWorkflowIds()).toEqual([]);
    });
  });

  describe('unregister', () => {
    it('is a safe no-op for an id with no registered job', () => {
      const service = buildService(db, workflowRunsService);

      expect(() => service.unregister('nonexistent-id')).not.toThrow();
      expect(service.getRegisteredWorkflowIds()).toEqual([]);
    });

    it('removes a registered job', async () => {
      process.env.SCHEDULER_ENABLED = 'true';
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });

      const service = buildService(db, workflowRunsService);
      await service.registerOrReplace(workflow.id);
      service.unregister(workflow.id);

      expect(service.getRegisteredWorkflowIds()).toEqual([]);
    });
  });

  describe('handleTick', () => {
    it('calls executeScheduled with the workflow projectId/id', async () => {
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });
      const service = buildService(db, workflowRunsService);

      await service.handleTick(workflow.id);

      expect(workflowRunsService.executeScheduled).toHaveBeenCalledWith(
        project.id,
        workflow.id,
      );
    });

    it('logs the tick firing and the run result when a run was created', async () => {
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });
      workflowRunsService.executeScheduled.mockImplementation(() =>
        Promise.resolve({
          id: 'run-1',
          workflowId: workflow.id,
          triggerType: 'scheduled',
          status: 'success',
          startedAt: new Date(),
          finishedAt: new Date(),
          error: null,
          stepRuns: [],
        }),
      );
      const logSpy = jest.spyOn(Logger.prototype, 'log');
      const service = buildService(db, workflowRunsService);

      await service.handleTick(workflow.id);

      expect(logSpy).toHaveBeenCalledWith(
        `Scheduled tick fired for workflow ${workflow.id}.`,
      );
      expect(logSpy).toHaveBeenCalledWith(
        `Scheduled run run-1 for workflow ${workflow.id} finished with status "success".`,
      );
    });

    it('does not log a run-result line when the run was skipped (overlap)', async () => {
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });
      workflowRunsService.executeScheduled.mockImplementation(() =>
        Promise.resolve(null),
      );
      const logSpy = jest.spyOn(Logger.prototype, 'log');
      const service = buildService(db, workflowRunsService);

      await service.handleTick(workflow.id);

      expect(logSpy).toHaveBeenCalledWith(
        `Scheduled tick fired for workflow ${workflow.id}.`,
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('finished with status'),
      );
    });

    it('unregisters and does not execute when the workflow no longer exists', async () => {
      const service = buildService(db, workflowRunsService);

      await service.handleTick('nonexistent-id');

      expect(workflowRunsService.executeScheduled).not.toHaveBeenCalled();
    });

    it('unregisters and does not execute when the workflow is now disabled', async () => {
      process.env.SCHEDULER_ENABLED = 'true';
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });
      const service = buildService(db, workflowRunsService);
      await service.registerOrReplace(workflow.id);

      await db
        .update(schema.workflows)
        .set({ enabled: false })
        .where(eq(schema.workflows.id, workflow.id));

      await service.handleTick(workflow.id);

      expect(workflowRunsService.executeScheduled).not.toHaveBeenCalled();
      expect(service.getRegisteredWorkflowIds()).toEqual([]);
    });

    it('swallows an error from executeScheduled without affecting other jobs', async () => {
      process.env.SCHEDULER_ENABLED = 'true';
      const project = await createProject(db);
      const failing = await createWorkflow(db, project.id, { enabled: true });
      const healthy = await createWorkflow(db, project.id, { enabled: true });

      workflowRunsService.executeScheduled.mockImplementation(
        (...args: unknown[]) =>
          args[1] === failing.id
            ? Promise.reject(new Error('simulated failure'))
            : Promise.resolve(null),
      );

      const service = buildService(db, workflowRunsService);
      await service.registerOrReplace(failing.id);
      await service.registerOrReplace(healthy.id);

      await expect(service.handleTick(failing.id)).resolves.toBeUndefined();

      expect(service.getRegisteredWorkflowIds()).toEqual(
        expect.arrayContaining([failing.id, healthy.id]),
      );

      await service.onApplicationShutdown();
    });
  });

  describe('real CronJob wiring', () => {
    it('reaches handleTick via a real CronJob.fireOnTick(), without waiting for a real cron fire', async () => {
      process.env.SCHEDULER_ENABLED = 'true';
      const project = await createProject(db);
      const workflow = await createWorkflow(db, project.id, {
        enabled: true,
      });

      const service = buildService(db, workflowRunsService);
      await service.registerOrReplace(workflow.id);

      const job = service.getRegisteredJob(workflow.id);
      expect(job).toBeDefined();
      expect(job?.isActive).toBe(true);

      await job?.fireOnTick();

      expect(workflowRunsService.executeScheduled).toHaveBeenCalledWith(
        project.id,
        workflow.id,
      );

      await service.onApplicationShutdown();
    });
  });

  describe('onApplicationShutdown', () => {
    it('stops every registered job and clears the registry', async () => {
      process.env.SCHEDULER_ENABLED = 'true';
      const project = await createProject(db);
      const workflowOne = await createWorkflow(db, project.id, {
        enabled: true,
      });
      const workflowTwo = await createWorkflow(db, project.id, {
        enabled: true,
      });

      const service = buildService(db, workflowRunsService);
      await service.registerOrReplace(workflowOne.id);
      await service.registerOrReplace(workflowTwo.id);

      await service.onApplicationShutdown();

      expect(service.getRegisteredWorkflowIds()).toEqual([]);
    });
  });
});
