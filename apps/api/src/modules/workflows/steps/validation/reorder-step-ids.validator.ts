import {
  registerDecorator,
  type ValidationOptions,
  type ValidationArguments,
} from 'class-validator';
import { MAX_STEPS_PER_WORKFLOW } from './workflow-step.validator';

function findDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return undefined;
}

/**
 * Validates the reorder endpoint's `stepIds` array as a whole: must be
 * an array of strings, nonempty, bounded by the same
 * `MAX_STEPS_PER_WORKFLOW` cap already used for workflow creation and
 * step append, every entry nonempty after trimming, and no duplicates.
 * Duplicates are rejected outright rather than silently deduplicated —
 * silently dropping a client-submitted ID could change which step ends
 * up at which position without the caller noticing.
 *
 * This only validates the array's own structural shape. Whether the
 * submitted ID set exactly matches the workflow's current steps (no
 * missing, extra, or foreign IDs) is a database-dependent check and is
 * therefore performed by `WorkflowStepsService.reorder`, not here — see
 * `WorkflowStepOrderConflictError`.
 */
export function IsReorderStepIdsArray(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isReorderStepIdsArray',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) {
            return false;
          }
          if (value.length === 0 || value.length > MAX_STEPS_PER_WORKFLOW) {
            return false;
          }
          if (!value.every((entry) => typeof entry === 'string')) {
            return false;
          }
          const trimmed = value;
          if (trimmed.some((entry) => entry.trim().length === 0)) {
            return false;
          }
          if (findDuplicate(trimmed) !== undefined) {
            return false;
          }
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          const value = args.value as unknown;
          if (!Array.isArray(value)) {
            return `${args.property} must be an array.`;
          }
          if (value.length === 0) {
            return `${args.property} must contain at least one step ID.`;
          }
          if (value.length > MAX_STEPS_PER_WORKFLOW) {
            return `${args.property} must contain at most ${MAX_STEPS_PER_WORKFLOW} step IDs.`;
          }
          if (!value.every((entry) => typeof entry === 'string')) {
            return `${args.property} must contain only strings.`;
          }
          const trimmed = value;
          if (trimmed.some((entry) => entry.trim().length === 0)) {
            return `${args.property} must not contain empty or whitespace-only IDs.`;
          }
          const duplicate = findDuplicate(trimmed);
          if (duplicate !== undefined) {
            return `${args.property} contains a duplicate step ID: "${duplicate}".`;
          }
          return `${args.property} is invalid.`;
        },
      },
    });
  };
}
