import { Transform } from 'class-transformer';
import { Equals, IsString, Matches } from 'class-validator';

const SCHEDULED_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class MedicationScheduleDto {
  @IsString()
  @Matches(SCHEDULED_TIME_PATTERN, {
    message: 'scheduledTime must use 24-hour HH:mm format',
  })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  scheduledTime: string;

  @IsString()
  @Equals('DAILY', { message: 'frequency must be DAILY' })
  frequency: 'DAILY';
}
