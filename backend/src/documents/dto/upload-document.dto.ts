import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HealthDocumentCategory } from '@prisma/client';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimNullable(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class UploadDocumentDto {
  @ApiProperty({ maxLength: 160, example: 'Laboratory report - August' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Transform(({ value }: { value: unknown }) => trim(value))
  title: string;

  @ApiProperty({ enum: HealthDocumentCategory })
  @IsEnum(HealthDocumentCategory)
  category: HealthDocumentCategory;

  @ApiPropertyOptional({ maxLength: 2_000, nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(2_000)
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  description?: string | null;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-08-22',
    nullable: true,
  })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(DATE_ONLY_PATTERN, {
    message: 'documentDate must use YYYY-MM-DD format',
  })
  documentDate?: string | null;
}
