import { Transform } from 'class-transformer';
import { AccountStatus } from '@prisma/client';
import { IsEnum, IsString, MaxLength, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AdminDoctorQueryDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;
}
