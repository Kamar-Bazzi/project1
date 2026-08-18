import { Transform } from 'class-transformer';
import { DoctorNoteCategory } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ISO_TIME_ZONE_SUFFIX_PATTERN } from '../../appointments/dto/appointment-date-validation';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimNullable(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class CreateDoctorNoteDto {
  @ApiProperty({ example: 'Medication review' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Transform(({ value }: { value: unknown }) => trim(value))
  title: string;

  @ApiProperty({
    example: 'Reviewed adherence and discussed the current care plan.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  @Transform(({ value }: { value: unknown }) => trim(value))
  content: string;

  @ApiPropertyOptional({ enum: DoctorNoteCategory, default: 'GENERAL' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(DoctorNoteCategory)
  category?: DoctorNoteCategory;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsUUID('4')
  appointmentId?: string | null;
}

export class UpdateDoctorNoteDto extends PartialType(CreateDoctorNoteDto) {}

export class CreatePatientFollowUpDto {
  @ApiProperty({
    example: 'Patient reported following the agreed care instructions.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  @Transform(({ value }: { value: unknown }) => trim(value))
  summary: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 10_000 })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(10_000)
  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  recommendations?: string | null;

  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN, {
    message: 'occurredAt must include Z or an explicit UTC offset',
  })
  occurredAt: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN, {
    message: 'followUpAt must include Z or an explicit UTC offset',
  })
  followUpAt?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsUUID('4')
  appointmentId?: string | null;
}
