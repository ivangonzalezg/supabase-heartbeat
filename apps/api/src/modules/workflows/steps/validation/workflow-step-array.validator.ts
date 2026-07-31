import {
  registerDecorator,
  type ValidationOptions,
  type ValidationArguments,
} from 'class-validator';
import { workflowStepCreateSchema } from '@supabase-heartbeat/validation';
import { MAX_STEPS_PER_WORKFLOW } from './workflow-step.validator';

interface StepLike {
  stepKey?: unknown;
}

function findDuplicateStepKey(steps: StepLike[]): string | undefined {
  const seen = new Set<string>();
  for (const step of steps) {
    if (typeof step.stepKey !== 'string') {
      continue;
    }
    if (seen.has(step.stepKey)) {
      return step.stepKey;
    }
    seen.add(step.stepKey);
  }
  return undefined;
}

/**
 * Validates the full `steps` array for the aggregate workflow-create
 * endpoint: nonempty (a workflow without any steps is not useful and
 * cannot be created through this endpoint), bounded length, every step
 * individually valid against the shared step schema, and no duplicate
 * `stepKey` within the array — checked before the transaction opens, so
 * a duplicate key never reaches the database's own uniqueness
 * constraint.
 */
export function IsWorkflowStepArray(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isWorkflowStepArray',
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
          if (findDuplicateStepKey(value as StepLike[]) !== undefined) {
            return false;
          }
          return value.every(
            (step) => workflowStepCreateSchema.safeParse(step).success,
          );
        },
        defaultMessage(args: ValidationArguments) {
          const value = args.value as unknown;
          if (!Array.isArray(value)) {
            return `${args.property} must be an array.`;
          }
          if (value.length === 0) {
            return `${args.property} must contain at least one step.`;
          }
          if (value.length > MAX_STEPS_PER_WORKFLOW) {
            return `${args.property} must contain at most ${MAX_STEPS_PER_WORKFLOW} steps.`;
          }
          const duplicate = findDuplicateStepKey(value as StepLike[]);
          if (duplicate !== undefined) {
            return `${args.property} contains a duplicate stepKey: "${duplicate}".`;
          }
          for (let index = 0; index < value.length; index += 1) {
            const result = workflowStepCreateSchema.safeParse(value[index]);
            if (!result.success) {
              const [firstIssue] = result.error.issues;
              const path = firstIssue?.path.join('.') || '(root)';
              return `${args.property}[${index}].${path}: ${firstIssue?.message ?? 'invalid step'}`;
            }
          }
          return `${args.property} is invalid.`;
        },
      },
    });
  };
}
