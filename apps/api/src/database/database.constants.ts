import { join } from 'path';

/**
 * Anchored to the process cwd, which every entry point (nest start, node
 * dist/main, and Jest via `yarn workspace @supabase-heartbeat/api ...`)
 * consistently launches from `apps/api`. `__dirname`/`import.meta` were
 * deliberately avoided here: the compiled file's own location differs
 * between the Nest build output and ts-jest's ESM transform output, and
 * only one of the two module systems can reference either symbol.
 */
const DEFAULT_DATABASE_PATH = join('data', 'supabase-heartbeat.db');

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH;
}
