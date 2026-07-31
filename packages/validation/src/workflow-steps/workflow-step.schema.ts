import { z } from 'zod';
import { workflowStepTypes } from '../closed-sets.js';
import { signinConfigurationSchema } from './signin.schema.js';
import { signoutConfigurationSchema } from './signout.schema.js';
import { waitConfigurationSchema } from './wait.schema.js';
import { insertConfigurationSchema } from './insert.schema.js';
import { readConfigurationSchema } from './read.schema.js';
import { updateConfigurationSchema } from './update.schema.js';
import { deleteConfigurationSchema } from './delete.schema.js';
import { invokeFunctionConfigurationSchema } from './invoke-function.schema.js';

/**
 * `stepKey` is stable identity for a step within its workflow: it is used
 * today for the `(workflow_id, step_key)` uniqueness constraint, and will
 * later be referenced by step-output reference syntax (not implemented in
 * this task) — so it must stay a simple, predictable, machine-friendly
 * token. Lowercase letters, digits, hyphens, and underscores only;
 * whitespace and dots are rejected outright rather than silently
 * stripped, since silently modifying a key the caller will later
 * reference elsewhere would be worse than rejecting it up front.
 */
export const STEP_KEY_MAX_LENGTH = 100;
const STEP_KEY_PATTERN = /^[a-z0-9_-]+$/;

export const stepKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(STEP_KEY_MAX_LENGTH)
  .regex(
    STEP_KEY_PATTERN,
    'stepKey must contain only lowercase letters, numbers, hyphens, and underscores',
  );

const enabledSchema = z.boolean().optional();

/**
 * Validates a `type`/`configuration` pair alone (no `stepKey`/`enabled`)
 * — used when updating an existing step, where the merged result (current
 * row fields overridden by the patch) must be re-validated as a whole.
 *
 * Each branch is deliberately spelled out (not built by mapping over a
 * shared array into `z.discriminatedUnion`) because `z.discriminatedUnion`
 * needs a statically-known tuple type for correct inference, and because
 * `z.intersection(outerSchema, discriminatedUnion)` — the alternative
 * that would let `stepKey`/`enabled` be composed in once — does not
 * reliably preserve a branch's own strict-object rejection of unknown
 * `configuration` properties in this Zod version (verified directly: the
 * union alone correctly rejects a mismatched configuration, but the same
 * check silently passes once wrapped in `z.intersection`).
 */
export const workflowStepConfigurationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('signin'), configuration: signinConfigurationSchema }),
  z.strictObject({ type: z.literal('signout'), configuration: signoutConfigurationSchema }),
  z.strictObject({ type: z.literal('wait'), configuration: waitConfigurationSchema }),
  z.strictObject({ type: z.literal('insert'), configuration: insertConfigurationSchema }),
  z.strictObject({ type: z.literal('read'), configuration: readConfigurationSchema }),
  z.strictObject({ type: z.literal('update'), configuration: updateConfigurationSchema }),
  z.strictObject({ type: z.literal('delete'), configuration: deleteConfigurationSchema }),
  z.strictObject({
    type: z.literal('invoke_function'),
    configuration: invokeFunctionConfigurationSchema,
  }),
]);

export function parseWorkflowStepConfiguration(
  input: unknown,
): ReturnType<typeof workflowStepConfigurationSchema.safeParse> {
  return workflowStepConfigurationSchema.safeParse(input);
}

/** The full create-step input: `stepKey`/`enabled` plus the type/configuration pair. */
export const workflowStepCreateSchema = z.discriminatedUnion('type', [
  z.strictObject({
    stepKey: stepKeySchema,
    enabled: enabledSchema,
    type: z.literal('signin'),
    configuration: signinConfigurationSchema,
  }),
  z.strictObject({
    stepKey: stepKeySchema,
    enabled: enabledSchema,
    type: z.literal('signout'),
    configuration: signoutConfigurationSchema,
  }),
  z.strictObject({
    stepKey: stepKeySchema,
    enabled: enabledSchema,
    type: z.literal('wait'),
    configuration: waitConfigurationSchema,
  }),
  z.strictObject({
    stepKey: stepKeySchema,
    enabled: enabledSchema,
    type: z.literal('insert'),
    configuration: insertConfigurationSchema,
  }),
  z.strictObject({
    stepKey: stepKeySchema,
    enabled: enabledSchema,
    type: z.literal('read'),
    configuration: readConfigurationSchema,
  }),
  z.strictObject({
    stepKey: stepKeySchema,
    enabled: enabledSchema,
    type: z.literal('update'),
    configuration: updateConfigurationSchema,
  }),
  z.strictObject({
    stepKey: stepKeySchema,
    enabled: enabledSchema,
    type: z.literal('delete'),
    configuration: deleteConfigurationSchema,
  }),
  z.strictObject({
    stepKey: stepKeySchema,
    enabled: enabledSchema,
    type: z.literal('invoke_function'),
    configuration: invokeFunctionConfigurationSchema,
  }),
]);

export type WorkflowStepCreateInput = z.infer<typeof workflowStepCreateSchema>;

export { workflowStepTypes };
