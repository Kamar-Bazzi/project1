import { Transform } from 'class-transformer';
import { IsDateString, Matches } from 'class-validator';

import { ISO_TIME_ZONE_SUFFIX_PATTERN } from './appointment-date-validation';

export class AvailableSlotQueryDto {
  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: 'from must be a valid ISO 8601 date' },
  )
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN, {
    message: 'from must include Z or an explicit UTC offset',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  from: string;

  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: 'to must be a valid ISO 8601 date' },
  )
  @Matches(ISO_TIME_ZONE_SUFFIX_PATTERN, {
    message: 'to must include Z or an explicit UTC offset',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  to: string;
}
