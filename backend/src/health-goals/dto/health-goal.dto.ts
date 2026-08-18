import { Transform } from 'class-transformer';
import {
  HealthGoalDirection,
  HealthGoalMetric,
  HealthGoalStatus,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ISO_TIME_ZONE_SUFFIX_PATTERN } from '../../appointments/dto/appointment-date-validation';

const MAX_GOAL_VALUE = 1_000_000;

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimNullable(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class CreateHealthGoalDto {
  @ApiProperty({ example: 'Walk more each day' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Transform(({ value }: { value: unknown }) => trim(value))
  title: string;

  @ApiProperty({ enum: HealthGoalMetric })
  @IsEnum(HealthGoalMetric)
  metric: HealthGoalMetric;

  @ApiProperty({ enum: HealthGoalDirection })
  @IsEnum(HealthGoalDirection)
  direction: HealthGoalDirection;

  @ApiProperty({ example: 8_000 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.000001)
  @Max(MAX_GOAL_VALUE)
  targetValue: number;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.000001)
  @Max(MAX_GOAL_VALUE)
  targetSecondaryValue?: number | null;

  @ApiProperty({ example: 'steps' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Transform(({ value }: { value: unknown }) => trim(value))
  unit: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN)
  startDate: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN)
  targetDate?: string | null;
}

export class UpdateHealthGoalDto extends PartialType(CreateHealthGoalDto) {
  @ApiPropertyOptional({ enum: HealthGoalStatus })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HealthGoalStatus)
  status?: HealthGoalStatus;
}

export class CreateHealthGoalProgressDto {
  @ApiProperty({ example: 7_500 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(MAX_GOAL_VALUE)
  value: number;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(MAX_GOAL_VALUE)
  secondaryValue?: number | null;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN)
  recordedAt: string;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(1_000)
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  note?: string | null;
}

export class HealthGoalQueryDto {
  @ApiPropertyOptional({ enum: HealthGoalStatus })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HealthGoalStatus)
  status?: HealthGoalStatus;

  @ApiPropertyOptional({ enum: HealthGoalMetric })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HealthGoalMetric)
  metric?: HealthGoalMetric;
}
