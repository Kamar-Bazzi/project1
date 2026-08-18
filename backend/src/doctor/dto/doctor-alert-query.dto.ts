import {
  HealthAlertSeverity,
  HealthAlertStatus,
  HealthMetricType,
} from '@prisma/client';
import { IsEnum, IsUUID, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class DoctorAlertQueryDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  patientId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HealthAlertStatus)
  status?: HealthAlertStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HealthAlertSeverity)
  severity?: HealthAlertSeverity;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(HealthMetricType)
  metricType?: HealthMetricType;
}
