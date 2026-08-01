import { ApiProperty } from '@nestjs/swagger';
import { WAIT_SECONDS_MAX } from '@supabase-heartbeat/validation';

/**
 * Documentation adapter for `waitConfigurationSchema`
 * (`@supabase-heartbeat/validation`). Carries no `class-validator`
 * decorators and is never used to validate a request — see
 * `SigninStepConfigurationDto` for the full explanation of this
 * pattern.
 */
export class WaitStepConfigurationDto {
  @ApiProperty({
    description:
      'How many seconds to pause before the next step, e.g. to respect ' +
      'rate limits.',
    example: 5,
    minimum: 1,
    maximum: WAIT_SECONDS_MAX,
  })
  seconds!: number;
}
