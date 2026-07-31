import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { projects, users, workflows } from './../src/database/schema';
import { setupSwagger } from './../src/lib/swagger/swagger.config';

interface OpenAPIDocument {
  paths: Record<string, Record<string, unknown>>;
}

interface SignedUpUser {
  cookie: string;
  userId: string;
}

interface ProjectResponseBody {
  id: string;
  ownerId: string;
  name: string;
}

async function signUp(
  app: INestApplication<App>,
  email: string,
): Promise<SignedUpUser> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/sign-up/email')
    .send({
      email,
      password: 'correct-horse-battery-staple',
      name: 'Test User',
    })
    .expect(200);

  const setCookieHeader = response.headers['set-cookie'] as unknown as
    string[] | undefined;
  if (!setCookieHeader || setCookieHeader.length === 0) {
    throw new Error('Sign-up response did not include a session cookie.');
  }

  const userId = (response.body as { user: { id: string } }).user.id;

  return { cookie: setCookieHeader[0], userId };
}

async function promoteToAdmin(
  app: INestApplication<App>,
  userId: string,
): Promise<void> {
  const databaseService = app.get(DatabaseService);
  await databaseService.db
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.id, userId));
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
    const adminA = await signUp(
      app,
      `admin-a-${crypto.randomUUID()}@example.com`,
    );
    await promoteToAdmin(app, adminA.userId);

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
    const adminA = await signUp(
      app,
      `admin-a-${crypto.randomUUID()}@example.com`,
    );
    await promoteToAdmin(app, adminA.userId);
    const adminB = await signUp(
      app,
      `admin-b-${crypto.randomUUID()}@example.com`,
    );
    await promoteToAdmin(app, adminB.userId);

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
    const viewer = await signUp(
      app,
      `viewer-${crypto.randomUUID()}@example.com`,
    );
    const admin = await signUp(app, `admin-${crypto.randomUUID()}@example.com`);
    await promoteToAdmin(app, admin.userId);

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
    const admin = await signUp(app, `admin-${crypto.randomUUID()}@example.com`);
    await promoteToAdmin(app, admin.userId);

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
    const admin = await signUp(app, `admin-${crypto.randomUUID()}@example.com`);
    await promoteToAdmin(app, admin.userId);

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
    const admin = await signUp(app, `admin-${crypto.randomUUID()}@example.com`);
    await promoteToAdmin(app, admin.userId);

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
