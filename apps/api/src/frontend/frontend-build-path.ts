import { join } from 'path';

/**
 * Resolves the compiled web app's `dist` folder relative to this compiled
 * module's own location, so it works regardless of the process's cwd.
 *
 * At runtime this file lives at `apps/api/dist/frontend/frontend-build-path.js`,
 * so the web build sits two directories up, under `apps/web/dist`.
 */
export function getFrontendBuildPath(): string {
  return join(__dirname, '..', '..', '..', 'web', 'dist');
}
