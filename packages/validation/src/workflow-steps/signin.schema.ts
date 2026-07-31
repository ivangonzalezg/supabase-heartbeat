import { z } from 'zod';

/**
 * `signin` currently takes no configuration: reusable Supabase login
 * credentials belong to the project context, not to an individual
 * workflow step (avoiding duplicated credentials across workflows). No
 * project credential model exists yet, so a `signin` step cannot
 * actually be executed until one is added — this schema only validates
 * the step's *shape*, not runnable behavior.
 */
export const signinConfigurationSchema = z.strictObject({});

export type SigninConfiguration = z.infer<typeof signinConfigurationSchema>;
