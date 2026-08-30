import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../database/schema';
import { createAuth } from './auth.config';
import { adminRole, viewerRole } from './auth.permissions';
import { APPLICATION_ROLES, DEFAULT_APPLICATION_ROLE } from './auth.types';

describe('createAuth', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.BETTER_AUTH_URL = 'http://localhost:7854';
    process.env.BETTER_AUTH_SECRET =
      'test-only-secret-not-for-any-real-use-32c';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function buildAuth() {
    const connection = new Database(':memory:');
    const db = drizzle(connection, { schema });
    return createAuth(db);
  }

  it('initializes with the Drizzle adapter against a real SQLite connection', () => {
    expect(() => buildAuth()).not.toThrow();
  });

  it('enables email and password authentication', () => {
    const auth = buildAuth();

    expect(auth.options.emailAndPassword?.enabled).toBe(true);
  });

  it('disables public email/password sign-up', () => {
    const auth = buildAuth();

    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
  });

  it('uses /api/auth as its base path', () => {
    const auth = buildAuth();

    expect(auth.options.basePath).toBe('/api/auth');
  });

  it('fails clearly when BETTER_AUTH_SECRET is missing', () => {
    delete process.env.BETTER_AUTH_SECRET;

    expect(() => buildAuth()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('fails clearly when BETTER_AUTH_SECRET is too short', () => {
    process.env.BETTER_AUTH_SECRET = 'too-short';

    expect(() => buildAuth()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('fails clearly when BETTER_AUTH_URL is missing', () => {
    delete process.env.BETTER_AUTH_URL;

    expect(() => buildAuth()).toThrow(/BETTER_AUTH_URL/);
  });
});

describe('application roles', () => {
  it('defines exactly admin and viewer', () => {
    expect(APPLICATION_ROLES).toEqual(['admin', 'viewer']);
  });

  it('uses viewer as the default role', () => {
    expect(DEFAULT_APPLICATION_ROLE).toBe('viewer');
  });

  it('grants admin every declared application permission', () => {
    expect(
      adminRole.authorize({
        project: ['create', 'read', 'update', 'delete'],
        workflow: ['create', 'read', 'update', 'delete', 'execute'],
        execution: ['read', 'delete'],
      }),
    ).toEqual({ success: true });
  });

  it('grants admin the full admin-plugin user-management action set, including set-role', () => {
    // These are the admin plugin's own action names (defaultStatements),
    // not application-defined ones. `set-role` in particular is what
    // /admin/create-user needs to assign a role when an admin creates a
    // new account.
    expect(
      adminRole.authorize({
        user: [
          'create',
          'list',
          'set-role',
          'ban',
          'impersonate',
          'delete',
          'set-password',
          'set-email',
          'get',
          'update',
        ],
      }),
    ).toEqual({ success: true });
  });

  it('grants viewer only read permissions', () => {
    expect(
      viewerRole.authorize({
        project: ['read'],
        workflow: ['read'],
        execution: ['read'],
      }),
    ).toEqual({ success: true });
  });

  it('does not grant viewer write permissions', () => {
    expect(viewerRole.authorize({ project: ['create'] }).success).toBe(false);
    expect(viewerRole.authorize({ workflow: ['delete'] }).success).toBe(false);
    expect(viewerRole.authorize({ execution: ['delete'] }).success).toBe(false);
  });

  it('does not grant viewer any user-management permissions', () => {
    expect(
      viewerRole.authorize({ user: ['create', 'set-role', 'update'] }).success,
    ).toBe(false);
  });
});
