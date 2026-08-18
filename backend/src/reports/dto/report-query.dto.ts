import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';

import { ISO_TIME_ZONE_SUFFIX_PATTERN } from '../../appointments/dto/appointment-date-validation';

export enum ReportExportFormat {
  CSV = 'csv',
  PDF = 'pdf',
}

export enum ClinicalExportDataset {
  MEDICAL_HISTORY = 'medical-history',
  MEASUREMENTS = 'measurements',
  APPOINTMENTS = 'appointments',
  ADHERENCE = 'adherence',
  WEARABLES = 'wearables',
}

export class HealthReportQueryDto {
  @ApiPropertyOptional({ enum: [7, 30, 90], default: 30 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsIn([7, 30, 90])
  period = 30;
}

export class HealthReportExportQueryDto extends HealthReportQueryDto {
  @ApiProperty({ enum: ReportExportFormat })
  @IsEnum(ReportExportFormat)
  format: ReportExportFormat;
}

export class ClinicalExportQueryDto {
  @ApiProperty({ enum: ReportExportFormat })
  @IsEnum(ReportExportFormat)
  format: ReportExportFormat;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN)
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN)
  to?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required for doctors and administrators; forbidden for patients.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  patientId?: string;
}
