import { join } from 'path';
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { WorkflowStepType } from '@supabase-heartbeat/validation';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { setupSwagger } from './../src/lib/swagger/swagger.config';
import type { Auth } from './../src/modules/auth/auth.config';
import type { ApplicationRole } from './../src/modules/auth/auth.types';
import { SupabaseClientFactory } from './../src/modules/workflow-execution/context/supabase-client.factory';
import { StepExecutorRegistry } from './../src/modules/workflow-execution/registry/step-executor.registry';
import { StepExecutorNotFoundError } from './../src/modules/workflow-execution/errors/workflow-execution.errors';

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
 * Canned `{ data, error }` responses used by the `.from()` chain builder
 * below — one per table operation. Defaults model a realistic
 * successful call for each of `insert`/`read`/`update`/`delete`; tests
 * override individual entries to simulate a PostgREST error or a
 * malformed response for a specific operation. `insert.data` is unused
 * by `insertMock` (the executor never selects rows back — see
 * `insert-step.executor.ts`) but kept on the shape for type uniformity
 * with the other three operations.
 */
function buildDefaultTableResponses(): Record<
  'insert' | 'read' | 'update' | 'delete',
  { data: unknown; error: unknown }
> {
  return {
    insert: {
      data: [{ id: 'inserted-row-id', name: 'Heartbeat' }],
      error: null,
    },
    read: { data: [], error: null },
    update: { data: [], error: null },
    delete: { data: [], error: null },
  };
}

/**
 * A mock client whose chained query builders accurately model the real
 * SDK surface this task's executors call:
 * `from().insert()`, `from().select().limit()`,
 * `from().update().eq().select()`, `from().delete().eq().select()`,
 * `functions.invoke()`, `auth.signInWithPassword()`, `auth.signOut()`.
 * `insert` never chains `.select()` (see `insert-step.executor.ts` for
 * why) so `insertMock` resolves directly to `{ error }` and never
 * returns row data, unlike `update`/`delete`. Every leaf method is a
 * `jest.fn()` so tests can assert exact call counts/arguments and
 * confirm the same client instance is reused across every executor in
 * one run.
 */
function buildMockSupabaseClient(options: {
  signinShouldSucceed: boolean;
  tableResponses?: Partial<ReturnType<typeof buildDefaultTableResponses>>;
  functionResponse?: { data: unknown; error: unknown };
}) {
  const responses = {
    ...buildDefaultTableResponses(),
    ...options.tableResponses,
  };

  const insertMock = jest.fn(() =>
    Promise.resolve({ error: responses.insert.error }),
  );

  const readLimit = jest.fn(() => Promise.resolve(responses.read));
  const readSelect = jest.fn(() => ({
    then: (resolve: (value: typeof responses.read) => void) =>
      resolve(responses.read),
    limit: readLimit,
  }));

  const updateSelect = jest.fn(() => Promise.resolve(responses.update));
  const updateEq = jest.fn(() => ({ select: updateSelect }));
  const updateMock = jest.fn(() => ({ eq: updateEq }));

  const deleteSelect = jest.fn(() => Promise.resolve(responses.delete));
  const deleteEq = jest.fn(() => ({ select: deleteSelect }));
  const deleteMock = jest.fn(() => ({ eq: deleteEq }));

  const from = jest.fn(() => ({
    insert: insertMock,
    select: readSelect,
    update: updateMock,
    delete: deleteMock,
  }));

  const invoke = jest.fn(() =>
    Promise.resolve(options.functionResponse ?? { data: null, error: null }),
  );

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
    from,
    functions: { invoke },
    __mocks: {
      from,
      insertMock,
      readSelect,
      readLimit,
      updateMock,
      updateEq,
      updateSelect,
      deleteMock,
      deleteEq,
      deleteSelect,
      invoke,
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
        { stepKey: 'wait_1', type: 'wait', configuration: { seconds: 1 } },
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
        { stepKey: 'wait_1', type: 'wait', configuration: { seconds: 1 } },
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
          stepKey: 'sign_in',
          type: 'signin',
          configuration: {
            email: 'heartbeat-user@example.com',
            password: 'a-test-password',
          },
        },
        { stepKey: 'pause', type: 'wait', configuration: { seconds: 1 } },
        { stepKey: 'sign_out', type: 'signout', configuration: {} },
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
          stepKey: 'sign_in',
          type: 'signin',
          configuration: { email: 'a@example.com', password: 'x' },
        },
        { stepKey: 'sign_out', type: 'signout', configuration: {} },
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
          stepKey: 'sign_in',
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
          stepKey: 'sign_in',
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
        { stepKey: 'wait_1', type: 'wait', configuration: { seconds: 1 } },
      ],
    });

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows/${workflow.id}/steps`)
      .set('Cookie', admin.cookie)
      .send({
        stepKey: 'wait_2',
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
        { stepKey: 'wait_1', type: 'wait', configuration: { seconds: 1 } },
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
          stepKey: 'sign_in',
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
          stepKey: 'sign_in',
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

  it('produces a persisted failed run when a step type has no registered executor', async () => {
    // All 8 canonical MVP step types now have a real, registered
    // executor — there is no remaining genuinely-unimplemented type to
    // exercise this scenario with. This test instead overrides
    // StepExecutorRegistry itself (exported by WorkflowExecutionModule,
    // same override pattern as SupabaseClientFactory above) with a fake
    // that reports every type as missing, to prove the manual-run engine
    // still handles a missing-executor failure safely end to end.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseClientFactory)
      .useValue({ create: () => mockClient })
      .overrideProvider(StepExecutorRegistry)
      .useValue({
        get: (type: WorkflowStepType) => {
          throw new StepExecutorNotFoundError(type);
        },
      })
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
      name: 'Missing executor',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      steps: [
        {
          stepKey: 'insert_row',
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
          stepKey: 'wait_1',
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
        { stepKey: 'wait_1', type: 'wait', configuration: { seconds: 1 } },
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

  describe('data and function executors', () => {
    function allEightStepsWorkflow() {
      return {
        name: 'All MVP step types',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'a_signin',
            type: 'signin',
            configuration: { email: 'a@example.com', password: TEST_PASSWORD },
          },
          {
            stepKey: 'b_insert',
            type: 'insert',
            configuration: {
              table: 'heartbeats',
              values: { name: 'Heartbeat' },
            },
          },
          {
            stepKey: 'c_read',
            type: 'read',
            configuration: { table: 'heartbeats', columns: '*' },
          },
          {
            stepKey: 'd_update',
            type: 'update',
            configuration: {
              table: 'heartbeats',
              values: { active: false },
              filter: {
                column: 'id',
                operator: 'eq',
                value: 'inserted-row-id',
              },
            },
          },
          {
            stepKey: 'e_delete',
            type: 'delete',
            configuration: {
              table: 'heartbeats',
              filter: {
                column: 'id',
                operator: 'eq',
                value: 'inserted-row-id',
              },
            },
          },
          {
            stepKey: 'f_invoke',
            type: 'invoke_function',
            configuration: { functionName: 'send-heartbeat' },
          },
          { stepKey: 'g_wait', type: 'wait', configuration: { seconds: 1 } },
          { stepKey: 'h_signout', type: 'signout', configuration: {} },
        ],
      };
    }

    it('runs a workflow containing all 8 MVP step types, returning 201 with a successful ordered run', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        allEightStepsWorkflow(),
      );

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      expect(body.status).toBe('success');
      expect(body.stepRuns).toHaveLength(8);
      expect(body.stepRuns.map((stepRun) => stepRun.status)).toEqual(
        Array(8).fill('success'),
      );
      expect(body.stepRuns.map((stepRun) => stepRun.position)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7,
      ]);
    });

    it('uses the same mocked client for every data/function operation in the run', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        allEightStepsWorkflow(),
      );

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const mocks = mockClient.__mocks;
      expect(mockClient.auth.signInWithPassword).toHaveBeenCalledTimes(1);
      expect(mocks.insertMock).toHaveBeenCalledTimes(1);
      expect(mocks.readSelect).toHaveBeenCalledTimes(1);
      expect(mocks.updateMock).toHaveBeenCalledTimes(1);
      expect(mocks.deleteMock).toHaveBeenCalledTimes(1);
      expect(mocks.invoke).toHaveBeenCalledTimes(1);
      expect(mockClient.auth.signOut).toHaveBeenCalledTimes(1);
      // Every one of these calls happened on the exact same `from`
      // instance — proving one shared client/context for the whole run.
      expect(mocks.from).toHaveBeenCalledTimes(4);
    });

    it('produces a stable insert output shape', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(app, admin, projectId, {
        name: 'Insert only',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'insert_row',
            type: 'insert',
            configuration: {
              table: 'heartbeats',
              values: { name: 'Heartbeat' },
            },
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      expect(body.stepRuns[0].output).toEqual({ rows: [], count: 0 });
    });

    it('succeeds with an empty read result', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(app, admin, projectId, {
        name: 'Read only',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'read_rows',
            type: 'read',
            configuration: { table: 'heartbeats', columns: '*' },
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      expect(body.status).toBe('success');
      expect(body.stepRuns[0].output).toEqual({ rows: [], count: 0 });
    });

    it('produces a stable update output shape', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(app, admin, projectId, {
        name: 'Update only',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'update_row',
            type: 'update',
            configuration: {
              table: 'heartbeats',
              values: { active: false },
              filter: { column: 'id', operator: 'eq', value: '1' },
            },
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      expect(body.status).toBe('success');
      expect(body.stepRuns[0].output).toEqual({ rows: [], count: 0 });
    });

    it('produces a stable delete output shape', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(app, admin, projectId, {
        name: 'Delete only',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'delete_row',
            type: 'delete',
            configuration: {
              table: 'heartbeats',
              filter: { column: 'id', operator: 'eq', value: '1' },
            },
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      expect(body.status).toBe('success');
      expect(body.stepRuns[0].output).toEqual({ rows: [], count: 0 });
    });

    it('succeeds with a null function result', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(app, admin, projectId, {
        name: 'Invoke only',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'invoke_fn',
            type: 'invoke_function',
            configuration: { functionName: 'send-heartbeat' },
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      expect(body.status).toBe('success');
      expect(body.stepRuns[0].output).toEqual({ data: null });
    });

    it('returns outputs through the HTTP response that match what was persisted', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(app, admin, projectId, {
        name: 'Insert only',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'insert_row',
            type: 'insert',
            configuration: {
              table: 'heartbeats',
              values: { name: 'Heartbeat' },
            },
          },
        ],
      });

      const runResponse = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);
      const body = runResponse.body as WorkflowRunResponseBody;

      const stepResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/workflows/${workflow.id}/steps`)
        .set('Cookie', admin.cookie)
        .expect(200);
      const steps = stepResponse.body as { id: string }[];

      expect(body.stepRuns[0].output).toEqual({ rows: [], count: 0 });
      expect(steps).toHaveLength(1);
    });

    it('returns 201 with a failed run when a PostgREST-style error occurs, and stops before later steps', async () => {
      mockClient = buildMockSupabaseClient({
        signinShouldSucceed: true,
        tableResponses: {
          insert: {
            data: null,
            error: {
              message: 'permission denied',
              details: '',
              hint: '',
              code: '42501',
            },
          },
        },
      });

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
        name: 'Insert then read',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'insert_row',
            type: 'insert',
            configuration: {
              table: 'heartbeats',
              values: { name: 'Heartbeat' },
            },
          },
          {
            stepKey: 'read_rows',
            type: 'read',
            configuration: { table: 'heartbeats', columns: '*' },
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      expect(body.status).toBe('failed');
      expect(body.stepRuns).toHaveLength(1);
      expect(body.stepRuns[0].status).toBe('failed');
      expect(mockClient.__mocks.readSelect).not.toHaveBeenCalled();
    });

    it('produces a safe failed run for a Functions SDK error', async () => {
      mockClient = buildMockSupabaseClient({
        signinShouldSucceed: true,
        functionResponse: {
          data: null,
          error: {
            name: 'FunctionsHttpError',
            message: 'Edge Function returned a non-2xx status code',
          },
        },
      });

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
        name: 'Invoke only',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'invoke_fn',
            type: 'invoke_function',
            configuration: { functionName: 'send-heartbeat' },
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
      expect(body.stepRuns[0].error).toContain('function invocation failed');
    });

    it('produces a safe failed run for a non-JSON-safe executor result', async () => {
      class FakeBlob {
        size = 0;
      }
      mockClient = buildMockSupabaseClient({
        signinShouldSucceed: true,
        functionResponse: { data: new FakeBlob(), error: null },
      });

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
        name: 'Invoke only',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'invoke_fn',
            type: 'invoke_function',
            configuration: { functionName: 'send-heartbeat' },
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
      expect(body.stepRuns[0].error).toContain('cannot be stored as JSON');
    });

    it('never exposes a filter value, function body, or raw SDK error in the response', async () => {
      mockClient = buildMockSupabaseClient({
        signinShouldSucceed: true,
        tableResponses: {
          update: {
            data: null,
            error: {
              message: 'row violates policy',
              details: 'Key (id)=(super-secret-filter-value) conflicts.',
              hint: '',
              code: '42501',
            },
          },
        },
      });

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
        name: 'Update only',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'update_row',
            type: 'update',
            configuration: {
              table: 'heartbeats',
              values: { active: false },
              filter: {
                column: 'id',
                operator: 'eq',
                value: 'super-secret-filter-value',
              },
            },
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      // The filter value legitimately appears in `inputSnapshot` (the
      // step's own persisted configuration, redacted only for
      // `signin.password` — see `execution-snapshot.ts`). What must never
      // leak is the raw PostgREST error text, and the filter value must
      // never appear inside the *error* fields specifically, which are
      // built entirely from step identity and a fixed sentence.
      const body = response.body as WorkflowRunResponseBody;
      expect(body.error).not.toContain('super-secret-filter-value');
      expect(body.error).not.toContain('row violates policy');
      expect(body.error).not.toContain('conflicts');
      expect(body.stepRuns[0].error).not.toContain('super-secret-filter-value');
      expect(body.stepRuns[0].error).not.toContain('row violates policy');
      expect(body.stepRuns[0].error).not.toContain('conflicts');
    });
  });

  describe('output references', () => {
    // Uses `read` (not `insert`) as the row-producing step: `insert`
    // never selects rows back (see `insert-step.executor.ts`), so it has
    // no output a later step could ever reference. `read` still chains
    // `.select()` and is the simplest step type with a referenceable
    // `rows` output.
    function signinReadDeleteSignoutWorkflow() {
      return {
        name: 'Cleanup flow',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        steps: [
          {
            stepKey: 'sign_in',
            type: 'signin',
            configuration: { email: 'a@example.com', password: TEST_PASSWORD },
          },
          {
            stepKey: 'find_record',
            type: 'read',
            configuration: { table: 'heartbeat_records', columns: '*' },
          },
          {
            stepKey: 'delete_record',
            type: 'delete',
            configuration: {
              table: 'heartbeat_records',
              filter: {
                column: 'id',
                operator: 'eq',
                value: '${steps.find_record.output.rows.0.id}',
              },
            },
          },
          { stepKey: 'sign_out', type: 'signout', configuration: {} },
        ],
      };
    }

    it('creates a workflow with signin/read/delete-referencing/signout, manual execution returns 201 and succeeds', async () => {
      mockClient = buildMockSupabaseClient({
        signinShouldSucceed: true,
        tableResponses: {
          read: {
            data: [{ id: 'found-row-id', name: 'Heartbeat' }],
            error: null,
          },
        },
      });
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
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        signinReadDeleteSignoutWorkflow(),
      );

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      expect(body.status).toBe('success');
      expect(body.stepRuns).toHaveLength(4);
    });

    it('delete receives the resolved ID from the earlier read', async () => {
      mockClient = buildMockSupabaseClient({
        signinShouldSucceed: true,
        tableResponses: {
          read: {
            data: [{ id: 'found-row-id', name: 'Heartbeat' }],
            error: null,
          },
        },
      });
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
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        signinReadDeleteSignoutWorkflow(),
      );

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      expect(mockClient.__mocks.deleteEq).toHaveBeenCalledWith(
        'id',
        'found-row-id',
      );
    });

    it('the resolved step-run snapshot contains the resolved ID, not the reference string', async () => {
      mockClient = buildMockSupabaseClient({
        signinShouldSucceed: true,
        tableResponses: {
          read: {
            data: [{ id: 'found-row-id', name: 'Heartbeat' }],
            error: null,
          },
        },
      });
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
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        signinReadDeleteSignoutWorkflow(),
      );

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      const deleteStepRun = body.stepRuns[2];
      const snapshot = deleteStepRun.inputSnapshot as {
        configuration: { filter: { value: string } };
      };
      expect(snapshot.configuration.filter.value).toBe('found-row-id');
    });

    it('the persisted workflow-step configuration still contains the reference string', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        signinReadDeleteSignoutWorkflow(),
      );

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const stepsResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/workflows/${workflow.id}/steps`)
        .set('Cookie', admin.cookie)
        .expect(200);
      const steps = stepsResponse.body as {
        stepKey: string;
        configuration: { filter?: { value: string } };
      }[];
      const deleteStep = steps.find((s) => s.stepKey === 'delete_record')!;
      expect(deleteStep.configuration.filter?.value).toBe(
        '${steps.find_record.output.rows.0.id}',
      );
    });

    it('returns a failed run when the runtime row path is missing', async () => {
      mockClient = buildMockSupabaseClient({
        signinShouldSucceed: true,
        tableResponses: { read: { data: [], error: null } },
      });
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
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        signinReadDeleteSignoutWorkflow(),
      );

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      expect(body.status).toBe('failed');
      expect(body.stepRuns[2].status).toBe('failed');
    });

    it('does not execute later steps after a missing runtime path failure', async () => {
      mockClient = buildMockSupabaseClient({
        signinShouldSucceed: true,
        tableResponses: { read: { data: [], error: null } },
      });
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
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        signinReadDeleteSignoutWorkflow(),
      );

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);

      const body = response.body as WorkflowRunResponseBody;
      // signin, read, and the failed delete — signout never attempted.
      expect(body.stepRuns).toHaveLength(3);
      expect(mockClient.auth.signOut).not.toHaveBeenCalled();
    });

    it('rejects a forward reference during workflow creation', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows`)
        .set('Cookie', admin.cookie)
        .send({
          name: 'Invalid forward reference',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
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
        })
        .expect(409);
    });

    it('rejects an unknown referenced key during workflow creation', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows`)
        .set('Cookie', admin.cookie)
        .send({
          name: 'Invalid unknown reference',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
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
        })
        .expect(409);
    });

    it('returns conflict when a reorder would break a reference', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(app, admin, projectId, {
        name: 'Reorder test',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
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
      const [createStep, deleteStep] = workflow.steps;

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/workflows/${workflow.id}/steps/order`)
        .set('Cookie', admin.cookie)
        .send({ stepIds: [deleteStep.id, createStep.id] })
        .expect(409);
    });

    it('returns conflict when deleting a referenced step', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(app, admin, projectId, {
        name: 'Deletion conflict test',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
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
      const [createStep] = workflow.steps;

      await request(app.getHttpServer())
        .delete(
          `/api/projects/${projectId}/workflows/${workflow.id}/steps/${createStep.id}`,
        )
        .set('Cookie', admin.cookie)
        .expect(409);
    });

    it('returns conflict when renaming a referenced key', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(app, admin, projectId, {
        name: 'Rename conflict test',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
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
      const [createStep] = workflow.steps;

      await request(app.getHttpServer())
        .patch(
          `/api/projects/${projectId}/workflows/${workflow.id}/steps/${createStep.id}`,
        )
        .set('Cookie', admin.cookie)
        .send({ stepKey: 'renamed_record' })
        .expect(409);
    });

    it('returns conflict when disabling a referenced step', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(app, admin, projectId, {
        name: 'Disable conflict test',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
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
      const [createStep] = workflow.steps;

      await request(app.getHttpServer())
        .patch(
          `/api/projects/${projectId}/workflows/${workflow.id}/steps/${createStep.id}`,
        )
        .set('Cookie', admin.cookie)
        .send({ enabled: false })
        .expect(409);
    });

    it('rejects partial interpolation during workflow creation', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows`)
        .set('Cookie', admin.cookie)
        .send({
          name: 'Partial interpolation test',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
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
        })
        .expect(409);
    });

    it('viewer behavior remains unchanged for workflows containing references', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const viewer = await createAndSignIn(
        app,
        `viewer-${crypto.randomUUID()}@example.com`,
        'viewer',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        signinReadDeleteSignoutWorkflow(),
      );

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', viewer.cookie)
        .expect(403);
    });

    it('ownership behavior remains unchanged for workflows containing references', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const otherAdmin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        signinReadDeleteSignoutWorkflow(),
      );

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', otherAdmin.cookie)
        .expect(404);
    });

    it('never exposes password/token/session values in reference-related errors', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const workflow = await createWorkflowAs(
        app,
        admin,
        projectId,
        signinReadDeleteSignoutWorkflow(),
      );

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows`)
        .set('Cookie', admin.cookie)
        .send({
          name: 'Should fail reference validation',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
          steps: [
            {
              stepKey: 'sign_in',
              type: 'signin',
              configuration: {
                email: 'a@example.com',
                password: TEST_PASSWORD,
              },
            },
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
        })
        .expect(409);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(TEST_PASSWORD);
      expect(serialized).not.toContain('mock-access-token-not-real');

      // Ensure the earlier valid workflow (created before the failed
      // attempt) still executes fine, confirming the failed attempt
      // above did not corrupt shared test state.
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflow.id}/runs`)
        .set('Cookie', admin.cookie)
        .expect(201);
    });

    it('documents the reference syntax in /api/openapi.json', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/openapi.json')
        .expect(200);
      const document = response.body as OpenAPIDocument;
      const serialized = JSON.stringify(document);

      expect(serialized).toContain('steps.<step_key>.output');
    });
  });
});
