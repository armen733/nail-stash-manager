const TZ = 'America/Los_Angeles';

/** Format a UTC date string to YYYY-MM-DD in LA timezone */
export function toLocalDateStr(utcDateStr: string): string {
  const d = new Date(utcDateStr);
  return d.toLocaleDateString('en-CA', { timeZone: TZ }); // en-CA gives YYYY-MM-DD
}

/** Get today's date as YYYY-MM-DD in LA timezone */
export function todayLocalStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Get the day of week (0=Sun) for a UTC date in LA timezone */
export function getLocalDay(utcDateStr: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).formatToParts(new Date(utcDateStr));
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}

/** Format a Date to a display string in LA timezone */
export function formatLocalDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('en-US', { timeZone: TZ, ...options });
}

/** Convert a YYYY-MM-DD string to a Date at midnight LA time (approximate for iteration) */
export function dateFromLocalStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
