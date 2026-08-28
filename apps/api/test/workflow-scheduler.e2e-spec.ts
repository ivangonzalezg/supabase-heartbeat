import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { AuthService } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { setupSwagger } from './../src/lib/swagger/swagger.config';
import type { Auth } from './../src/modules/auth/auth.config';
import { WorkflowSchedulerService } from './../src/modules/workflows/scheduler/workflow-scheduler.service';

interface SignedInUser {
  cookie: string;
  userId: string;
}

interface ProjectResponseBody {
  id: string;
}

interface WorkflowResponseBody {
  id: string;
  enabled: boolean;
}

async function createAndSignIn(
  app: INestApplication<App>,
): Promise<SignedInUser> {
  const authService = app.get(AuthService<Auth>);
  const email = `admin-${crypto.randomUUID()}@example.com`;
  const password = 'correct-horse-battery-staple';
  const created = await authService.api.createUser({
    body: { email, password, name: 'Test User', role: 'admin' },
  });

  const response = await request(app.getHttpServer())
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .expect(200);

  const setCookieHeader = response.headers['set-cookie'] as unknown as
    string[] | undefined;
  if (!setCookieHeader || setCookieHeader.length === 0) {
    throw new Error('Sign-in response did not include a session cookie.');
  }

  return { cookie: setCookieHeader[0], userId: created.user.id };
}

async function createProjectAs(
  app: INestApplication<App>,
  user: SignedInUser,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/projects')
    .set('Cookie', user.cookie)
    .send({
      name: 'Test Project',
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    })
    .expect(201);

  return (response.body as ProjectResponseBody).id;
}

async function createWorkflowAs(
  app: INestApplication<App>,
  user: SignedInUser,
  projectId: string,
  body: Record<string, unknown>,
): Promise<WorkflowResponseBody> {
  const response = await request(app.getHttpServer())
    .post(`/api/projects/${projectId}/workflows`)
    .set('Cookie', user.cookie)
    .send(body)
    .expect(201);

  return response.body as WorkflowResponseBody;
}

/**
 * Migrates the database *before* `app.init()`, unlike most other e2e
 * specs in this suite — `WorkflowSchedulerService.onApplicationBootstrap`
 * (which queries the `workflows` table) runs as part of `app.init()`
 * when `SCHEDULER_ENABLED=true`, so the schema must already exist by
 * then.
 */
async function bootApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await setupSwagger(app);

  const databaseService = app.get(DatabaseService);
  migrate(databaseService.db, {
    migrationsFolder: join(process.cwd(), 'drizzle'),
  });

  await app.init();

  return app;
}

describe('Workflow Scheduler (e2e)', () => {
  let app: INestApplication<App>;
  const originalEnv = { ...process.env };

  afterEach(async () => {
    await app.close();
    process.env = { ...originalEnv };
  });

  it('registers no jobs when SCHEDULER_ENABLED is unset', async () => {
    delete process.env.SCHEDULER_ENABLED;
    app = await bootApp();

    const user = await createAndSignIn(app);
    const projectId = await createProjectAs(app, user);
    const workflow = await createWorkflowAs(app, user, projectId, {
      name: 'Scheduled workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      enabled: true,
      steps: [
        { stepKey: 'wait_1', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    const scheduler = app.get(WorkflowSchedulerService);
    expect(scheduler.getRegisteredWorkflowIds()).not.toContain(workflow.id);
  });

  it('registers a newly created enabled workflow when SCHEDULER_ENABLED=true', async () => {
    process.env.SCHEDULER_ENABLED = 'true';
    app = await bootApp();

    const user = await createAndSignIn(app);
    const projectId = await createProjectAs(app, user);
    const workflow = await createWorkflowAs(app, user, projectId, {
      name: 'Scheduled workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      enabled: true,
      steps: [
        { stepKey: 'wait_1', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    const scheduler = app.get(WorkflowSchedulerService);
    expect(scheduler.getRegisteredWorkflowIds()).toContain(workflow.id);
  });

  it('unregisters a workflow when it is disabled via PATCH', async () => {
    process.env.SCHEDULER_ENABLED = 'true';
    app = await bootApp();

    const user = await createAndSignIn(app);
    const projectId = await createProjectAs(app, user);
    const workflow = await createWorkflowAs(app, user, projectId, {
      name: 'Scheduled workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      enabled: true,
      steps: [
        { stepKey: 'wait_1', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    const scheduler = app.get(WorkflowSchedulerService);
    expect(scheduler.getRegisteredWorkflowIds()).toContain(workflow.id);

    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}/workflows/${workflow.id}`)
      .set('Cookie', user.cookie)
      .send({ enabled: false })
      .expect(200);

    expect(scheduler.getRegisteredWorkflowIds()).not.toContain(workflow.id);
  });

  it('unregisters a workflow when it is deleted', async () => {
    process.env.SCHEDULER_ENABLED = 'true';
    app = await bootApp();

    const user = await createAndSignIn(app);
    const projectId = await createProjectAs(app, user);
    const workflow = await createWorkflowAs(app, user, projectId, {
      name: 'Scheduled workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      enabled: true,
      steps: [
        { stepKey: 'wait_1', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    const scheduler = app.get(WorkflowSchedulerService);
    expect(scheduler.getRegisteredWorkflowIds()).toContain(workflow.id);

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/workflows/${workflow.id}`)
      .set('Cookie', user.cookie)
      .expect(204);

    expect(scheduler.getRegisteredWorkflowIds()).not.toContain(workflow.id);
  });
});
