import { resolve } from 'path';

/**
 * Anchored to the process cwd (`apps/api`, where every entry point launches
 * from), not `__dirname`: see database.constants.ts for why. Must resolve to
 * an absolute path, since `res.sendFile` (used by `@nestjs/serve-static`'s
 * SPA fallback) rejects relative ones.
 */
export function getFrontendBuildPath(): string {
  return resolve('..', 'web', 'dist');
}
