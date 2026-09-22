import { Transform } from 'class-transformer';
import { MedicationLogStatus, MedicationStatus } from '@prisma/client';
import { IsEnum, IsString, MaxLength, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class MedicationQueryDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(MedicationStatus)
  status?: MedicationStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(MedicationLogStatus)
  doseStatus?: MedicationLogStatus;
}
