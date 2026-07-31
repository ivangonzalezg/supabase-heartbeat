import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const NAME_MAX_LENGTH = 200;
const PUBLISHABLE_KEY_MAX_LENGTH = 500;

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({
    description: 'Human-readable project name.',
    example: 'Production Supabase Project',
    maxLength: NAME_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    description: 'Optional free-text description of the project.',
    example: 'Heartbeat monitoring for the production Supabase project.',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "The Supabase project's HTTP(S) URL.",
    example: 'https://example.supabase.co',
  })
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'supabaseUrl must be a valid http or https URL' },
  )
  supabaseUrl?: string;

  @ApiPropertyOptional({
    description:
      "The Supabase project's publishable (anon) key. Public by design.",
    example: 'sb_publishable_examplekey',
    maxLength: PUBLISHABLE_KEY_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'publishableKey must not be empty' })
  @MaxLength(PUBLISHABLE_KEY_MAX_LENGTH)
  publishableKey?: string;

  @ApiPropertyOptional({
    description: 'Whether the project is enabled.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * `class-validator` has no built-in "at least one property present" rule
 * that fits cleanly on a DTO where every field is individually optional.
 * The service checks this explicitly before touching the database, so an
 * empty patch body (`{}`) still produces a normal 400 rather than a no-op
 * update.
 */
export function isEmptyUpdate(dto: UpdateProjectDto): boolean {
  return (
    dto.name === undefined &&
    dto.description === undefined &&
    dto.supabaseUrl === undefined &&
    dto.publishableKey === undefined &&
    dto.enabled === undefined
  );
}
