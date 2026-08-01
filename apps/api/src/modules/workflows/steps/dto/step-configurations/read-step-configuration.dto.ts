import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { READ_LIMIT_MAX } from '@supabase-heartbeat/validation';

/**
 * Documentation adapter for `readConfigurationSchema`
 * (`@supabase-heartbeat/validation`). Carries no `class-validator`
 * decorators and is never used to validate a request — see
 * `SigninStepConfigurationDto` for the full explanation of this
 * pattern.
 *
 * Mirrors the shared schema's private `TABLE_MAX_LENGTH` (200) and
 * `COLUMNS_MAX_LENGTH` (1000) constants for the documented maximum
 * lengths below.
 */
export class ReadStepConfigurationDto {
  @ApiProperty({
    description: 'The table to read from.',
    example: 'profiles',
    maxLength: 200,
  })
  table!: string;

  @ApiPropertyOptional({
    description:
      'A PostgREST-style column selection string. Defaults to "*" ' +
      '(all columns) when omitted.',
    example: 'id,name,updated_at',
    maxLength: 1000,
    default: '*',
  })
  columns?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of rows to return.',
    example: 100,
    minimum: 1,
    maximum: READ_LIMIT_MAX,
  })
  limit?: number;
}
