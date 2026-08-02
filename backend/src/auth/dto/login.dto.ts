import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }: { value: string }) =>
    value.trim().toLowerCase(),
  )
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}