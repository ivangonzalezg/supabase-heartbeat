import { z } from 'zod';

/**
 * Upper bound for `signin.password`. Matches this API's own Better Auth
 * `maxPasswordLength` default (see
 * `apps/api/src/modules/auth/first-admin-bootstrap.service.ts`) — not
 * because these are the same credential system, but because it is an
 * already-established, reasonable ceiling for a password field in this
 * codebase, and an upper bound is needed to keep `workflow_steps.configuration`
 * bounded regardless of which system issued the password.
 */
export const SIGNIN_PASSWORD_MAX_LENGTH = 128;

/**
 * `signin` authenticates against a Supabase project using a specific
 * Supabase user's email/password credentials, stored as submitted inside
 * `workflow_steps.configuration` (this JSON column, not a separate
 * project-level credential table — no such model exists in this
 * codebase). Different `signin` steps, even within the same workflow, may
 * therefore use different Supabase users. These credentials are not
 * encrypted, hashed, or masked by this schema or by the API — see
 * `apps/api/README.md` for the current storage behavior.
 *
 * `email` is trimmed and validated as a real email address; empty after
 * trimming is rejected. `password` is intentionally NOT trimmed —
 * leading/trailing whitespace is a valid password character and must be
 * preserved exactly as submitted — but must be nonempty and is bounded by
 * `SIGNIN_PASSWORD_MAX_LENGTH`. No password-complexity rule (character
 * classes, etc.) is enforced here: this schema only proves the value is a
 * plausible credential to submit to Supabase, not that it satisfies any
 * particular password policy.
 */
export const signinConfigurationSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .min(1, 'email must not be empty')
    .pipe(z.email('email must be a valid email address')),
  password: z
    .string()
    .min(1, 'password must not be empty')
    .max(
      SIGNIN_PASSWORD_MAX_LENGTH,
      `password must be at most ${SIGNIN_PASSWORD_MAX_LENGTH} characters`,
    ),
});

export type SigninConfiguration = z.infer<typeof signinConfigurationSchema>;
