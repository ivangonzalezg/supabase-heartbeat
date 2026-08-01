import { ApiProperty } from '@nestjs/swagger';
import { updateFilterOperators } from '@supabase-heartbeat/validation';

/**
 * Documentation adapter for `updateFilterSchema`
 * (`@supabase-heartbeat/validation`), shared by `update` and `delete`
 * configurations. Carries no `class-validator` decorators and is never
 * used to validate a request — see `SigninStepConfigurationDto` for the
 * full explanation of this pattern.
 *
 * Mirrors the shared schema's private `COLUMN_MAX_LENGTH` (200) constant
 * for the documented maximum length below. Only the `eq` operator is
 * currently implemented.
 */
export class UpdateFilterDto {
  @ApiProperty({
    description: 'The column to filter on.',
    example: 'id',
    maxLength: 200,
  })
  column!: string;

  @ApiProperty({
    description: 'The comparison operator. Only "eq" is implemented today.',
    enum: updateFilterOperators,
    example: 'eq',
  })
  operator!: (typeof updateFilterOperators)[number];

  @ApiProperty({
    description:
      'The value to compare the column against. Any JSON value ' +
      '(string, number, boolean, null, array, or object). May instead ' +
      'be a whole-value step-output reference to an earlier, enabled ' +
      'step in the same workflow, e.g. ' +
      '`${steps.create_record.output.rows.0.id}` — see ' +
      '`InsertStepConfigurationDto.values` for the full reference syntax.',
    example: '${steps.create_record.output.rows.0.id}',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'object', nullable: true },
      { type: 'array', items: {} },
    ],
  })
  value!: unknown;
}
