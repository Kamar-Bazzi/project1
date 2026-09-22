import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ISO_TIME_ZONE_SUFFIX_PATTERN } from '../../appointments/dto/appointment-date-validation';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimNullable = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export class CreateSymptomDto {
  @ApiProperty({ example: 'Headache' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(trim)
  name: string;

  @ApiProperty({ minimum: 1, maximum: 10, example: 4 })
  @IsInt()
  @Min(1)
  @Max(10)
  severity: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN, {
    message: 'occurredAt must include Z or an explicit UTC offset',
  })
  occurredAt: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 4_000 })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(4_000)
  @Transform(trimNullable)
  notes?: string | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  medicationIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  measurementIds?: string[];
}

export class UpdateSymptomDto extends PartialType(CreateSymptomDto) {}
