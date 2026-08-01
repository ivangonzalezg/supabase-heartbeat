import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Documentation adapter for `invokeFunctionConfigurationSchema`
 * (`@supabase-heartbeat/validation`). Carries no `class-validator`
 * decorators and is never used to validate a request — see
 * `SigninStepConfigurationDto` for the full explanation of this
 * pattern.
 *
 * Mirrors the shared schema's private `FUNCTION_NAME_MAX_LENGTH` (200)
 * constant for the documented maximum length below.
 */
export class InvokeFunctionStepConfigurationDto {
  @ApiProperty({
    description: 'The name of the Supabase Edge Function to invoke.',
    example: 'send-heartbeat-notification',
    maxLength: 200,
  })
  functionName!: string;

  @ApiPropertyOptional({
    description:
      'The JSON request body to send to the function, if any. Any ' +
      'JSON value is accepted.',
    example: { message: 'heartbeat' },
    type: 'object',
    additionalProperties: true,
  })
  body?: unknown;
}
