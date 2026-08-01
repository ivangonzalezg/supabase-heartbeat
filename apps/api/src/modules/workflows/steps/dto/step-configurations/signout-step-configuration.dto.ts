import { ApiSchema } from '@nestjs/swagger';

/**
 * Documentation adapter for `signoutConfigurationSchema`
 * (`@supabase-heartbeat/validation`). Carries no `class-validator`
 * decorators and is never used to validate a request — see
 * `SigninStepConfigurationDto` for the full explanation of this
 * pattern.
 *
 * `signout` takes no configuration; any property is rejected.
 */
@ApiSchema({
  name: 'SignoutStepConfiguration',
  description: '`signout` takes no configuration properties.',
})
export class SignoutStepConfigurationDto {}
