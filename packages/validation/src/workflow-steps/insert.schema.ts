import { z } from 'zod';
import { jsonValueSchema } from '../json-value.js';

const TABLE_MAX_LENGTH = 200;

/**
 * A non-array JSON object with at least one property. `insert.values`
 * must have something to insert — an empty object would insert a
 * default-only row, which is rarely the intent and is rejected to avoid
 * silently-wrong workflow definitions.
 */
const nonEmptyJsonObjectSchema = z.record(z.string(), jsonValueSchema).refine(
  (value) => Object.keys(value).length > 0,
  { message: 'values must contain at least one property' },
);

export const insertConfigurationSchema = z.strictObject({
  table: z.string().trim().min(1).max(TABLE_MAX_LENGTH),
  values: nonEmptyJsonObjectSchema,
});

export type InsertConfiguration = z.infer<typeof insertConfigurationSchema>;
