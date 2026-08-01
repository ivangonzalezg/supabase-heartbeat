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
      'names to values. Any value may instead be a whole-value ' +
      'step-output reference to an earlier, enabled step in the same ' +
      'workflow: `${steps.<step_key>.output.<path>}` (the referenced ' +
      "step's stepKey, followed by `output`, followed by one or more " +
      "path segments into that step's output). The referenced value " +
      'replaces the string entirely, preserving its JSON type (a ' +
      'number stays a number, an object stays an object) — the ' +
      'reference cannot be embedded inside a larger string.',
    example: {
      status: 'ok',
      pinged_at: '2026-01-01T00:00:00.000Z',
      related_id: '${steps.create_record.output.rows.0.id}',
    },
    type: 'object',
    additionalProperties: true,
  })
  values!: Record<string, unknown>;
}
