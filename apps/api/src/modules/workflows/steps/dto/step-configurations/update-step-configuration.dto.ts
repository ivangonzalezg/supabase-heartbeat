import { ApiProperty } from '@nestjs/swagger';
import { UpdateFilterDto } from './update-filter.dto';

/**
 * Documentation adapter for `updateConfigurationSchema`
 * (`@supabase-heartbeat/validation`). Carries no `class-validator`
 * decorators and is never used to validate a request — see
 * `SigninStepConfigurationDto` for the full explanation of this
 * pattern.
 *
 * Mirrors the shared schema's private `TABLE_MAX_LENGTH` (200) constant
 * for the documented maximum length below.
 */
export class UpdateStepConfigurationDto {
  @ApiProperty({
    description: 'The target table name.',
    example: 'profiles',
    maxLength: 200,
  })
  table!: string;

  @ApiProperty({
    description:
      'The columns to update, as a nonempty JSON object mapping column ' +
      'names to new values.',
    example: { status: 'inactive' },
    type: 'object',
    additionalProperties: true,
  })
  values!: Record<string, unknown>;

  @ApiProperty({
    description:
      'Identifies which row(s) to update. Required — an update without ' +
      'a filter would affect every row in the table.',
    type: () => UpdateFilterDto,
  })
  filter!: UpdateFilterDto;
}
