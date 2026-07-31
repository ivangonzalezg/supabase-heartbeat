import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../database/schema';
import { createAuth } from './auth.config';

/**
 * Entry point for the Better Auth CLI only (`auth:generate`).
 *
 * The CLI needs a ready `auth` instance to introspect, not the
 * `createAuth(db)` factory NestJS uses (which is wired to the app's real,
 * DI-managed `DatabaseService` connection). Schema generation only reads
 * table/column metadata, so an ephemeral in-memory connection is enough.
 */
const connection = new Database(':memory:');
const db = drizzle(connection, { schema });

export const auth = createAuth(db);
