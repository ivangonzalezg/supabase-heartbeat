import { z } from 'zod';

/**
 * Upper bound for `wait.seconds`. A workflow step is expected to pause
 * briefly between operations (e.g. to respect rate limits), not to model
 * long-running delays — 5 minutes is a generous ceiling for that use case
 * without letting a single step tie up the event loop or block a run for
 * too long.
 */
export const WAIT_SECONDS_MAX = 300;

export const waitConfigurationSchema = z.strictObject({
  seconds: z.int().min(1).max(WAIT_SECONDS_MAX),
});

export type WaitConfiguration = z.infer<typeof waitConfigurationSchema>;
