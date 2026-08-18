import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsIn, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum MedicalHistoryEventType {
  MEDICATION = 'MEDICATION',
  MEDICATION_LOG = 'MEDICATION_LOG',
  MEASUREMENT = 'MEASUREMENT',
  WEARABLE_METRIC = 'WEARABLE_METRIC',
  HEALTH_ALERT = 'HEALTH_ALERT',
  APPOINTMENT = 'APPOINTMENT',
  DOCTOR_NOTE = 'DOCTOR_NOTE',
  FOLLOW_UP = 'FOLLOW_UP',
}

export class MedicalHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: [7, 30, 90], default: 30 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsIn([7, 30, 90])
  period = 30;

  @ApiPropertyOptional({
    enum: MedicalHistoryEventType,
    isArray: true,
    description: 'Comma-separated event types',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsEnum(MedicalHistoryEventType, { each: true })
  types?: MedicalHistoryEventType[];
}
