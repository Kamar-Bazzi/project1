import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { HealthMetricType } from '@prisma/client';

export const HEALTH_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
export const MAX_SYNC_MEASUREMENTS = 100;
export const MAX_METADATA_BYTES = 2_048;
export const MAX_HISTORY_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;

export interface HealthMetricDefinition {
  unit: string;
  minimum: number;
  maximum: number;
}

export const HEALTH_METRIC_DEFINITIONS: Record<
  HealthMetricType,
  HealthMetricDefinition
> = {
  [HealthMetricType.HEART_RATE]: {
    unit: 'bpm',
    minimum: 20,
    maximum: 250,
  },
  [HealthMetricType.RESTING_HEART_RATE]: {
    unit: 'bpm',
    minimum: 20,
    maximum: 200,
  },
  [HealthMetricType.STEPS]: {
    unit: 'count',
    minimum: 0,
    maximum: 200_000,
  },
  [HealthMetricType.DISTANCE]: {
    unit: 'km',
    minimum: 0,
    maximum: 500,
  },
  [HealthMetricType.CALORIES]: {
    unit: 'kcal',
    minimum: 0,
    maximum: 20_000,
  },
  [HealthMetricType.SLEEP_DURATION]: {
    unit: 'min',
    minimum: 0,
    maximum: 1_440,
  },
  [HealthMetricType.BLOOD_OXYGEN]: {
    unit: '%',
    minimum: 50,
    maximum: 100,
  },
  [HealthMetricType.RESPIRATORY_RATE]: {
    unit: 'breaths/min',
    minimum: 4,
    maximum: 80,
  },
  [HealthMetricType.BODY_TEMPERATURE]: {
    unit: '°C',
    minimum: 25,
    maximum: 45,
  },
  [HealthMetricType.WEIGHT]: {
    unit: 'kg',
    minimum: 0.5,
    maximum: 1_000,
  },
};

function isRealZonedTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !HEALTH_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  const calendarMatch = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!calendarMatch) {
    return false;
  }

  const year = Number(calendarMatch[1]);
  const month = Number(calendarMatch[2]);
  const day = Number(calendarMatch[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const parsed = Date.parse(value);

  return (
    year >= 2000 &&
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() + 1 === month &&
    calendarDate.getUTCDate() === day &&
    Number.isFinite(parsed)
  );
}

@ValidatorConstraint({ name: 'isZonedHealthDateTime', async: false })
export class IsZonedHealthDateTimeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isRealZonedTimestamp(value);
  }

  defaultMessage(arguments_: ValidationArguments): string {
    return `${arguments_.property} must be a real ISO 8601 timestamp from 2000 onward and include Z or an explicit UTC offset`;
  }
}

@ValidatorConstraint({
  name: 'isReasonableHealthMetricTimestamp',
  async: false,
})
export class IsReasonableHealthMetricTimestampConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!isRealZonedTimestamp(value)) {
      return false;
    }

    return Date.parse(value) <= Date.now() + 5 * 60 * 1_000;
  }

  defaultMessage(arguments_: ValidationArguments): string {
    return `${arguments_.property} must not be more than five minutes in the future`;
  }
}

@ValidatorConstraint({ name: 'isSmallHealthMetadataObject', async: false })
export class IsSmallHealthMetadataObjectConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (
      value === undefined ||
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return value === undefined || value === null;
    }

    try {
      return (
        Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_METADATA_BYTES
      );
    } catch {
      return false;
    }
  }

  defaultMessage(arguments_: ValidationArguments): string {
    return `${arguments_.property} must be a JSON object no larger than ${MAX_METADATA_BYTES} bytes`;
  }
}
