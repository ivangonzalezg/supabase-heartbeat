import { z } from 'zod';

const DEFAULT_FIRST_ADMIN_NAME = 'Admin';

export class FirstAdminBootstrapConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirstAdminBootstrapConfigError';
  }
}

export interface PasswordLengthBounds {
  minPasswordLength: number;
  maxPasswordLength: number;
}

export type FirstAdminBootstrapConfig =
  | { configured: false }
  | { configured: true; email: string; password: string; name: string };

function buildSchema(passwordLengthBounds: PasswordLengthBounds) {
  return z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email('FIRST_ADMIN_EMAIL is not a valid email address.')),
    // Not trimmed: whitespace is a valid password character.
    password: z
      .string()
      .min(
        passwordLengthBounds.minPasswordLength,
        `FIRST_ADMIN_PASSWORD is shorter than the configured minimum ` +
          `length of ${passwordLengthBounds.minPasswordLength} characters.`,
      )
      .max(
        passwordLengthBounds.maxPasswordLength,
        `FIRST_ADMIN_PASSWORD is longer than the configured maximum ` +
          `length of ${passwordLengthBounds.maxPasswordLength} characters.`,
      ),
    name: z
      .string()
      .trim()
      .transform((value) => (value === '' ? DEFAULT_FIRST_ADMIN_NAME : value))
      .default(DEFAULT_FIRST_ADMIN_NAME),
  });
}

/**
 * Reads and validates FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD /
 * FIRST_ADMIN_NAME from the environment.
 *
 * FIRST_ADMIN_NAME alone never activates bootstrap — only email and
 * password together do. Partial configuration (exactly one of email or
 * password set) throws rather than silently skipping, per the task's
 * explicit environment-state matrix. This presence check is a cross-field
 * rule about which variables exist, so it runs before schema validation
 * rather than being expressed as a per-field Zod rule.
 */
export function readFirstAdminBootstrapConfig(
  passwordLengthBounds: PasswordLengthBounds,
): FirstAdminBootstrapConfig {
  const rawEmail = process.env.FIRST_ADMIN_EMAIL;
  const rawPassword = process.env.FIRST_ADMIN_PASSWORD;

  const emailProvided = rawEmail !== undefined && rawEmail !== '';
  const passwordProvided = rawPassword !== undefined && rawPassword !== '';

  if (!emailProvided && !passwordProvided) {
    return { configured: false };
  }

  if (emailProvided && !passwordProvided) {
    throw new FirstAdminBootstrapConfigError(
      'FIRST_ADMIN_EMAIL is set but FIRST_ADMIN_PASSWORD is missing. Both ' +
        'must be provided together to bootstrap the first administrator.',
    );
  }

  if (!emailProvided && passwordProvided) {
    throw new FirstAdminBootstrapConfigError(
      'FIRST_ADMIN_PASSWORD is set but FIRST_ADMIN_EMAIL is missing. Both ' +
        'must be provided together to bootstrap the first administrator.',
    );
  }

  const result = buildSchema(passwordLengthBounds).safeParse({
    email: rawEmail,
    password: rawPassword,
    name: process.env.FIRST_ADMIN_NAME,
  });

  if (!result.success) {
    throw new FirstAdminBootstrapConfigError(result.error.issues[0].message);
  }

  return { configured: true, ...result.data };
}
