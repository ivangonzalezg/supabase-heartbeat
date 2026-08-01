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
 * for the `(workflow_id, step_key)` uniqueness constraint, and — as of
 * this task — as the stable identifier embedded inside step-output
 * reference strings elsewhere in the same workflow
 * (`${steps.<step_key>.output.<path>}`, see
 * `apps/api/src/modules/workflows/references/`). Because other steps'
 * persisted configuration can literally contain this string, `stepKey`
 * must be a strict, unambiguous, machine-friendly snake_case token —
 * silently normalizing (lowercasing, trimming internal characters) a key
 * the caller will later reference elsewhere would be worse than
 * rejecting it up front.
 *
 * Selected rule (the stricter of the two candidates considered — see
 * `.agent-reports/2026-08-02-workflow-step-output-references/inspection.md`
 * for the full rationale): lowercase letters and digits, grouped into
 * words separated by single underscores, starting with a letter.
 * Rejects a leading digit, a leading underscore, a trailing underscore,
 * and consecutive underscores — not merely "prefer" rejecting them, this
 * schema makes all four structurally impossible, since a key embedded in
 * another step's reference string should never have an ambiguous or
 * confusing form.
 */
export const STEP_KEY_MAX_LENGTH = 100;

/**
 * The single canonical snake_case pattern for `stepKey`. Exported (not
 * module-private) because this package is the sole source of truth for
 * valid `stepKey` syntax: any other code that needs to recognize a
 * `stepKey` — for example `apps/api`'s step-output reference parser,
 * which must accept exactly the same keys this schema accepts — must
 * import this pattern rather than re-declaring its own copy. A second,
 * independently-maintained copy could silently drift from this one
 * (e.g. after a future change to this rule) and either reject a valid
 * key or, worse, accept an invalid one somewhere reference resolution
 * assumes it cannot occur.
 */
export const STEP_KEY_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** True for exactly the strings `stepKeySchema` would accept for its
 * pattern check alone (this does not re-apply length bounds — callers
 * needing the full `stepKeySchema` guarantee, including length and
 * trimming, should use `stepKeySchema` itself). */
export function isValidStepKey(value: string): boolean {
  return STEP_KEY_PATTERN.test(value);
}

export const stepKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(STEP_KEY_MAX_LENGTH)
  .regex(
    STEP_KEY_PATTERN,
    'stepKey must be snake_case: start with a lowercase letter, contain ' +
      'only lowercase letters, digits, and single underscores between ' +
      'words (no leading digit, no leading/trailing underscore, no ' +
      'consecutive underscores)',
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
