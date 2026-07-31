import {
  registerDecorator,
  type ValidationOptions,
  type ValidationArguments,
} from 'class-validator';
import { validateCronExpression } from 'cron';

/**
 * Validates a cron expression using the same parser (`cron`, the package
 * `@nestjs/schedule` depends on) the future scheduler will use, so
 * anything accepted here is guaranteed to parse identically once
 * scheduling is implemented. Accepts both the 5-field (minute hour
 * day-of-month month day-of-week) and 6-field (with a leading seconds
 * field) formats, and the macros (`@daily`, `@hourly`, ...) this library
 * itself supports — see apps/api/README.md for the documented format.
 */
export function IsCronExpression(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isCronExpression',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') {
            return false;
          }
          return validateCronExpression(value).valid;
        },
        defaultMessage(args: ValidationArguments) {
          if (typeof args.value !== 'string') {
            return `${args.property} must be a string.`;
          }
          const result = validateCronExpression(args.value);
          const reason = result.error?.message ?? 'invalid cron expression';
          return `${args.property} is not a valid cron expression: ${reason}`;
        },
      },
    });
  };
}
