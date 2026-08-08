import { HealthAlertSeverity } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  MAX_ALERT_THRESHOLD,
  MIN_ALERT_THRESHOLD,
} from './create-alert-rule.dto';

export class UpdateAlertRuleDto {
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_ALERT_THRESHOLD)
  @Max(MAX_ALERT_THRESHOLD)
  minimumValue?: number | null;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_ALERT_THRESHOLD)
  @Max(MAX_ALERT_THRESHOLD)
  maximumValue?: number | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(2)
  @Max(100)
  consecutiveReadingsRequired?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HealthAlertSeverity)
  severity?: HealthAlertSeverity;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  notifyEmergencyContacts?: boolean;
}
