import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { AuthService } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import {
  projects,
  workflows,
  workflowSteps,
  workflowRuns,
  stepRuns,
} from './../src/database/schema';
import { setupSwagger } from './../src/lib/swagger/swagger.config';
import type { Auth } from './../src/modules/auth/auth.config';
import type { ApplicationRole } from './../src/modules/auth/auth.types';

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

interface WorkflowResponseBody {
  id: string;
  projectId: string;
  name: string;
}

const TEST_PASSWORD = 'correct-horse-battery-staple';

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

describe('Workflows API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  const validWorkflowInput = {
    name: 'Nightly heartbeat',
    cronExpression: '0 */6 * * *',
    timezone: 'UTC',
  };

  it('rejects unauthenticated requests to every workflow endpoint', async () => {
    const projectId = 'some-project-id';
    const workflowId = 'some-workflow-id';

    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/workflows`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows`)
      .send(validWorkflowInput)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/workflows/${workflowId}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}/workflows/${workflowId}`)
      .send({ name: 'X' })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/workflows/${workflowId}`)
      .expect(401);
  });

  it('lets admin A create a workflow under their project and list/read it', async () => {
    const adminA = await createAndSignIn(
      app,
      `admin-a-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, adminA);

    const createResponse = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows`)
      .set('Cookie', adminA.cookie)
      .send(validWorkflowInput)
      .expect(201);
    const created = createResponse.body as WorkflowResponseBody;

    expect(created.projectId).toBe(projectId);
    expect(created).not.toHaveProperty('project_id');

    const listResponse = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/workflows`)
      .set('Cookie', adminA.cookie)
      .expect(200);
    expect(listResponse.body as WorkflowResponseBody[]).toHaveLength(1);

    const readResponse = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/workflows/${created.id}`)
      .set('Cookie', adminA.cookie)
      .expect(200);
    expect((readResponse.body as WorkflowResponseBody).id).toBe(created.id);
  });

  it('isolates admin B from admin A workflows: list, create, read, update, delete, mismatched IDs', async () => {
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
    const projectBId = await createProjectAs(app, adminB, 'Project B');

    const createResponse = await request(app.getHttpServer())
      .post(`/api/projects/${projectAId}/workflows`)
      .set('Cookie', adminA.cookie)
      .send(validWorkflowInput)
      .expect(201);
    const workflowId = (createResponse.body as WorkflowResponseBody).id;

    // admin B cannot list workflows under admin A's project.
    await request(app.getHttpServer())
      .get(`/api/projects/${projectAId}/workflows`)
      .set('Cookie', adminB.cookie)
      .expect(404);

    // admin B cannot create under admin A's project.
    await request(app.getHttpServer())
      .post(`/api/projects/${projectAId}/workflows`)
      .set('Cookie', adminB.cookie)
      .send(validWorkflowInput)
      .expect(404);

    // admin B cannot read admin A's workflow.
    await request(app.getHttpServer())
      .get(`/api/projects/${projectAId}/workflows/${workflowId}`)
      .set('Cookie', adminB.cookie)
      .expect(404);

    // admin B cannot update admin A's workflow.
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectAId}/workflows/${workflowId}`)
      .set('Cookie', adminB.cookie)
      .send({ name: 'Hijacked' })
      .expect(404);

    // admin B cannot delete admin A's workflow.
    await request(app.getHttpServer())
      .delete(`/api/projects/${projectAId}/workflows/${workflowId}`)
      .set('Cookie', adminB.cookie)
      .expect(404);

    // admin B cannot use one of their own project IDs with admin A's workflow ID.
    await request(app.getHttpServer())
      .get(`/api/projects/${projectBId}/workflows/${workflowId}`)
      .set('Cookie', adminB.cookie)
      .expect(404);

    // Confirm admin A's workflow is untouched.
    const stillThere = await request(app.getHttpServer())
      .get(`/api/projects/${projectAId}/workflows/${workflowId}`)
      .set('Cookie', adminA.cookie)
      .expect(200);
    expect((stillThere.body as WorkflowResponseBody).name).toBe(
      validWorkflowInput.name,
    );
  });

  it('lets a viewer list and read workflows in their own project but not mutate them', async () => {
    const viewer = await createAndSignIn(
      app,
      `viewer-${crypto.randomUUID()}@example.com`,
      'viewer',
    );

    // Seed a project owned by the viewer directly (viewers cannot create
    // projects), then a workflow under it.
    const databaseService = app.get(DatabaseService);
    const [project] = await databaseService.db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        ownerId: viewer.userId,
        name: 'Viewer Project',
        supabaseUrl: 'https://viewer.supabase.co',
        publishableKey: 'sb_publishable_viewer',
      })
      .returning();
    const [workflow] = await databaseService.db
      .insert(workflows)
      .values({
        id: crypto.randomUUID(),
        projectId: project.id,
        name: 'Viewer Workflow',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
      })
      .returning();

    const listResponse = await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/workflows`)
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(listResponse.body as WorkflowResponseBody[]).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/workflows/${workflow.id}`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/projects/${project.id}/workflows`)
      .set('Cookie', viewer.cookie)
      .send(validWorkflowInput)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/projects/${project.id}/workflows/${workflow.id}`)
      .set('Cookie', viewer.cookie)
      .send({ name: 'Nope' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/projects/${project.id}/workflows/${workflow.id}`)
      .set('Cookie', viewer.cookie)
      .expect(403);
  });

  it('rejects a malformed cron expression with 400', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows`)
      .set('Cookie', admin.cookie)
      .send({ ...validWorkflowInput, cronExpression: 'not a cron' })
      .expect(400);
  });

  it('rejects an invalid time zone with 400', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows`)
      .set('Cookie', admin.cookie)
      .send({ ...validWorkflowInput, timezone: 'EST' })
      .expect(400);
  });

  it('rejects unexpected body fields with 400', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows`)
      .set('Cookie', admin.cookie)
      .send({ ...validWorkflowInput, projectId: 'someone-else' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows`)
      .set('Cookie', admin.cookie)
      .send({ ...validWorkflowInput, ownerId: 'someone-else' })
      .expect(400);
  });

  it('rejects an empty patch body with 400', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const createResponse = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows`)
      .set('Cookie', admin.cookie)
      .send(validWorkflowInput)
      .expect(201);
    const workflowId = (createResponse.body as WorkflowResponseBody).id;

    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}/workflows/${workflowId}`)
      .set('Cookie', admin.cookie)
      .send({})
      .expect(400);
  });

  it('deletes a workflow with 204 and cascades to descendants', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );
    const projectId = await createProjectAs(app, admin);
    const createResponse = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/workflows`)
      .set('Cookie', admin.cookie)
      .send(validWorkflowInput)
      .expect(201);
    const workflowId = (createResponse.body as WorkflowResponseBody).id;

    const databaseService = app.get(DatabaseService);
    const [step] = await databaseService.db
      .insert(workflowSteps)
      .values({
        id: crypto.randomUUID(),
        workflowId,
        stepKey: 'step-1',
        type: 'wait',
        position: 0,
        configuration: {},
      })
      .returning();
    const [run] = await databaseService.db
      .insert(workflowRuns)
      .values({
        id: crypto.randomUUID(),
        workflowId,
        triggerType: 'manual',
        status: 'pending',
      })
      .returning();
    await databaseService.db.insert(stepRuns).values({
      id: crypto.randomUUID(),
      workflowRunId: run.id,
      workflowStepId: step.id,
      position: 0,
      status: 'pending',
    });

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/workflows/${workflowId}`)
      .set('Cookie', admin.cookie)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/workflows/${workflowId}`)
      .set('Cookie', admin.cookie)
      .expect(404);

    expect(
      await databaseService.db
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, workflowId)),
    ).toHaveLength(0);
    expect(
      await databaseService.db
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.workflowId, workflowId)),
    ).toHaveLength(0);
  });

  it('includes every Workflows operation in the merged OpenAPI document', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;

    expect(document.paths).toHaveProperty(
      '/api/projects/{projectId}/workflows',
    );
    expect(document.paths).toHaveProperty(
      '/api/projects/{projectId}/workflows/{workflowId}',
    );
    expect(
      document.paths['/api/projects/{projectId}/workflows'].get,
    ).toBeDefined();
    expect(
      document.paths['/api/projects/{projectId}/workflows'].post,
    ).toBeDefined();
    expect(
      document.paths['/api/projects/{projectId}/workflows/{workflowId}'].get,
    ).toBeDefined();
    expect(
      document.paths['/api/projects/{projectId}/workflows/{workflowId}'].patch,
    ).toBeDefined();
    expect(
      document.paths['/api/projects/{projectId}/workflows/{workflowId}'].delete,
    ).toBeDefined();
  });
});
