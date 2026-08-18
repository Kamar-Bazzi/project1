import { Transform } from 'class-transformer';
import { AccountStatus, UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  IsIanaTimeZoneConstraint,
  MAX_TIME_ZONE_LENGTH,
} from '../../common/validators/is-iana-time-zone.validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimNullableString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class AdminUserQueryDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => trimString(value))
  search?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(UserRole)
  role?: UserRole;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;
}

export class CreateAdminUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => trimString(value))
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

  @IsEnum(UserRole)
  role: UserRole;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => trimNullableString(value))
  specialization?: string | null;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => trimNullableString(value))
  licenseNumber?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TIME_ZONE_LENGTH)
  @Validate(IsIanaTimeZoneConstraint)
  @Transform(({ value }: { value: unknown }) => trimString(value))
  timeZone?: string;
}

export class UpdateAdminUserDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => trimString(value))
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(UserRole)
  role?: UserRole;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => trimNullableString(value))
  specialization?: string | null;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => trimNullableString(value))
  licenseNumber?: string | null;
}
