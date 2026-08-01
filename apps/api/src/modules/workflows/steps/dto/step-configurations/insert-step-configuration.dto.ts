import { ApiProperty } from '@nestjs/swagger';

/**
 * Documentation adapter for `insertConfigurationSchema`
 * (`@supabase-heartbeat/validation`). Carries no `class-validator`
 * decorators and is never used to validate a request — see
 * `SigninStepConfigurationDto` for the full explanation of this
 * pattern.
 *
 * Mirrors the shared schema's `TABLE_MAX_LENGTH` (200, not exported by
 * the validation package) for the `table` field's documented maximum
 * length.
 */
export class InsertStepConfigurationDto {
  @ApiProperty({
    description: 'The target table name.',
    example: 'profiles',
    maxLength: 200,
  })
  table!: string;

  @ApiProperty({
    description:
      'The row to insert, as a nonempty JSON object mapping column ' +
      'names to values.',
    example: { status: 'ok', pinged_at: '2026-01-01T00:00:00.000Z' },
    type: 'object',
    additionalProperties: true,
  })
  values!: Record<string, unknown>;
}
