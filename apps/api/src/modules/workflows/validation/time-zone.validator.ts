import {
  registerDecorator,
  type ValidationOptions,
  type ValidationArguments,
} from 'class-validator';

/**
 * `Intl.supportedValuesOf('timeZone')` returns canonical `Area/Location`
 * IANA identifiers but does not include `'UTC'`, even though it is a
 * universally recognized canonical identifier; `'UTC'` is special-cased
 * here. `Intl.DateTimeFormat`'s own constructor validation was
 * deliberately NOT used alone, because it is more permissive than
 * intended — it also accepts legacy fixed-offset zone names such as
 * `'EST'`/`'GMT'`, which must be rejected. See apps/api/README.md for the
 * documented accept/reject examples this combination was verified
 * against.
 */
const SUPPORTED_TIME_ZONES = new Set(Intl.supportedValuesOf('timeZone'));

function isValidIanaTimeZone(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value === 'UTC' || SUPPORTED_TIME_ZONES.has(value))
  );
}

export function IsIanaTimeZone(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isIanaTimeZone',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isValidIanaTimeZone(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid IANA time zone identifier (e.g. "UTC", "America/Bogota").`;
        },
      },
    });
  };
}
