import { config } from 'dotenv';

/**
 * Populates `process.env` from `apps/api/.env` (if present) before any
 * other module reads it. Must be the first import in `main.ts`: static
 * imports execute in source order, and every module that reads
 * `process.env` at load time (e.g. `AuthModule`'s factory) is imported
 * after this one only because it appears later in that file.
 *
 * `dotenv` never overwrites a variable that is already set, so real
 * environment variables (CI, production, test setup files) always win
 * over `.env`.
 */
config({ quiet: true });
