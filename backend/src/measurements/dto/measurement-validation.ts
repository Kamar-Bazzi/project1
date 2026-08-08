import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const MIN_MEASUREMENT_VALUE = 0.01;
export const MAX_MEASUREMENT_VALUE = 1_000_000;
export const ISO_TIME_ZONE_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_CALENDAR_DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T/;

@ValidatorConstraint({ name: 'isMeasurementDateNotInFuture', async: false })
export class IsMeasurementDateNotInFutureConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const dateParts = ISO_CALENDAR_DATE_PREFIX_PATTERN.exec(value);
    if (!dateParts) {
      return false;
    }

    const year = Number(dateParts[1]);
    const month = Number(dateParts[2]);
    const day = Number(dateParts[3]);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    const timestamp = Date.parse(value);

    return (
      year >= 1900 &&
      calendarDate.getUTCFullYear() === year &&
      calendarDate.getUTCMonth() + 1 === month &&
      calendarDate.getUTCDate() === day &&
      !Number.isNaN(timestamp) &&
      timestamp <= Date.now()
    );
  }

  defaultMessage(arguments_: ValidationArguments): string {
    return `${arguments_.property} must be a real timestamp from 1900 through now`;
  }
}
