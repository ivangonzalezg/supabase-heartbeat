import { ApiProperty } from '@nestjs/swagger';
import { UpdateFilterDto } from './update-filter.dto';

/**
 * Documentation adapter for `deleteConfigurationSchema`
 * (`@supabase-heartbeat/validation`). Carries no `class-validator`
 * decorators and is never used to validate a request — see
 * `SigninStepConfigurationDto` for the full explanation of this
 * pattern.
 *
 * Mirrors the shared schema's private `TABLE_MAX_LENGTH` (200) constant
 * for the documented maximum length below.
 */
export class DeleteStepConfigurationDto {
  @ApiProperty({
    description: 'The target table name.',
    example: 'profiles',
    maxLength: 200,
  })
  table!: string;

  @ApiProperty({
    description:
      'Identifies which row(s) to delete. Required (never optional) — ' +
      'an empty `delete` configuration would delete every row in the ' +
      'table, which is not expressible by this schema.',
    type: () => UpdateFilterDto,
  })
  filter!: UpdateFilterDto;
}
