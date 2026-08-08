import { Transform, Type } from 'class-transformer';
import { HealthMetricType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  Validate,
  ValidateIf,
} from 'class-validator';

import {
  HEALTH_TIMESTAMP_PATTERN,
  IsZonedHealthDateTimeConstraint,
} from './health-metric-validation';

export class HealthMetricsQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HealthMetricType)
  metricType?: HealthMetricType;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(HEALTH_TIMESTAMP_PATTERN, {
    message: 'from must include seconds and Z or an explicit UTC offset',
  })
  @Validate(IsZonedHealthDateTimeConstraint)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  from?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(HEALTH_TIMESTAMP_PATTERN, {
    message: 'to must include seconds and Z or an explicit UTC offset',
  })
  @Validate(IsZonedHealthDateTimeConstraint)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  to?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
