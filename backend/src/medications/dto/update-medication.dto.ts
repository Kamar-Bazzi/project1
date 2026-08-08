import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MedicationStatus } from '@prisma/client';

import { EndDateOnOrAfterStartDateConstraint } from './date-range.validator';
import { MedicationScheduleDto } from './medication-schedule.dto';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateMedicationDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => trimString(value))
  name?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => trimString(value))
  dosage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }) => trimString(value))
  instructions?: string | null;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'startDate must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true, strictSeparator: true })
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'endDate must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true, strictSeparator: true })
  @Validate(EndDateOnOrAfterStartDateConstraint)
  endDate?: string | null;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(MedicationStatus)
  status?: MedicationStatus;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ArrayUnique((schedule: MedicationScheduleDto) => schedule.scheduledTime, {
    message: 'scheduledTime values must be unique',
  })
  @ValidateNested({ each: true })
  @Type(() => MedicationScheduleDto)
  schedules?: MedicationScheduleDto[];
}
