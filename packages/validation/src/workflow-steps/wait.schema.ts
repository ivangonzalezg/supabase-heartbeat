import { z } from 'zod';

/**
 * Upper bound for `wait.seconds`. A workflow step is expected to pause
 * briefly between operations (e.g. to respect rate limits), not to model
 * long-running delays — an hour is a generous ceiling for that use case
 * without allowing a single step to block a run indefinitely.
 */
export const WAIT_SECONDS_MAX = 3600;

export const waitConfigurationSchema = z.strictObject({
  seconds: z.int().min(1).max(WAIT_SECONDS_MAX),
});

export type WaitConfiguration = z.infer<typeof waitConfigurationSchema>;
