import { z } from 'zod';
import { jsonValueSchema } from '../json-value.js';

const FUNCTION_NAME_MAX_LENGTH = 200;

export const invokeFunctionConfigurationSchema = z.strictObject({
  functionName: z.string().trim().min(1).max(FUNCTION_NAME_MAX_LENGTH),
  body: jsonValueSchema.optional(),
});

export type InvokeFunctionConfiguration = z.infer<
  typeof invokeFunctionConfigurationSchema
>;
