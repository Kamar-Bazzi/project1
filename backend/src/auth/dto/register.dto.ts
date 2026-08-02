import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value.trim())
  name: string;

  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }: { value: string }) =>
    value.trim().toLowerCase(),
  )
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'Password must include uppercase, lowercase, and a number',
  })
  password: string;
}