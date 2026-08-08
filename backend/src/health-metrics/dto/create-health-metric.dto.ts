import { Transform } from 'class-transformer';
import { HealthMetricType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
} from 'class-validator';

import {
  HEALTH_TIMESTAMP_PATTERN,
  IsReasonableHealthMetricTimestampConstraint,
  IsSmallHealthMetadataObjectConstraint,
} from './health-metric-validation';

export class CreateHealthMetricDto {
  @IsEnum(HealthMetricType)
  metricType: HealthMetricType;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1_000_000)
  value: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-1_000_000)
  @Max(1_000_000)
  secondaryValue?: number | null;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  unit: string;

  @IsString()
  @Matches(HEALTH_TIMESTAMP_PATTERN, {
    message: 'measuredAt must include seconds and Z or an explicit UTC offset',
  })
  @Validate(IsReasonableHealthMetricTimestampConstraint)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  measuredAt: string;

  @IsOptional()
  @IsObject()
  @Validate(IsSmallHealthMetadataObjectConstraint)
  metadata?: Record<string, unknown> | null;
}

export class SyncHealthMetricItemDto extends CreateHealthMetricDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  externalRecordId?: string | null;
}
