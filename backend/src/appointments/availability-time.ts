interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export interface ZonedMinuteParts extends ZonedDateTimeParts {
  dateKey: string;
  dayOfWeek: number;
  minuteOfDay: number;
}

export function zonedMinuteParts(
  instant: Date,
  timeZone: string,
): ZonedMinuteParts {
  const parts = zonedParts(instant, timeZone);
  const dateKey = dateKeyFromParts(parts);
  return {
    ...parts,
    dateKey,
    dayOfWeek: new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day),
    ).getUTCDay(),
    minuteOfDay: parts.hour * 60 + parts.minute,
  };
}

export function localMinuteToUtc(
  dateKey: string,
  minuteOfDay: number,
  timeZone: string,
): Date | null {
  const [year, month, day] = dateKey.split('-').map(Number);
  const intendedLocalEpoch = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
  );
  const possibleOffsets = new Set<number>();

  for (const hoursFromGuess of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = new Date(
      intendedLocalEpoch + hoursFromGuess * 60 * 60 * 1_000,
    );
    possibleOffsets.add(timeZoneOffsetAt(sample, timeZone));
  }

  const exact = [...possibleOffsets]
    .map((offset) => new Date(intendedLocalEpoch - offset))
    .filter(
      (candidate) =>
        localEpochFromParts(zonedParts(candidate, timeZone)) ===
        intendedLocalEpoch,
    )
    .sort((first, second) => first.getTime() - second.getTime())[0];

  // A local minute can be absent during a daylight-saving gap. It is not a
  // bookable slot; an ambiguous repeated minute consistently uses its first
  // occurrence so the API never returns duplicate-looking wall times.
  return exact ?? null;
}

export function addLocalDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function zonedParts(instant: Date, timeZone: string): ZonedDateTimeParts {
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

function timeZoneOffsetAt(instant: Date, timeZone: string): number {
  const representedLocalEpoch = localEpochFromParts(
    zonedParts(instant, timeZone),
  );
  const wholeSecondInstant = Math.floor(instant.getTime() / 1_000) * 1_000;
  return representedLocalEpoch - wholeSecondInstant;
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
