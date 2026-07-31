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
    steps: [{ stepKey: 'wait-1', type: 'wait', configuration: { seconds: 5 } }],
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
        stepKey: 'step-2',
        type: 'wait',
        position: 1,
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
    expect(document.paths).toHaveProperty(
      '/api/projects/{projectId}/workflows/{workflowId}/steps',
    );
    expect(document.paths).toHaveProperty(
      '/api/projects/{projectId}/workflows/{workflowId}/steps/{stepId}',
    );
    expect(
      document.paths['/api/projects/{projectId}/workflows/{workflowId}/steps']
        .get,
    ).toBeDefined();
    expect(
      document.paths['/api/projects/{projectId}/workflows/{workflowId}/steps']
        .post,
    ).toBeDefined();
    expect(
      document.paths[
        '/api/projects/{projectId}/workflows/{workflowId}/steps/{stepId}'
      ].get,
    ).toBeDefined();
    expect(
      document.paths[
        '/api/projects/{projectId}/workflows/{workflowId}/steps/{stepId}'
      ].patch,
    ).toBeDefined();
    expect(
      document.paths[
        '/api/projects/{projectId}/workflows/{workflowId}/steps/{stepId}'
      ].delete,
    ).toBeDefined();
    expect(document.paths).toHaveProperty(
      '/api/projects/{projectId}/workflows/{workflowId}/steps/order',
    );
    expect(
      document.paths[
        '/api/projects/{projectId}/workflows/{workflowId}/steps/order'
      ].put,
    ).toBeDefined();
  });

  describe('transactional creation with steps', () => {
    it('creates a workflow with multiple steps in one request and returns them ordered', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows`)
        .set('Cookie', admin.cookie)
        .send({
          name: 'Multi-step workflow',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
          steps: [
            { stepKey: 'first', type: 'signin', configuration: {} },
            { stepKey: 'second', type: 'wait', configuration: { seconds: 1 } },
            { stepKey: 'third', type: 'signout', configuration: {} },
          ],
        })
        .expect(201);

      const body = response.body as {
        id: string;
        steps: { stepKey: string; position: number }[];
      };
      expect(body.steps.map((s) => [s.stepKey, s.position])).toEqual([
        ['first', 0],
        ['second', 1],
        ['third', 2],
      ]);

      const detailResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/workflows/${body.id}`)
        .set('Cookie', admin.cookie)
        .expect(200);
      expect((detailResponse.body as { steps: unknown[] }).steps).toHaveLength(
        3,
      );
    });

    it('rejects an empty steps array with 400', async () => {
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
          name: 'No steps',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
          steps: [],
        })
        .expect(400);
    });

    it('rejects duplicate stepKeys within the steps array with 400', async () => {
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
          name: 'Dup keys',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
          steps: [
            { stepKey: 'same', type: 'signin', configuration: {} },
            { stepKey: 'same', type: 'signout', configuration: {} },
          ],
        })
        .expect(400);
    });

    it('rejects a type/configuration mismatch within a step with 400', async () => {
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
          name: 'Bad config',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
          steps: [
            { stepKey: 'bad', type: 'wait', configuration: { table: 'x' } },
          ],
        })
        .expect(400);
    });

    it('rejects a client-supplied step position with 400', async () => {
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
          name: 'Client position',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
          steps: [
            {
              stepKey: 'first',
              type: 'signin',
              configuration: {},
              position: 5,
            },
          ],
        })
        .expect(400);
    });
  });

  describe('workflow steps management', () => {
    it('lets an admin append, read, update, and delete steps with ownership enforced', async () => {
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

      // Append a second step.
      const appendResponse = await request(app.getHttpServer())
        .post(`/api/projects/${projectAId}/workflows/${workflowId}/steps`)
        .set('Cookie', adminA.cookie)
        .send({ stepKey: 'second', type: 'signout', configuration: {} })
        .expect(201);
      const appended = appendResponse.body as { id: string; position: number };
      expect(appended.position).toBe(1);

      // List returns both steps ordered.
      const listResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectAId}/workflows/${workflowId}/steps`)
        .set('Cookie', adminA.cookie)
        .expect(200);
      expect(listResponse.body as unknown[]).toHaveLength(2);

      // Cross-owner access is 404.
      await request(app.getHttpServer())
        .get(`/api/projects/${projectAId}/workflows/${workflowId}/steps`)
        .set('Cookie', adminB.cookie)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/projects/${projectAId}/workflows/${workflowId}/steps`)
        .set('Cookie', adminB.cookie)
        .send({ stepKey: 'intruder', type: 'signin', configuration: {} })
        .expect(404);
      await request(app.getHttpServer())
        .get(
          `/api/projects/${projectBId}/workflows/${workflowId}/steps/${appended.id}`,
        )
        .set('Cookie', adminB.cookie)
        .expect(404);

      // Valid update.
      const updateResponse = await request(app.getHttpServer())
        .patch(
          `/api/projects/${projectAId}/workflows/${workflowId}/steps/${appended.id}`,
        )
        .set('Cookie', adminA.cookie)
        .send({ enabled: false })
        .expect(200);
      expect((updateResponse.body as { enabled: boolean }).enabled).toBe(false);

      // position field is rejected outright by the DTO's whitelist.
      await request(app.getHttpServer())
        .patch(
          `/api/projects/${projectAId}/workflows/${workflowId}/steps/${appended.id}`,
        )
        .set('Cookie', adminA.cookie)
        .send({ position: 9 })
        .expect(400);

      // Delete compacts remaining positions; deleting the last step is
      // rejected with 409.
      await request(app.getHttpServer())
        .delete(
          `/api/projects/${projectAId}/workflows/${workflowId}/steps/${appended.id}`,
        )
        .set('Cookie', adminA.cookie)
        .expect(204);

      const remainingResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectAId}/workflows/${workflowId}/steps`)
        .set('Cookie', adminA.cookie)
        .expect(200);
      const remaining = remainingResponse.body as {
        id: string;
        position: number;
      }[];
      expect(remaining).toHaveLength(1);
      expect(remaining[0].position).toBe(0);

      // Deleting the last remaining step is rejected.
      await request(app.getHttpServer())
        .delete(
          `/api/projects/${projectAId}/workflows/${workflowId}/steps/${remaining[0].id}`,
        )
        .set('Cookie', adminA.cookie)
        .expect(409);
    });

    it('lets a viewer read steps but not mutate them', async () => {
      const viewer = await createAndSignIn(
        app,
        `viewer-${crypto.randomUUID()}@example.com`,
        'viewer',
      );

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
      const [step] = await databaseService.db
        .insert(workflowSteps)
        .values({
          id: crypto.randomUUID(),
          workflowId: workflow.id,
          stepKey: 'seeded',
          type: 'wait',
          position: 0,
          configuration: { seconds: 1 },
        })
        .returning();

      await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/workflows/${workflow.id}/steps`)
        .set('Cookie', viewer.cookie)
        .expect(200);
      await request(app.getHttpServer())
        .get(
          `/api/projects/${project.id}/workflows/${workflow.id}/steps/${step.id}`,
        )
        .set('Cookie', viewer.cookie)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/workflows/${workflow.id}/steps`)
        .set('Cookie', viewer.cookie)
        .send({ stepKey: 'new', type: 'signin', configuration: {} })
        .expect(403);
      await request(app.getHttpServer())
        .patch(
          `/api/projects/${project.id}/workflows/${workflow.id}/steps/${step.id}`,
        )
        .set('Cookie', viewer.cookie)
        .send({ enabled: false })
        .expect(403);
      await request(app.getHttpServer())
        .delete(
          `/api/projects/${project.id}/workflows/${workflow.id}/steps/${step.id}`,
        )
        .set('Cookie', viewer.cookie)
        .expect(403);
    });

    it('rejects a duplicate stepKey on append with 409', async () => {
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
      const existingStepKey = validWorkflowInput.steps[0].stepKey;

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows/${workflowId}/steps`)
        .set('Cookie', admin.cookie)
        .send({ stepKey: existingStepKey, type: 'signin', configuration: {} })
        .expect(409);
    });
  });

  describe('workflow step reordering', () => {
    async function createWorkflowWithFourSteps(
      admin: SignedInUser,
      projectId: string,
    ): Promise<{ workflowId: string; stepIds: string[] }> {
      const createResponse = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/workflows`)
        .set('Cookie', admin.cookie)
        .send({
          name: 'Reorderable workflow',
          cronExpression: '0 * * * *',
          timezone: 'UTC',
          steps: [
            { stepKey: 'a', type: 'signin', configuration: {} },
            { stepKey: 'b', type: 'wait', configuration: { seconds: 1 } },
            { stepKey: 'c', type: 'wait', configuration: { seconds: 2 } },
            { stepKey: 'd', type: 'signout', configuration: {} },
          ],
        })
        .expect(201);
      const body = createResponse.body as {
        id: string;
        steps: { id: string }[];
      };
      return {
        workflowId: body.id,
        stepIds: body.steps.map((s) => s.id),
      };
    }

    it('rejects unauthenticated reorder requests', async () => {
      await request(app.getHttpServer())
        .put(
          '/api/projects/some-project-id/workflows/some-workflow-id/steps/order',
        )
        .send({ stepIds: ['a', 'b'] })
        .expect(401);
    });

    it('lets an admin create a workflow with steps and reorder them in one request', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const { workflowId, stepIds } = await createWorkflowWithFourSteps(
        admin,
        projectId,
      );
      const reversed = [...stepIds].reverse();

      const reorderResponse = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/workflows/${workflowId}/steps/order`)
        .set('Cookie', admin.cookie)
        .send({ stepIds: reversed })
        .expect(200);

      const reordered = reorderResponse.body as {
        id: string;
        position: number;
      }[];
      expect(reordered.map((s) => s.id)).toEqual(reversed);
      expect(reordered.map((s) => s.position)).toEqual([0, 1, 2, 3]);
    });

    it('reflects the new order in workflow detail and list-steps', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const { workflowId, stepIds } = await createWorkflowWithFourSteps(
        admin,
        projectId,
      );
      const reversed = [...stepIds].reverse();

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/workflows/${workflowId}/steps/order`)
        .set('Cookie', admin.cookie)
        .send({ stepIds: reversed })
        .expect(200);

      const detailResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/workflows/${workflowId}`)
        .set('Cookie', admin.cookie)
        .expect(200);
      expect(
        (detailResponse.body as { steps: { id: string }[] }).steps.map(
          (s) => s.id,
        ),
      ).toEqual(reversed);

      const listResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/workflows/${workflowId}/steps`)
        .set('Cookie', admin.cookie)
        .expect(200);
      expect((listResponse.body as { id: string }[]).map((s) => s.id)).toEqual(
        reversed,
      );
    });

    it('succeeds as a no-op when submitting the current order', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const { workflowId, stepIds } = await createWorkflowWithFourSteps(
        admin,
        projectId,
      );

      const response = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/workflows/${workflowId}/steps/order`)
        .set('Cookie', admin.cookie)
        .send({ stepIds })
        .expect(200);

      expect((response.body as { id: string }[]).map((s) => s.id)).toEqual(
        stepIds,
      );
    });

    it('rejects a reorder request missing a current step ID with 409', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const { workflowId, stepIds } = await createWorkflowWithFourSteps(
        admin,
        projectId,
      );

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/workflows/${workflowId}/steps/order`)
        .set('Cookie', admin.cookie)
        .send({ stepIds: stepIds.slice(0, 3) })
        .expect(409);
    });

    it('rejects a reorder request containing a foreign step ID with 409', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const { workflowId, stepIds } = await createWorkflowWithFourSteps(
        admin,
        projectId,
      );

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/workflows/${workflowId}/steps/order`)
        .set('Cookie', admin.cookie)
        .send({ stepIds: [...stepIds, crypto.randomUUID()] })
        .expect(409);
    });

    it('rejects a reorder request with a duplicate ID with 400', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const { workflowId, stepIds } = await createWorkflowWithFourSteps(
        admin,
        projectId,
      );

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/workflows/${workflowId}/steps/order`)
        .set('Cookie', admin.cookie)
        .send({ stepIds: [stepIds[0], stepIds[0], stepIds[2], stepIds[3]] })
        .expect(400);
    });

    it('rejects an empty stepIds array with 400', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const { workflowId } = await createWorkflowWithFourSteps(
        admin,
        projectId,
      );

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/workflows/${workflowId}/steps/order`)
        .set('Cookie', admin.cookie)
        .send({ stepIds: [] })
        .expect(400);
    });

    it('rejects unexpected body fields with 400', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const projectId = await createProjectAs(app, admin);
      const { workflowId, stepIds } = await createWorkflowWithFourSteps(
        admin,
        projectId,
      );

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/workflows/${workflowId}/steps/order`)
        .set('Cookie', admin.cookie)
        .send({ stepIds, positions: [0, 1, 2, 3] })
        .expect(400);
    });

    it('lets a viewer read the order but rejects a viewer reorder attempt with 403', async () => {
      const viewer = await createAndSignIn(
        app,
        `viewer-${crypto.randomUUID()}@example.com`,
        'viewer',
      );

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
      const [stepA] = await databaseService.db
        .insert(workflowSteps)
        .values({
          id: crypto.randomUUID(),
          workflowId: workflow.id,
          stepKey: 'a',
          type: 'wait',
          position: 0,
          configuration: { seconds: 1 },
        })
        .returning();
      const [stepB] = await databaseService.db
        .insert(workflowSteps)
        .values({
          id: crypto.randomUUID(),
          workflowId: workflow.id,
          stepKey: 'b',
          type: 'wait',
          position: 1,
          configuration: { seconds: 1 },
        })
        .returning();

      await request(app.getHttpServer())
        .put(`/api/projects/${project.id}/workflows/${workflow.id}/steps/order`)
        .set('Cookie', viewer.cookie)
        .send({ stepIds: [stepB.id, stepA.id] })
        .expect(403);
    });

    it('rejects reordering another owner workflow with 404', async () => {
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
      const { workflowId, stepIds } = await createWorkflowWithFourSteps(
        adminA,
        projectAId,
      );

      await request(app.getHttpServer())
        .put(`/api/projects/${projectAId}/workflows/${workflowId}/steps/order`)
        .set('Cookie', adminB.cookie)
        .send({ stepIds: [...stepIds].reverse() })
        .expect(404);

      // Confirm the order is unaffected by the rejected attempt.
      const listResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectAId}/workflows/${workflowId}/steps`)
        .set('Cookie', adminA.cookie)
        .expect(200);
      expect((listResponse.body as { id: string }[]).map((s) => s.id)).toEqual(
        stepIds,
      );
    });
  });
});
