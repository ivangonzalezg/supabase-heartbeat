import { z } from 'zod';
import { updateFilterSchema } from './update.schema.js';

const TABLE_MAX_LENGTH = 200;

/**
 * `filter` is required (never optional): an empty `delete` configuration
 * would delete every row in the table, which this schema makes
 * structurally impossible to express by construction rather than relying
 * on a runtime guard elsewhere.
 */
export const deleteConfigurationSchema = z.strictObject({
  table: z.string().trim().min(1).max(TABLE_MAX_LENGTH),
  filter: updateFilterSchema,
});

export type DeleteConfiguration = z.infer<typeof deleteConfigurationSchema>;
