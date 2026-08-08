import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const EMERGENCY_PHONE_PATTERN = /^[+0-9][0-9\s().-]{2,29}$/;

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class CreateEmergencyContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => trimString(value))
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Transform(({ value }: { value: unknown }) => trimString(value))
  relationship: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(EMERGENCY_PHONE_PATTERN, {
    message: 'phone must be a valid international or local phone number',
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  phone: string;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  email?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}
