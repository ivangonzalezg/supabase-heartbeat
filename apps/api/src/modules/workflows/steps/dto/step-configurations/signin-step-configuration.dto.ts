import { ApiProperty } from '@nestjs/swagger';
import { SIGNIN_PASSWORD_MAX_LENGTH } from '@supabase-heartbeat/validation';

/**
 * Documentation adapter for `signinConfigurationSchema`
 * (`@supabase-heartbeat/validation`). This class exists only so Swagger
 * can render the shape of a `signin` step's `configuration` — it carries
 * no `class-validator` decorators and is never used to validate a
 * request; the shared Zod schema remains the sole runtime source of
 * truth (see `IsWorkflowStepInput` / `parseWorkflowStepConfiguration`).
 *
 * Authenticates against the target Supabase project as a specific
 * Supabase user. Credentials are stored exactly as submitted inside
 * `workflow_steps.configuration` — this API does not encrypt, hash, or
 * mask them, and does not currently return a redacted value: reading a
 * `signin` step back returns this same configuration unchanged. Every
 * `signin` step may use a different Supabase user; there is no
 * project-level credential model.
 */
export class SigninStepConfigurationDto {
  @ApiProperty({
    description: 'The Supabase user email to authenticate with.',
    example: 'heartbeat-user@example.com',
    format: 'email',
  })
  email!: string;

  @ApiProperty({
    description:
      'The Supabase user password. Stored in ' +
      '`workflow_steps.configuration` exactly as submitted, including ' +
      'leading/trailing whitespace, which is never trimmed. Not ' +
      'currently redacted from API responses.',
    example: 'replace-with-test-user-password',
    format: 'password',
    maxLength: SIGNIN_PASSWORD_MAX_LENGTH,
  })
  password!: string;
}
