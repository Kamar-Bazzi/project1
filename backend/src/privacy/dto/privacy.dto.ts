import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ISO_TIME_ZONE_SUFFIX_PATTERN } from '../../appointments/dto/appointment-date-validation';

export enum PatientExportFormat {
  CSV = 'csv',
  JSON = 'json',
  PDF = 'pdf',
}

export enum PatientExportDataset {
  ALL = 'all',
  MEDICATIONS = 'medications',
  MEASUREMENTS = 'measurements',
  APPOINTMENTS = 'appointments',
  WEARABLE_DATA = 'wearable-data',
  ALERTS = 'alerts',
}

export class RequestPatientDataExportDto {
  @ApiProperty({ enum: PatientExportFormat })
  @IsEnum(PatientExportFormat)
  format: PatientExportFormat;

  @ApiProperty({
    enum: PatientExportDataset,
    default: PatientExportDataset.ALL,
  })
  @IsEnum(PatientExportDataset)
  dataset: PatientExportDataset;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Optional inclusive start timestamp for dated records.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN)
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Optional inclusive end timestamp for dated records.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN)
  to?: string;
}

export class RequestAccountDeletionDto {
  @ApiProperty({
    description: 'Current account password, used only for re-authentication.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({ enum: ['DELETE MY ACCOUNT'] })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsIn(['DELETE MY ACCOUNT'])
  confirmation: 'DELETE MY ACCOUNT';
}

export class CancelAccountDeletionDto {
  @ApiProperty({
    description: 'Current account password, used only for re-authentication.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  currentPassword: string;
}
