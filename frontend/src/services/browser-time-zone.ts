export function getBrowserTimeZone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === "string" && timeZone ? timeZone : null;
  } catch {
    return null;
  }
}
