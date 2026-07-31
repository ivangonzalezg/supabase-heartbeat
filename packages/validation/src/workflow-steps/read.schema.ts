import { z } from 'zod';

const TABLE_MAX_LENGTH = 200;
const COLUMNS_MAX_LENGTH = 1000;

/**
 * Upper bound for `read.limit`. PostgREST-style filters are not
 * implemented yet (see the task scope), so `read` is intentionally a
 * small "fetch up to N rows" primitive — a generous but bounded ceiling
 * avoids a workflow step accidentally requesting an unbounded table scan.
 */
export const READ_LIMIT_MAX = 1000;

export const readConfigurationSchema = z.strictObject({
  table: z.string().trim().min(1).max(TABLE_MAX_LENGTH),
  columns: z
    .string()
    .trim()
    .min(1)
    .max(COLUMNS_MAX_LENGTH)
    .optional()
    .default('*'),
  limit: z.int().min(1).max(READ_LIMIT_MAX).optional(),
});

export type ReadConfiguration = z.infer<typeof readConfigurationSchema>;
