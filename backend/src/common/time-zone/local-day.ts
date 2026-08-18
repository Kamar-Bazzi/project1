import {
  canonicalizeIanaTimeZone,
  DEFAULT_TIME_ZONE,
} from '../validators/is-iana-time-zone.validator';

interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface LocalDayUtcRange {
  timeZone: string;
  dateKey: string;
  start: Date;
  end: Date;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function getLocalDayUtcRange(
  instant: Date,
  requestedTimeZone: string | null | undefined,
): LocalDayUtcRange {
  const timeZone =
    canonicalizeIanaTimeZone(requestedTimeZone) ?? DEFAULT_TIME_ZONE;
  const dateKey = dateKeyFromParts(zonedDateTimeParts(instant, timeZone));
  const nextDateKey = addCalendarDays(dateKey, 1);

  return {
    timeZone,
    dateKey,
    start: zonedDateTimeToUtc(dateKey, timeZone),
    end: zonedDateTimeToUtc(nextDateKey, timeZone),
  };
}

function zonedDateTimeToUtc(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const intendedLocalEpoch = Date.UTC(year, month - 1, day);
  const possibleOffsets = new Set<number>();

  for (const hoursFromGuess of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = new Date(
      intendedLocalEpoch + hoursFromGuess * 60 * 60 * 1_000,
    );
    possibleOffsets.add(timeZoneOffsetAt(sample, timeZone));
  }

  const candidates = [...possibleOffsets].map((offset) => {
    const candidate = new Date(intendedLocalEpoch - offset);
    const representedLocalEpoch = localEpochFromParts(
      zonedDateTimeParts(candidate, timeZone),
    );
    return {
      candidate,
      localDifference: representedLocalEpoch - intendedLocalEpoch,
    };
  });
  const exact = candidates
    .filter(({ localDifference }) => localDifference === 0)
    .sort(
      (first, second) => first.candidate.getTime() - second.candidate.getTime(),
    )[0];
  if (exact) return exact.candidate;

  // A civil midnight can be absent when a jurisdiction advances its clock.
  // Use the first real instant after that gap, matching compatible civil-time
  // behavior while keeping the returned day window DST-safe.
  const afterGap = candidates
    .filter(({ localDifference }) => localDifference > 0)
    .sort(
      (first, second) =>
        first.localDifference - second.localDifference ||
        first.candidate.getTime() - second.candidate.getTime(),
    )[0];
  if (afterGap) return afterGap.candidate;

  throw new RangeError(`Unable to resolve local day in ${timeZone}`);
}

function timeZoneOffsetAt(instant: Date, timeZone: string): number {
  const representedLocalEpoch = localEpochFromParts(
    zonedDateTimeParts(instant, timeZone),
  );
  const wholeSecondInstant = Math.floor(instant.getTime() / 1_000) * 1_000;
  return representedLocalEpoch - wholeSecondInstant;
}

function zonedDateTimeParts(
  instant: Date,
  timeZone: string,
): ZonedDateTimeParts {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-iso8601', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }

  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function localEpochFromParts(parts: ZonedDateTimeParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

function dateKeyFromParts(parts: ZonedDateTimeParts): string {
  return [
    parts.year,
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
