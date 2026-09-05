export const DAY_MS = 86400000;

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_MIN = ["S", "M", "T", "W", "T", "F", "S"];
export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Calendar-key arithmetic.
 *
 * These functions operate on "YYYY-MM-DD" strings ONLY. They use the UTC
 * accessors purely as a date arithmetic engine — a key never represents an
 * instant, so there is no timezone to get wrong here.
 *
 * Deriving "today" from the clock is deliberately NOT in this module. Use
 * `todayInZone(tz)` from `@/lib/timezone` so the user's local calendar date is
 * respected. See `src/lib/timezone.ts`.
 */
export function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(key: string, n: number): string {
  return dayKey(new Date(fromKey(key).getTime() + n * DAY_MS));
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromKey(a).getTime() - fromKey(b).getTime()) / DAY_MS);
}

export function weekdayOf(key: string): number {
  return fromKey(key).getUTCDay();
}

export function isPast(key: string, today: string): boolean {
  return diffDays(key, today) < 0;
}

export function isFuture(key: string, today: string): boolean {
  return diffDays(key, today) > 0;
}

/** Monday-first start of the ISO week containing `key`. */
export function startOfWeek(key: string): string {
  const wd = weekdayOf(key);
  const shift = (wd + 6) % 7;
  return addDays(key, -shift);
}

export function endOfWeek(key: string): string {
  return addDays(startOfWeek(key), 6);
}

export function startOfMonth(key: string): string {
  const d = fromKey(key);
  return dayKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

export function endOfMonth(key: string): string {
  const d = fromKey(key);
  return dayKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(key);
  return dayKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
}

export function rangeKeys(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  let cur = startKey;
  let guard = 0;
  while (diffDays(cur, endKey) <= 0 && guard < 3000) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

/** Last `n` days ending at `endKey` (inclusive). Pass an explicit end date. */
export function lastNDays(n: number, endKey: string): string[] {
  return rangeKeys(addDays(endKey, -(n - 1)), endKey);
}

export function formatLong(key: string): string {
  const d = fromKey(key);
  return `${WEEKDAY_SHORT[d.getUTCDay()]}, ${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatMedium(key: string): string {
  const d = fromKey(key);
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatShort(key: string): string {
  const d = fromKey(key);
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function monthLabel(key: string): string {
  const d = fromKey(key);
  return `${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Greeting for a local hour (0–23). Compute the hour with `hourInZone`. */
export function greetingForHour(hour: number): string {
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function clampClock(value: number): string {
  return `${Math.max(0, value).toString().padStart(2, "0")}`;
}

export function secondsToClock(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${clampClock(Math.floor(s / 60))}:${clampClock(s % 60)}`;
}
