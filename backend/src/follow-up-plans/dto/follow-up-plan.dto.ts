import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { FollowUpPlanStatus, FollowUpTaskStatus } from '@prisma/client';

import { ISO_TIME_ZONE_SUFFIX_PATTERN } from '../../appointments/dto/appointment-date-validation';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimNullable(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class CreateFollowUpTaskDto {
  @ApiProperty({ maxLength: 240, example: 'Review the latest activity log' })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Transform(({ value }: { value: unknown }) => trim(value))
  title: string;

  @ApiPropertyOptional({ maxLength: 2_000, nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(2_000)
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  notes?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN, {
    message: 'dueAt must include Z or an explicit UTC offset',
  })
  dueAt?: string | null;
}

export class CreateFollowUpPlanDto {
  @ApiProperty({ maxLength: 160, example: 'Review activity and sleep routine' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Transform(({ value }: { value: unknown }) => trim(value))
  title: string;

  @ApiPropertyOptional({ maxLength: 5_000, nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(5_000)
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  notes?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN, {
    message: 'nextReviewAt must include Z or an explicit UTC offset',
  })
  nextReviewAt?: string | null;

  @ApiPropertyOptional({ enum: FollowUpPlanStatus, default: 'ACTIVE' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(FollowUpPlanStatus)
  status?: FollowUpPlanStatus;

  @ApiPropertyOptional({ type: [CreateFollowUpTaskDto], maxItems: 50 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateFollowUpTaskDto)
  tasks?: CreateFollowUpTaskDto[];
}

export class UpdateFollowUpPlanDto extends PartialType(
  OmitType(CreateFollowUpPlanDto, ['tasks'] as const),
) {}

export class UpdateFollowUpTaskDto extends PartialType(CreateFollowUpTaskDto) {
  @ApiPropertyOptional({ enum: FollowUpTaskStatus })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(FollowUpTaskStatus)
  status?: FollowUpTaskStatus;
}
