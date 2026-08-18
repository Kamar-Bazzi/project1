import { Transform } from 'class-transformer';
import { IsBoolean, IsUUID, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateAssignmentDto {
  @IsUUID('4')
  doctorId: string;

  @IsUUID('4')
  patientId: string;
}

export class AssignmentQueryDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  doctorId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  patientId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;
}
