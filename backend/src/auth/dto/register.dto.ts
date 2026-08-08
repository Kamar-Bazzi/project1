import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
} from 'class-validator';

import {
  IsIanaTimeZoneConstraint,
  MAX_TIME_ZONE_LENGTH,
} from '../../common/validators/is-iana-time-zone.validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;

  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must include uppercase, lowercase, and a number',
  })
  password: string;

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
