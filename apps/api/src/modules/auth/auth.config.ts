import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { openAPI } from 'better-auth/plugins';
import * as schema from '../../database/schema';
import type { AppDatabase } from '../../database/database.types';
import { accessControl, roles } from './auth.permissions';
import { DEFAULT_APPLICATION_ROLE } from './auth.types';

function getRequiredSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'BETTER_AUTH_SECRET must be set to a high-entropy string of at least ' +
        '32 characters. See apps/api/.env.example.',
    );
  }

  return secret;
}

function getBaseUrl(): string {
  const baseUrl = process.env.BETTER_AUTH_URL;

  if (!baseUrl) {
    throw new Error(
      'BETTER_AUTH_URL must be set (e.g. http://localhost:3000). See ' +
        'apps/api/.env.example.',
    );
  }

  return baseUrl;
}

export function createAuth(db: AppDatabase) {
  return betterAuth({
    appName: 'Supabase Heartbeat',
    baseURL: getBaseUrl(),
    basePath: '/api/auth',
    secret: getRequiredSecret(),
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
      usePlural: true,
    }),
    emailAndPassword: {
      enabled: true,
      // Public account creation is disabled; the first administrator is
      // bootstrapped from environment configuration (see
      // FirstAdminBootstrapService), and every subsequent account is
      // created by an authenticated administrator through the admin
      // plugin's own user-creation endpoint. Sign-in is unaffected.
      disableSignUp: true,
    },
    plugins: [
      admin({
        ac: accessControl,
        roles,
        defaultRole: DEFAULT_APPLICATION_ROLE,
      }),
      // Only the OpenAPI schema endpoint is used (merged into /api/openapi.json
      // by src/lib/swagger/swagger.config.ts); the plugin's own Scalar
      // reference page is disabled so /api/docs is the single doc entry point.
      openAPI({ disableDefaultReference: true }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
