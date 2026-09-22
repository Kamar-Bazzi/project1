import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const nullableTrim = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export class UpdateMedicationRefillDto {
  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000_000)
  remainingQuantity?: number | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 50 })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @MaxLength(50)
  @Transform(nullableTrim)
  quantityUnit?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000_000)
  lowQuantityThreshold?: number | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-09-01' })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(DATE_ONLY_PATTERN, {
    message: 'nextRefillDate must use YYYY-MM-DD format',
  })
  nextRefillDate?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @MaxLength(200)
  @Transform(nullableTrim)
  pharmacyName?: string | null;
}
