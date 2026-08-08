import { Type } from 'class-transformer';
import { HealthAlertStatus, HealthMetricType } from '@prisma/client';
import { IsEnum, IsInt, Max, Min, ValidateIf } from 'class-validator';

export class HealthAlertQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HealthAlertStatus)
  status?: HealthAlertStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HealthMetricType)
  metricType?: HealthMetricType;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
