/**
 * Timezone strategy
 * =================
 *
 * The application must distinguish between:
 *   - an instant in time (a Date, always absolute)
 *   - a calendar date such as "2026-08-27" (local to a human)
 *
 * "Today" means the user's LOCAL calendar date, derived from an IANA timezone
 * such as Africa/Tunis, Europe/Paris, America/New_York or Asia/Kuala_Lumpur.
 *
 * UTC is used only for:
 *   - database timestamps (createdAt, completedAt)
 *   - internal arithmetic on calendar-date keys (which never represents an
 *     instant in user-facing terms)
 *
 * Never use `new Date().toISOString().slice(0, 10)` for local "today" — that is
 * a UTC conversion and is wrong around midnight in most timezones.
 */

import { dayKey } from "@/lib/dates";

/** Used when the user's timezone is genuinely unknown. */
export const DEFAULT_TIMEZONE = "Etc/UTC";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const cache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = cache.get(timeZone);
  if (cached) return cached;
  try {
    // en-CA formats dates as YYYY-MM-DD, which is exactly the key format we use.
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    cache.set(timeZone, fmt);
    return fmt;
  } catch {
    return null;
  }
}

/** True when the string is a valid IANA timezone identifier. */
export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== "string") return false;
  if (tz === DEFAULT_TIMEZONE) return true;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Normalises a stored timezone, falling back when it is unusable. */
export function normaliseTimezone(tz: string | null | undefined): string {
  return isValidTimezone(tz) ? (tz as string) : DEFAULT_TIMEZONE;
}

/** The browser's IANA timezone, or null when unavailable (SSR, old browsers). */
export function detectTimezone(): string | null {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") return null;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(tz) ? tz : null;
  } catch {
    return null;
  }
}

/**
 * The calendar date of an instant, expressed in the given timezone.
 * This is the ONLY sanctioned way to turn "now" into a day key.
 */
export function dayKeyInZone(instant: Date, timeZone: string): string {
  const fmt = zoneFormatter(timeZone);
  if (fmt) {
    const formatted = fmt.format(instant);
    if (KEY_RE.test(formatted)) return formatted;
  }
  // Unreachable for a validated timezone; keep UTC as a last resort so callers
  // always receive a well-formed key.
  return dayKey(instant);
}

/** The user's local "today" as a YYYY-MM-DD key. */
export function todayInZone(timeZone: string, instant: Date = new Date()): string {
  return dayKeyInZone(instant, timeZone);
}

/** Minutes since local midnight in the given timezone (for the "now" line). */
export function minutesInZone(instant: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(instant);
    const [h, m] = parts.split(":").map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
  } catch {
    /* fall through */
  }
  return instant.getUTCHours() * 60 + instant.getUTCMinutes();
}

/**
 * A short label for the user's timezone, e.g. "CET", "CEST", "GMT+1".
 * Never hard-code "GMT" — the calendar shows the user's local schedule.
 */
export function timezoneLabel(timeZone: string, instant: Date = new Date()): string {
  try {
    const long = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "short",
    }).format(instant);
    const match = /\b([A-Z]{2,5}|GMT[+-]\d{1,2}(?::?\d{2})?)\b/.exec(long);
    if (match) return match[1];
  } catch {
    /* fall through */
  }
  return timeZone;
}

/** A human-readable timezone offset, e.g. "UTC+01:00". */
export function timezoneOffsetLabel(timeZone: string, instant: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "longOffset",
    }).format(instant);
    const match = /(GMT[+-][0-9]{2}:[0-9]{2})/.exec(parts);
    if (match) return match[1].replace("GMT", "UTC");
  } catch {
    /* fall through */
  }
  return "";
}

/** Local hour (0–23) in the given timezone — used for the greeting. */
export function hourInZone(instant: Date, timeZone: string): number {
  return Math.floor(minutesInZone(instant, timeZone) / 60);
}

/** Common timezones offered in Settings. */
export const TIMEZONE_CHOICES = [
  "Africa/Tunis",
  "Africa/Cairo",
  "Europe/Paris",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Asia/Kuala_Lumpur",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Etc/UTC",
];
