const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/;

/**
 * Formats the calendar portion of an ISO date without allowing the viewer's
 * timezone to move it to the previous or next day.
 */
export function formatDateOnly(value: string): string {
  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return value;
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
