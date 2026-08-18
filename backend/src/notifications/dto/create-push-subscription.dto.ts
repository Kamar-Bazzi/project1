import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  p256dh: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  auth: string;
}

export class CreatePushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  expirationTime?: string | null;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}
