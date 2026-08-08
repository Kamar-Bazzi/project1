import { Transform } from 'class-transformer';
import { MeasurementType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  Validate,
  ValidateIf,
} from 'class-validator';

import {
  IsMeasurementDateNotInFutureConstraint,
  ISO_TIME_ZONE_SUFFIX_PATTERN,
  MAX_MEASUREMENT_VALUE,
  MIN_MEASUREMENT_VALUE,
} from './measurement-validation';

export class UpdateMeasurementDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(MeasurementType)
  type?: MeasurementType;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_MEASUREMENT_VALUE)
  @Max(MAX_MEASUREMENT_VALUE)
  value?: number;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_MEASUREMENT_VALUE)
  @Max(MAX_MEASUREMENT_VALUE)
  secondaryValue?: number | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  unit?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: 'measuredAt must be a valid ISO 8601 date' },
  )
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN, {
    message: 'measuredAt must include Z or an explicit UTC offset',
  })
  @Validate(IsMeasurementDateNotInFutureConstraint)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  measuredAt?: string;
}
