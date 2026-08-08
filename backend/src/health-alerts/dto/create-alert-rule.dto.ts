import { HealthAlertSeverity, HealthMetricType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  Validate,
  ValidateIf,
} from 'class-validator';

import { HasValidAlertThresholdsConstraint } from './alert-threshold-validation';

export const MIN_ALERT_THRESHOLD = -1_000_000_000;
export const MAX_ALERT_THRESHOLD = 1_000_000_000;

export class CreateAlertRuleDto {
  @IsEnum(HealthMetricType)
  @Validate(HasValidAlertThresholdsConstraint)
  metricType: HealthMetricType;

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
