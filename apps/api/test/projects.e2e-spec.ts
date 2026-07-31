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
import { projects, workflows } from './../src/database/schema';
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
  ownerId: string;
  name: string;
}

const TEST_PASSWORD = 'correct-horse-battery-staple';

/**
 * Creates a user through Better Auth's server-side admin API (public
 * signup is disabled — see FirstAdminBootstrapService and
 * emailAndPassword.disableSignUp) and signs in over real HTTP to obtain a
 * real session cookie, exactly as an admin-created account would
 * authenticate in production.
 */
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

describe('Projects API (e2e)', () => {
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

    // DatabaseService only opens the connection; migrations are never run
    // automatically (see AGENTS.md), so the in-memory database used here
    // needs them applied explicitly, same as the schema unit tests.
    const databaseService = app.get(DatabaseService);
    migrate(databaseService.db, {
      migrationsFolder: join(process.cwd(), 'drizzle'),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const validProjectInput = {
    name: 'Production Project',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_examplekey',
  };

  it('rejects unauthenticated requests to every project endpoint', async () => {
    await request(app.getHttpServer()).get('/api/projects').expect(401);
    await request(app.getHttpServer())
      .post('/api/projects')
      .send(validProjectInput)
      .expect(401);
    await request(app.getHttpServer()).get('/api/projects/some-id').expect(401);
    await request(app.getHttpServer())
      .patch('/api/projects/some-id')
      .send({ name: 'X' })
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/projects/some-id')
      .expect(401);
  });

  it('lets admin A create a project and see it in their own list', async () => {
    const adminA = await createAndSignIn(
      app,
      `admin-a-${crypto.randomUUID()}@example.com`,
      'admin',
    );

    const createResponse = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', adminA.cookie)
      .send(validProjectInput)
      .expect(201);
    const created = createResponse.body as ProjectResponseBody;

    expect(created.ownerId).toBe(adminA.userId);
    expect(created).not.toHaveProperty('owner_id');

    const listResponse = await request(app.getHttpServer())
      .get('/api/projects')
      .set('Cookie', adminA.cookie)
      .expect(200);
    const list = listResponse.body as ProjectResponseBody[];

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);
  });

  it('isolates admin B from admin A projects: list, read, update, delete', async () => {
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

    const createResponse = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', adminA.cookie)
      .send(validProjectInput)
      .expect(201);
    const projectId = (createResponse.body as ProjectResponseBody).id;

    const listResponse = await request(app.getHttpServer())
      .get('/api/projects')
      .set('Cookie', adminB.cookie)
      .expect(200);
    expect(listResponse.body as ProjectResponseBody[]).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`)
      .set('Cookie', adminB.cookie)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}`)
      .set('Cookie', adminB.cookie)
      .send({ name: 'Hijacked' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}`)
      .set('Cookie', adminB.cookie)
      .expect(404);

    // Confirm admin A's project and its original name are untouched.
    const stillThere = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`)
      .set('Cookie', adminA.cookie)
      .expect(200);
    expect((stillThere.body as ProjectResponseBody).name).toBe(
      validProjectInput.name,
    );
  });

  it('lets a viewer list and read their own project but not mutate it', async () => {
    const viewer = await createAndSignIn(
      app,
      `viewer-${crypto.randomUUID()}@example.com`,
      'viewer',
    );

    // Seed a project owned by the viewer directly (viewers cannot create).
    const databaseService = app.get(DatabaseService);
    const [seeded] = await databaseService.db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        ownerId: viewer.userId,
        name: 'Viewer Project',
        supabaseUrl: 'https://viewer.supabase.co',
        publishableKey: 'sb_publishable_viewer',
      })
      .returning();

    const listResponse = await request(app.getHttpServer())
      .get('/api/projects')
      .set('Cookie', viewer.cookie)
      .expect(200);
    const list = listResponse.body as ProjectResponseBody[];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(seeded.id);

    await request(app.getHttpServer())
      .get(`/api/projects/${seeded.id}`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', viewer.cookie)
      .send(validProjectInput)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/projects/${seeded.id}`)
      .set('Cookie', viewer.cookie)
      .send({ name: 'Nope' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/projects/${seeded.id}`)
      .set('Cookie', viewer.cookie)
      .expect(403);
  });

  it('deletes a project and its cascaded children', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );

    const createResponse = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', admin.cookie)
      .send(validProjectInput)
      .expect(201);
    const projectId = (createResponse.body as ProjectResponseBody).id;

    const databaseService = app.get(DatabaseService);
    await databaseService.db.insert(workflows).values({
      id: crypto.randomUUID(),
      projectId,
      name: 'Workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
    });

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}`)
      .set('Cookie', admin.cookie)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`)
      .set('Cookie', admin.cookie)
      .expect(404);

    const remainingWorkflows = await databaseService.db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, projectId));
    expect(remainingWorkflows).toHaveLength(0);
  });

  it('rejects invalid input at the HTTP boundary with 400', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );

    await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', admin.cookie)
      .send({ name: '', supabaseUrl: 'not-a-url', publishableKey: '' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', admin.cookie)
      .send({ ...validProjectInput, ownerId: 'someone-else' })
      .expect(400);
  });

  it('rejects an empty update body with 400', async () => {
    const admin = await createAndSignIn(
      app,
      `admin-${crypto.randomUUID()}@example.com`,
      'admin',
    );

    const createResponse = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Cookie', admin.cookie)
      .send(validProjectInput)
      .expect(201);
    const projectId = (createResponse.body as ProjectResponseBody).id;

    await request(app.getHttpServer())
      .patch(`/api/projects/${projectId}`)
      .set('Cookie', admin.cookie)
      .send({})
      .expect(400);
  });

  it('lists Projects endpoints in the merged OpenAPI document', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    const document = response.body as OpenAPIDocument;

    expect(document.paths).toHaveProperty('/api/projects');
    expect(document.paths).toHaveProperty('/api/projects/{projectId}');
    expect(document.paths['/api/projects'].get).toBeDefined();
    expect(document.paths['/api/projects'].post).toBeDefined();
    expect(document.paths['/api/projects/{projectId}'].get).toBeDefined();
    expect(document.paths['/api/projects/{projectId}'].patch).toBeDefined();
    expect(document.paths['/api/projects/{projectId}'].delete).toBeDefined();
  });
});
