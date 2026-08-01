import type { JsonValue } from '@supabase-heartbeat/validation';

/**
 * The JSON-safe result of one step execution. Safe to persist later in
 * `step_runs.output` (not written by this task). Must never carry
 * passwords, access tokens, refresh tokens, full Supabase sessions,
 * authorization headers, or the project's publishable key — every
 * executor in this module is responsible for shaping its own `output` to
 * satisfy that guarantee.
 */
export interface StepExecutionResult {
  readonly output: JsonValue;
}
