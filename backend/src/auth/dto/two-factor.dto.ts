import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class VerifyTwoFactorLoginDto {
  @IsUUID('4')
  challengeId: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must contain exactly six digits' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  code: string;
}

export class TwoFactorPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  currentPassword: string;
}

export class ConfirmAuthenticatorSetupDto {
  @IsUUID('4')
  challengeId: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must contain exactly six digits' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  code: string;
}

export class DisableTwoFactorDto extends TwoFactorPasswordDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must contain exactly six digits' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  code?: string;
}
