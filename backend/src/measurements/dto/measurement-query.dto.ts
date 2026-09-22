import { MeasurementType } from '@prisma/client';
import { IsDateString, IsEnum, Matches, ValidateIf } from 'class-validator';

import { ISO_TIME_ZONE_SUFFIX_PATTERN } from '../../appointments/dto/appointment-date-validation';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class MeasurementQueryDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(MeasurementType)
  type?: MeasurementType;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN)
  from?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN)
  to?: string;
}
