import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
} from 'class-validator';

import {
  IsIanaTimeZoneConstraint,
  MAX_TIME_ZONE_LENGTH,
} from '../../common/validators/is-iana-time-zone.validator';

export class DoctorAvailabilityWindowDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_439)
  startMinute: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_440)
  endMinute: number;
}

export class UpdateDoctorAvailabilityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TIME_ZONE_LENGTH)
  @Validate(IsIanaTimeZoneConstraint)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  timeZone: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  slotDurationMinutes: number;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DoctorAvailabilityWindowDto)
  windows: DoctorAvailabilityWindowDto[];
}
