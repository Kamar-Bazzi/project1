import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import {
  IsIanaTimeZoneConstraint,
  MAX_TIME_ZONE_LENGTH,
} from '../../common/validators/is-iana-time-zone.validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function trimNullableString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length === 0 ? null : trimmedValue;
}

@ValidatorConstraint({ name: 'isSupportedPatientDate', async: false })
class IsSupportedPatientDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) {
      return false;
    }

    const [year, month, day] = value.split('-').map(Number);
    const parsedDate = new Date(`${value}T00:00:00.000Z`);

    return (
      year >= 1900 &&
      !Number.isNaN(parsedDate.getTime()) &&
      parsedDate.getUTCFullYear() === year &&
      parsedDate.getUTCMonth() + 1 === month &&
      parsedDate.getUTCDate() === day
    );
  }

  defaultMessage(): string {
    return 'dateOfBirth must be a real date from 1900 onward';
  }
}

export class UpdatePatientProfileDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name?: string;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @Matches(DATE_ONLY_PATTERN, {
    message: 'dateOfBirth must use YYYY-MM-DD format',
  })
  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: 'dateOfBirth must be a valid ISO 8601 date' },
  )
  @Validate(IsSupportedPatientDateConstraint)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  dateOfBirth?: string | null;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(30)
  @Transform(({ value }: { value: unknown }) => trimNullableString(value))
  phoneNumber?: string | null;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => trimNullableString(value))
  emergencyContact?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TIME_ZONE_LENGTH)
  @Validate(IsIanaTimeZoneConstraint)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  timeZone?: string;
}
