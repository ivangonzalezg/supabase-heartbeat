import { join } from 'path';

/**
 * Default path is anchored to this compiled module's own location (not the
 * process cwd), so `apps/api/data/...` is used regardless of where the
 * process is launched from.
 */
const DEFAULT_DATABASE_PATH = join(
  __dirname,
  '..',
  '..',
  'data',
  'supabase-heartbeat.db',
);

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH;
}
