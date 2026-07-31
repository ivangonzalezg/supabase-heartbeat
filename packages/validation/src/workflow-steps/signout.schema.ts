import { z } from 'zod';

/** `signout` takes no configuration; unknown properties are rejected. */
export const signoutConfigurationSchema = z.strictObject({});

export type SignoutConfiguration = z.infer<typeof signoutConfigurationSchema>;
