import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { AuthService } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { users } from './../src/database/schema';
import type { Auth } from './../src/modules/auth/auth.config';
import type { ApplicationRole } from './../src/modules/auth/auth.types';

interface SignedInUser {
  cookie: string;
  userId: string;
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

describe('Public signup lockdown and admin user creation (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const databaseService = app.get(DatabaseService);
    migrate(databaseService.db, {
      migrationsFolder: join(process.cwd(), 'drizzle'),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('public signup', () => {
    it('cannot create a user through the public sign-up endpoint', async () => {
      const email = `blocked-${crypto.randomUUID()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .send({ email, password: TEST_PASSWORD, name: 'Blocked User' })
        .expect(400);

      expect(response.body).toMatchObject({
        code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
      });
    });

    it('does not create the attempted account in the users table', async () => {
      const email = `blocked-${crypto.randomUUID()}@example.com`;

      await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .send({ email, password: TEST_PASSWORD, name: 'Blocked User' })
        .expect(400);

      const databaseService = app.get(DatabaseService);
      const rows = await databaseService.db
        .select()
        .from(users)
        .where(eq(users.email, email));
      expect(rows).toHaveLength(0);
    });

    it('leaves sign-in functional for an account created through the admin API', async () => {
      const email = `functional-${crypto.randomUUID()}@example.com`;
      await createAndSignIn(app, email, 'viewer');

      const signInResponse = await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD })
        .expect(200);

      expect(
        (signInResponse.body as { user: { email: string } }).user.email,
      ).toBe(email);
    });
  });

  describe('admin-plugin user creation', () => {
    it('rejects an unauthenticated request to create a user via HTTP', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/admin/create-user')
        .send({
          email: `unauth-${crypto.randomUUID()}@example.com`,
          password: TEST_PASSWORD,
          name: 'Unauthenticated Attempt',
          role: 'viewer',
        })
        .expect(401);
    });

    it('rejects a viewer request to create a user', async () => {
      const viewer = await createAndSignIn(
        app,
        `viewer-${crypto.randomUUID()}@example.com`,
        'viewer',
      );

      await request(app.getHttpServer())
        .post('/api/auth/admin/create-user')
        .set('Cookie', viewer.cookie)
        .send({
          email: `viewer-created-${crypto.randomUUID()}@example.com`,
          password: TEST_PASSWORD,
          name: 'Viewer Attempt',
          role: 'viewer',
        })
        .expect(403);
    });

    it('lets an administrator create a viewer account', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const newViewerEmail = `new-viewer-${crypto.randomUUID()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/auth/admin/create-user')
        .set('Cookie', admin.cookie)
        .send({
          email: newViewerEmail,
          password: TEST_PASSWORD,
          name: 'New Viewer',
          role: 'viewer',
        })
        .expect(200);

      expect(
        (response.body as { user: { email: string; role: string } }).user.role,
      ).toBe('viewer');

      const signInResponse = await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .send({ email: newViewerEmail, password: TEST_PASSWORD })
        .expect(200);
      expect(
        (signInResponse.body as { user: { email: string } }).user.email,
      ).toBe(newViewerEmail);
    });

    it('lets an administrator create another administrator', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const newAdminEmail = `new-admin-${crypto.randomUUID()}@example.com`;

      const response = await request(app.getHttpServer())
        .post('/api/auth/admin/create-user')
        .set('Cookie', admin.cookie)
        .send({
          email: newAdminEmail,
          password: TEST_PASSWORD,
          name: 'New Admin',
          role: 'admin',
        })
        .expect(200);

      expect((response.body as { user: { role: string } }).user.role).toBe(
        'admin',
      );
    });

    it('rejects an unsupported role', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );

      await request(app.getHttpServer())
        .post('/api/auth/admin/create-user')
        .set('Cookie', admin.cookie)
        .send({
          email: `bad-role-${crypto.randomUUID()}@example.com`,
          password: TEST_PASSWORD,
          name: 'Bad Role',
          role: 'user',
        })
        .expect(400);
    });

    it('created viewer cannot create projects', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      const newViewerEmail = `new-viewer-${crypto.randomUUID()}@example.com`;
      await request(app.getHttpServer())
        .post('/api/auth/admin/create-user')
        .set('Cookie', admin.cookie)
        .send({
          email: newViewerEmail,
          password: TEST_PASSWORD,
          name: 'New Viewer',
          role: 'viewer',
        })
        .expect(200);

      const signInResponse = await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .send({ email: newViewerEmail, password: TEST_PASSWORD })
        .expect(200);
      const setCookieHeader = signInResponse.headers[
        'set-cookie'
      ] as unknown as string[] | undefined;
      const viewerCookie = setCookieHeader?.[0];

      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Cookie', viewerCookie ?? '')
        .send({
          name: 'Should Not Be Created',
          supabaseUrl: 'https://example.supabase.co',
          publishableKey: 'sb_publishable_example',
        })
        .expect(403);
    });

    it('public signup remains disabled after admin-created users exist', async () => {
      const admin = await createAndSignIn(
        app,
        `admin-${crypto.randomUUID()}@example.com`,
        'admin',
      );
      await request(app.getHttpServer())
        .post('/api/auth/admin/create-user')
        .set('Cookie', admin.cookie)
        .send({
          email: `another-${crypto.randomUUID()}@example.com`,
          password: TEST_PASSWORD,
          name: 'Another User',
          role: 'viewer',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .send({
          email: `still-blocked-${crypto.randomUUID()}@example.com`,
          password: TEST_PASSWORD,
          name: 'Still Blocked',
        })
        .expect(400);
    });
  });
});
