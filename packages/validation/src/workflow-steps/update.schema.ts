import { z } from 'zod';
import { jsonValueSchema } from '../json-value.js';

const TABLE_MAX_LENGTH = 200;
const COLUMN_MAX_LENGTH = 200;

/**
 * Only `eq` is supported for now. Broadening the filter operator set (or
 * supporting multiple combined filters) is a real PostgREST query
 * language and is explicitly out of scope until a concrete product
 * requirement proves more operators are needed.
 */
export const updateFilterOperators = ['eq'] as const;

export const updateFilterSchema = z.strictObject({
  column: z.string().trim().min(1).max(COLUMN_MAX_LENGTH),
  operator: z.enum(updateFilterOperators),
  value: jsonValueSchema,
});

const nonEmptyJsonObjectSchema = z.record(z.string(), jsonValueSchema).refine(
  (value) => Object.keys(value).length > 0,
  { message: 'values must contain at least one property' },
);

export const updateConfigurationSchema = z.strictObject({
  table: z.string().trim().min(1).max(TABLE_MAX_LENGTH),
  values: nonEmptyJsonObjectSchema,
  filter: updateFilterSchema,
});

export type UpdateConfiguration = z.infer<typeof updateConfigurationSchema>;
