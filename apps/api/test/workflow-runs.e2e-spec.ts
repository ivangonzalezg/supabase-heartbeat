import { join } from 'path';
import { jest } from '@jest/globals';
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
import type { ApplicationRole } from './../src/modules/auth/auth.types';
import { SupabaseClientFactory } from './../src/modules/workflow-execution/context/supabase-client.factory';
import { StepExecutorRegistry } from './../src/modules/workflow-execution/registry/step-executor.registry';

interface OpenAPIDocument {
  paths: Record<string, Record<string, unknown>>;
}

interface SignedInUser {
  cookie: string;
  userId: string;
}

interface ProjectResponseBody {
  id: string;
}

interface WorkflowStepResponseBody {
  id: string;
  stepKey: string;
  position: number;
}

interface WorkflowResponseBody {
  id: string;
  steps: WorkflowStepResponseBody[];
}

interface StepRunResponseBody {
  id: string;
  status: string;
  position: number;
  inputSnapshot: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
}

interface WorkflowRunResponseBody {
  id: string;
  workflowId: string;
  triggerType: string;
  status: string;
  error: string | null;
  stepRuns: StepRunResponseBody[];
}

const TEST_PASSWORD = 'correct-horse-battery-staple';

/**
 * A stub Supabase client with the exact `auth.signInWithPassword`/
 * `auth.signOut` surface the `signin`/`signout` executors call, mocking
 * the `RequestResultSafeDestructure`-shaped responses the real SDK
 * returns (see the workflow-execution foundation's own inspection
 * notes). Both methods are `jest.fn()`s so tests can assert every
 * executor received the exact same instance across one run, and can
 * make signin succeed or fail per test.
 */
function buildMockSupabaseClient(options: { signinShouldSucceed: boolean }) {
  return {
    auth: {
      signInWithPassword: jest.fn(() =>
        options.signinShouldSucceed
          ? Promise.resolve({
              data: {
                user: { id: 'mock-user-id' },
                session: { access_token: 'mock-access-token-not-real' },
              },
              error: null,
            })
          : Promise.resolve({
              data: { user: null, session: null },
              error: { message: 'Invalid login credentials' },
            }),
      ),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
    },
  };
}

async function createAndSignIn(
  app: INestApplication<App>,
  email: string,
  role: ApplicationRole,
): Promise<SignedInUser> {
  const authService = app.get(AuthService<Auth>);
  const created = await authService.api.createUser({
    body: { email, password: TEST_PASSWORD, name: 'Test User', role },
  });

  const response = await request(app.getHttpServer())
    .post('/api/auth/sign-in/email')
    .send({ email, password: TEST_PASSWORD })
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
  name = 'Test Project',
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/projects')
    .set('Cookie', user.cookie)
    .send({
      name,
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

describe('Workflow Runs API (e2e)', () => {
  let app: INestApplication<App>;
  let mockClient: ReturnType<typeof buildMockSupabaseClient>;

  beforeEach(async () => {
    mockClient = buildMockSupabaseClient({ signinShouldSucceed: true });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseClientFactory)
      .useValue({ create: () => mockClient })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await setupSwagger(app);
    await app.init();

    const databaseService = app.get(DatabaseService);
    migrate(databaseService.db, {
      migrationsFolder: join(process.cwd(), 'drizzle'),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects an unauthenticated manual-run request', async () => {
    await request(app.getHttpServer())
      .post('/api/projects/some-project-id/workflows/some-workflow-id/runs')
      .expect(401);
  });

  it('rejects a viewer manual-run request', async () => {
    const viewer = await createAndSignIn(
      app,
      `viewer-${crypto.randomUUID()}@example.com`,
      'viewer',
    );
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Viewer test workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        { stepKey: 'wait-1', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', viewer.cookie)
      .expect(403);
  });

  it('rejects another owner attempting to run a workflow, with 404', async () => {
    const adminA = await createAndSignIn(
      app,
      `admin-a-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const adminB = await createAndSignIn(
      app,
      `admin-b-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectAId = await createProjectAs(app, adminA, 'Project A');
    const workflow = await createWorkflowAs(app, adminA, projectAId, {
      name: 'Owned by A',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        { stepKey: 'wait-1', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectAId}/workflows/${workflow.id}/runs`)
      .set('Cookie', adminB.cookie)
      .expect(404);
  });

  it('returns 404 for a nonexistent project/workflow hierarchy', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );

    await request(app.getHttpServer())
      .post(
        `/api/projects/${crypto.randomUUID()}/workflows/${crypto.randomUUID()}/runs`,
      )
      .set('Cookie', admin.cookie)
      .expect(404);
  });

  it('lets an admin manually run an owned workflow, returning 201 with ordered successful step runs', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Full pipeline',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        {
          stepKey: 'sign-in',
          type: 'signin',
          configuration: {
            email: 'heartbeat-user@example.com',
            password: 'a-test-password',
          },
        },
        { stepKey: 'pause', type: 'wait', configuration: { seconds: 1 } },
        { stepKey: 'sign-out', type: 'signout', configuration: {} },
      ],
    });

    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', admin.cookie)
      .expect(201);

    const body = response.body as WorkflowRunResponseBody;
    expect(body.workflowId).toBe(workflow.id);
    expect(body.triggerType).toBe('manual');
    expect(body.status).toBe('success');
    expect(body.error).toBeNull();
    expect(body.stepRuns).toHaveLength(3);
    expect(body.stepRuns.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(body.stepRuns.every((s) => s.status === 'success')).toBe(true);
  });

  it('uses the same mocked client for signin, wait, and signout', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Shared client check',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        {
          stepKey: 'sign-in',
          type: 'signin',
          configuration: { email: 'a@example.com', password: 'x' },
        },
        { stepKey: 'sign-out', type: 'signout', configuration: {} },
      ],
    });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', admin.cookie)
      .expect(201);

    expect(mockClient.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(mockClient.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('redacts the password in the signin step-run snapshot, never returning it', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Snapshot redaction check',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        {
          stepKey: 'sign-in',
          type: 'signin',
          configuration: {
            email: 'heartbeat-user@example.com',
            password: 'super-secret-password-value',
          },
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', admin.cookie)
      .expect(201);

    const body = response.body as WorkflowRunResponseBody;
    const snapshot = body.stepRuns[0].inputSnapshot as {
      configuration: { password: string };
    };
    expect(snapshot.configuration.password).toBe('[REDACTED]');
    expect(JSON.stringify(body)).not.toContain('super-secret-password-value');
  });

  it('never includes token-like values in step-run output', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Token safety check',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        {
          stepKey: 'sign-in',
          type: 'signin',
          configuration: { email: 'a@example.com', password: 'x' },
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', admin.cookie)
      .expect(201);

    const body = response.body as WorkflowRunResponseBody;
    expect(JSON.stringify(body)).not.toContain('mock-access-token-not-real');
    expect(body.stepRuns[0].output).toEqual({
      authenticated: true,
      userId: 'mock-user-id',
    });
  });

  it('omits disabled steps from the run', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Disabled step check',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        { stepKey: 'wait-1', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/steps`)
      .set('Cookie', admin.cookie)
      .send({
        stepKey: 'wait-2',
        type: 'wait',
        configuration: { seconds: 1 },
        enabled: false,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', admin.cookie)
      .expect(201);

    const body = response.body as WorkflowRunResponseBody;
    expect(body.stepRuns).toHaveLength(1);
    expect(body.stepRuns[0].position).toBe(0);
  });

  it('runs a disabled workflow manually without error', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Disabled workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      enabled: false,
      steps: [
        { stepKey: 'wait-1', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', admin.cookie)
      .expect(201);

    expect((response.body as WorkflowRunResponseBody).status).toBe('success');
  });

  it('returns 201 with a failed run when the first executor fails', async () => {
    mockClient = buildMockSupabaseClient({ signinShouldSucceed: false });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseClientFactory)
      .useValue({ create: () => mockClient })
      .compile();
    await app.close();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await setupSwagger(app);
    await app.init();
    migrate(app.get(DatabaseService).db, {
      migrationsFolder: join(process.cwd(), 'drizzle'),
    });

    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Failing signin',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        {
          stepKey: 'sign-in',
          type: 'signin',
          configuration: { email: 'a@example.com', password: 'wrong' },
        },
        { stepKey: 'pause', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', admin.cookie)
      .expect(201);

    const body = response.body as WorkflowRunResponseBody;
    expect(body.status).toBe('failed');
    expect(body.error).not.toBeNull();
    expect(body.stepRuns).toHaveLength(1);
    expect(body.stepRuns[0].status).toBe('failed');
  });

  it('never returns sensitive values from an unexpected, unwrapped executor error', async () => {
    // Every built-in executor (signin/wait/signout) already wraps its own
    // failures into a safe StepExecutionError before they leave the
    // executor. To prove the service-level allowlist itself — not just
    // the executors' own discipline — this test replaces the registry
    // with a fake executor that throws a raw, unrecognized Error, exactly
    // as an unanticipated third-party SDK exception would.
    const sensitiveError = new Error(
      'Unexpected upstream failure: password="hunter2-super-secret" ' +
        'access_token=eyJhbGciOiJIUzI1NiIsdummy.token.value ' +
        'refresh_token=rt_dummy_super_secret_value ' +
        'Authorization: Bearer dummy-secret-bearer-token',
    );
    const fakeRegistry = {
      get: () => ({
        type: 'signin' as const,
        execute: () => Promise.reject(sensitiveError),
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseClientFactory)
      .useValue({
        create: () => buildMockSupabaseClient({ signinShouldSucceed: true }),
      })
      .overrideProvider(StepExecutorRegistry)
      .useValue(fakeRegistry)
      .compile();
    await app.close();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await setupSwagger(app);
    await app.init();
    migrate(app.get(DatabaseService).db, {
      migrationsFolder: join(process.cwd(), 'drizzle'),
    });

    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Unexpected failure',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        {
          stepKey: 'sign-in',
          type: 'signin',
          configuration: { email: 'a@example.com', password: 'irrelevant' },
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', admin.cookie)
      .expect(201);

    const body = response.body as WorkflowRunResponseBody;
    const serialized = JSON.stringify(body);

    expect(body.status).toBe('failed');
    expect(serialized).not.toContain('hunter2-super-secret');
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiIsdummy.token.value');
    expect(serialized).not.toContain('rt_dummy_super_secret_value');
    expect(serialized).not.toContain('dummy-secret-bearer-token');
    expect(body.stepRuns[0].error).toContain(
      'An unexpected execution error occurred.',
    );
  });

  it('produces a persisted failed run for an unimplemented step type', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Unimplemented type',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        {
          stepKey: 'insert-row',
          type: 'insert',
          configuration: { table: 'profiles', values: { active: true } },
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', admin.cookie)
      .expect(201);

    const body = response.body as WorkflowRunResponseBody;
    expect(body.status).toBe('failed');
    expect(body.stepRuns[0].status).toBe('failed');
    expect(body.stepRuns[0].error).toContain('insert');
  });

  it('succeeds with an empty step-run list when the workflow has no enabled steps', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'Zero enabled steps',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        {
          stepKey: 'wait-1',
          type: 'wait',
          configuration: { seconds: 1 },
          enabled: false,
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
      .set('Cookie', admin.cookie)
      .expect(201);

    const body = response.body as WorkflowRunResponseBody;
    expect(body.status).toBe('success');
    expect(body.stepRuns).toHaveLength(0);
  });

  it('leaves existing workflow and step CRUD fully functional', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const workflow = await createWorkflowAs(app, admin, projectId, {
      name: 'CRUD still works',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        { stepKey: 'wait-1', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/workflows/${workflow.id}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/workflows/${workflow.id}/steps`)
      .set('Cookie', admin.cookie)
      .expect(200);
  });

  it('documents the manual-run endpoint and response in /api/openapi.json', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;

    const path = '/api/projects/{projectId}/workflows/{workflowId}/runs';
    expect(document.paths).toHaveProperty(path);
    expect(document.paths[path].post).toBeDefined();
  });

  it('adds no scheduler route or behavior', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;
    const pathKeys = Object.keys(document.paths);

    const schedulerLikePaths = pathKeys.filter((path) =>
      /schedule|cron-trigger|scheduler/i.test(path),
    );
    expect(schedulerLikePaths).toEqual([]);
  });
});
