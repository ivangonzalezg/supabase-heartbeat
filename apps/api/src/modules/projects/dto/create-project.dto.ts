import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateProjectDto {
  @ApiProperty({
    description: 'Human-readable project name.',
    example: 'Production Supabase Project',
    maxLength: NAME_MAX_LENGTH,
  })
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(NAME_MAX_LENGTH)
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional free-text description of the project.',
    example: 'Heartbeat monitoring for the production Supabase project.',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  description?: string;

  @ApiProperty({
    description: "The Supabase project's HTTP(S) URL.",
    example: 'https://example.supabase.co',
  })
  @Transform(({ value }) => trim(value))
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'supabaseUrl must be a valid http or https URL' },
  )
  supabaseUrl!: string;

  @ApiProperty({
    description:
      "The Supabase project's publishable (anon) key. Public by design.",
    example: 'sb_publishable_examplekey',
    maxLength: PUBLISHABLE_KEY_MAX_LENGTH,
  })
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty({ message: 'publishableKey must not be empty' })
  @MaxLength(PUBLISHABLE_KEY_MAX_LENGTH)
  publishableKey!: string;

  @ApiPropertyOptional({
    description: 'Whether the project is enabled. Defaults to true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
