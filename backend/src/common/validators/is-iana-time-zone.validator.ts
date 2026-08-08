import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const DEFAULT_TIME_ZONE = 'UTC';
export const MAX_TIME_ZONE_LENGTH = 100;

export function canonicalizeIanaTimeZone(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TIME_ZONE_LENGTH
  ) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function isIanaTimeZone(value: unknown): value is string {
  return canonicalizeIanaTimeZone(value) !== null;
}

@ValidatorConstraint({ name: 'isIanaTimeZone', async: false })
export class IsIanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isIanaTimeZone(value);
  }

  defaultMessage(): string {
    return 'timeZone must be a valid IANA timezone';
  }
}
