import { join } from 'path';
import { jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { AuthService } from '@thallesp/nestjs-better-auth';
import * as schema from '../../database/schema';
import type { AppDatabase } from '../../database/database.types';
import { DatabaseService } from '../../database/database.service';
import { createAuth, type Auth } from './auth.config';
import { FirstAdminBootstrapService } from './first-admin-bootstrap.service';

function buildAuthService(auth: Auth): AuthService<Auth> {
  return new AuthService<Auth>({ auth });
}

function createTestDb(): { db: AppDatabase; connection: Database.Database } {
  const connection = new Database(':memory:');
  connection.pragma('foreign_keys = ON');

  const db = drizzle(connection, { schema }) as AppDatabase;
  migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });

  return { db, connection };
}

function buildDatabaseServiceStub(db: AppDatabase): DatabaseService {
  return { db } as unknown as DatabaseService;
}

async function seedUser(
  db: AppDatabase,
  overrides: Partial<schema.NewUser> = {},
) {
  const [user] = await db
    .insert(schema.users)
    .values({
      id: crypto.randomUUID(),
      name: 'Seed User',
      email: `${crypto.randomUUID()}@example.com`,
      emailVerified: false,
      ...overrides,
    })
    .returning();
  return user;
}

describe('FirstAdminBootstrapService', () => {
  let db: AppDatabase;
  let connection: Database.Database;
  let auth: Auth;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.BETTER_AUTH_SECRET =
      'test-only-secret-not-for-any-real-use-32c';
    ({ db, connection } = createTestDb());
    auth = createAuth(db);
  });

  afterEach(() => {
    connection.close();
    process.env = { ...originalEnv };
  });

  function buildService(): FirstAdminBootstrapService {
    return new FirstAdminBootstrapService(
      buildDatabaseServiceStub(db),
      buildAuthService(auth),
    );
  }

  it('performs no creation when bootstrap is not configured', async () => {
    delete process.env.FIRST_ADMIN_EMAIL;
    delete process.env.FIRST_ADMIN_PASSWORD;

    await buildService().onApplicationBootstrap();

    const allUsers = await db.select().from(schema.users);
    expect(allUsers).toHaveLength(0);
  });

  it('creates exactly one administrator when none exists and the email is unused', async () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';
    process.env.FIRST_ADMIN_NAME = 'Root Admin';

    await buildService().onApplicationBootstrap();

    const allUsers = await db.select().from(schema.users);
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0].email).toBe('admin@example.com');
    expect(allUsers[0].name).toBe('Root Admin');
    expect(allUsers[0].role).toBe('admin');
  });

  it('does not create a session during bootstrap', async () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';

    await buildService().onApplicationBootstrap();

    const sessions = await db.select().from(schema.sessions);
    expect(sessions).toHaveLength(0);
  });

  it('creates a valid password credential the administrator can sign in with', async () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';

    await buildService().onApplicationBootstrap();

    const signInResult = await auth.api.signInEmail({
      body: { email: 'admin@example.com', password: 'test-only-password-123' },
    });

    expect(signInResult.user.email).toBe('admin@example.com');
  });

  it('skips cleanly when an administrator already exists', async () => {
    await seedUser(db, { role: 'admin', email: 'existing-admin@example.com' });
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';

    await buildService().onApplicationBootstrap();

    const allUsers = await db.select().from(schema.users);
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0].email).toBe('existing-admin@example.com');
  });

  it('does not create a duplicate user on a second run (restart) with the same config', async () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';

    await buildService().onApplicationBootstrap();
    await buildService().onApplicationBootstrap();

    const allUsers = await db.select().from(schema.users);
    expect(allUsers).toHaveLength(1);
  });

  it('skips cleanly when the configured email already belongs to an admin', async () => {
    await seedUser(db, { role: 'admin', email: 'admin@example.com' });
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';

    await buildService().onApplicationBootstrap();

    const allUsers = await db.select().from(schema.users);
    expect(allUsers).toHaveLength(1);
  });

  it('fails when the configured email belongs to an existing non-admin user', async () => {
    await seedUser(db, { role: 'viewer', email: 'admin@example.com' });
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';

    await expect(buildService().onApplicationBootstrap()).rejects.toThrow();

    const [viewer] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@example.com'));
    expect(viewer?.role).toBe('viewer');
    const allUsers = await db.select().from(schema.users);
    expect(allUsers).toHaveLength(1);
  });

  it('fails when the database schema is not migrated', async () => {
    const unmigratedConnection = new Database(':memory:');
    const unmigratedDb = drizzle(unmigratedConnection, {
      schema,
    }) as AppDatabase;
    const unmigratedAuth = createAuth(unmigratedDb);
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';

    const service = new FirstAdminBootstrapService(
      buildDatabaseServiceStub(unmigratedDb),
      buildAuthService(unmigratedAuth),
    );

    await expect(service.onApplicationBootstrap()).rejects.toThrow(/migrat/i);

    unmigratedConnection.close();
  });

  it('never logs the configured password', async () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';
    const logSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await buildService().onApplicationBootstrap();

    const loggedOutput = logSpy.mock.calls
      .map((call) => String(call[0]))
      .join('\n');
    expect(loggedOutput).not.toContain('test-only-password-123');

    logSpy.mockRestore();
  });

  it('rejects application startup when Better Auth user creation fails unexpectedly', async () => {
    process.env.FIRST_ADMIN_EMAIL = 'admin@example.com';
    process.env.FIRST_ADMIN_PASSWORD = 'test-only-password-123';
    const failingAuthService = {
      api: {
        createUser: () => {
          throw new Error('simulated Better Auth failure');
        },
      },
      instance: auth,
    } as unknown as AuthService<Auth>;

    const service = new FirstAdminBootstrapService(
      buildDatabaseServiceStub(db),
      failingAuthService,
    );

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      /simulated Better Auth failure/,
    );
  });
});
