import { CheckInMedicationAdherence } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertDailyCheckInDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  mood: number;

  @ApiProperty({ minimum: 0, maximum: 10 })
  @IsInt()
  @Min(0)
  @Max(10)
  painLevel: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  sleepQuality: number;

  @ApiProperty({ type: [String], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value
          .map((item: unknown) =>
            typeof item === 'string' ? item.trim() : item,
          )
          .filter((item) => item !== '')
      : value,
  )
  symptoms: string[];

  @ApiProperty({ minimum: 0, maximum: 1440 })
  @IsInt()
  @Min(0)
  @Max(1440)
  activityMinutes: number;

  @ApiProperty({ enum: CheckInMedicationAdherence })
  @IsEnum(CheckInMedicationAdherence)
  medicationAdherence: CheckInMedicationAdherence;

  @ApiPropertyOptional({ nullable: true, maxLength: 2_000 })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  })
  notes?: string | null;
}

export class CheckInHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}
