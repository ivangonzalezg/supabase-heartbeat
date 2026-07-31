import {
  registerDecorator,
  type ValidationOptions,
  type ValidationArguments,
} from 'class-validator';
import {
  workflowStepCreateSchema,
  type WorkflowStepCreateInput,
} from '@supabase-heartbeat/validation';

/**
 * Maximum number of steps a single workflow may declare, both through the
 * aggregate create endpoint and through individual appends. A generous
 * but bounded ceiling — enough for any realistic MVP workflow while
 * keeping payload size and position-compaction cost predictable.
 */
export const MAX_STEPS_PER_WORKFLOW = 100;

interface StepInputLike {
  stepKey?: unknown;
  type?: unknown;
  configuration?: unknown;
  enabled?: unknown;
}

function extractStepShape(object: unknown): StepInputLike {
  const source = (object ?? {}) as StepInputLike;
  return {
    stepKey: source.stepKey,
    type: source.type,
    configuration: source.configuration,
    enabled: source.enabled,
  };
}

/**
 * Validates the whole step shape (`stepKey`, `type`, `configuration`,
 * `enabled`) as one unit using the shared `@supabase-heartbeat/validation`
 * schema — the same schema a future frontend will use — rather than
 * duplicating per-field `class-validator` decorators for a
 * `configuration` shape that depends on `type`. Attached to the `type`
 * property (an arbitrary but stable choice — `class-validator` gives any
 * property's validator access to every sibling field via
 * `args.object`), so the resulting error is reported against `type`.
 */
export function IsWorkflowStepInput(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isWorkflowStepInput',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const step = extractStepShape(args.object);
          return workflowStepCreateSchema.safeParse(step).success;
        },
        defaultMessage(args: ValidationArguments) {
          const step = extractStepShape(args.object);
          const result = workflowStepCreateSchema.safeParse(step);
          if (result.success) {
            return 'invalid workflow step';
          }
          const [firstIssue] = result.error.issues;
          const path = firstIssue?.path.join('.') || '(root)';
          return `step ${path}: ${firstIssue?.message ?? 'invalid workflow step'}`;
        },
      },
    });
  };
}

export type { WorkflowStepCreateInput };
