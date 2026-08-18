import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ISO_TIME_ZONE_SUFFIX_PATTERN } from './appointment-date-validation';

function trimNullableString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class CreateAppointmentDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  patientId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  doctorId?: string;

  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: 'appointmentDate must be a valid ISO 8601 date' },
  )
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN, {
    message: 'appointmentDate must include Z or an explicit UTC offset',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  appointmentDate: string;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  @Transform(({ value }: { value: unknown }) => trimNullableString(value))
  notes?: string | null;
}
