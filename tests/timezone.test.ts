import { describe, expect, it } from "vitest";
import {
  dayKeyInZone,
  detectTimezone,
  isValidTimezone,
  minutesInZone,
  normaliseTimezone,
  todayInZone,
  timezoneLabel,
} from "@/lib/timezone";
import { formatPercent, formatPoints, formatRating, roundPoints } from "@/lib/format";
import { addDays, dayKey, diffDays, rangeKeys, startOfWeek, weekdayOf } from "@/lib/dates";

/* ------------------------------------------------------------------ */
/* Timezone helpers                                                    */
/* ------------------------------------------------------------------ */

describe("timezone helpers", () => {
  // 2026-08-28T22:30Z is 2026-08-28 23:30 in Africa/Tunis (UTC+1)
  // and 2026-08-29 07:30 in Asia/Tokyo (UTC+9).
  const instant = new Date("2026-08-28T22:30:00Z");

  it("derives the local calendar day in the given timezone", () => {
    expect(dayKeyInZone(instant, "Africa/Tunis")).toBe("2026-08-28");
    expect(dayKeyInZone(instant, "Asia/Tokyo")).toBe("2026-08-29");
    expect(dayKeyInZone(instant, "America/New_York")).toBe("2026-08-28");
  });

  it("produces different days across timezones at the same instant", () => {
    // 23:30 UTC is already the next day far east.
    const late = new Date("2026-08-28T23:30:00Z");
    expect(dayKeyInZone(late, "Africa/Tunis")).toBe("2026-08-29");
    expect(dayKeyInZone(late, "America/Los_Angeles")).toBe("2026-08-28");
  });

  it("computes local minutes since midnight", () => {
    expect(minutesInZone(instant, "Africa/Tunis")).toBe(23 * 60 + 30);
    expect(minutesInZone(instant, "Asia/Tokyo")).toBe(7 * 60 + 30);
  });

  it("validates IANA timezone identifiers", () => {
    expect(isValidTimezone("Africa/Tunis")).toBe(true);
    expect(isValidTimezone("Europe/Paris")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Not/A_Real_Zone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
  });

  it("normalises invalid timezones to a safe fallback", () => {
    expect(normaliseTimezone("Africa/Tunis")).toBe("Africa/Tunis");
    expect(normaliseTimezone("garbage")).toBe("Etc/UTC");
    expect(normaliseTimezone(undefined)).toBe("Etc/UTC");
  });

  it("derives today from a timezone rather than UTC", () => {
    // 23:59 UTC on the 28th is already the 29th in Tunis.
    const nearMidnight = new Date("2026-08-28T23:59:00Z");
    expect(todayInZone("Africa/Tunis", nearMidnight)).toBe("2026-08-29");
    expect(todayInZone("Etc/UTC", nearMidnight)).toBe("2026-08-28");
  });

  it("never returns a hard-coded GMT label", () => {
    expect(timezoneLabel("Africa/Tunis")).not.toBe("GMT");
    expect(timezoneLabel("Africa/Tunis")).toBeTruthy();
  });

  it("detects a browser timezone when available", () => {
    const tz = detectTimezone();
    // In Node the resolved timezone is always a valid IANA identifier.
    expect(tz === null || isValidTimezone(tz)).toBe(true);
  });
});

describe("timezone boundaries: DST and non-whole-hour offsets", () => {
  it("honours the half-hour offset (Asia/Kolkata, UTC+5:30)", () => {
    // 18:00Z is 23:30 IST (still the 28th); 18:45Z is 00:15 IST (the 29th).
    expect(dayKeyInZone(new Date("2026-08-28T18:00:00Z"), "Asia/Kolkata")).toBe("2026-08-28");
    expect(dayKeyInZone(new Date("2026-08-28T18:45:00Z"), "Asia/Kolkata")).toBe("2026-08-29");
  });

  it("honours the 30/45-minute offset (Australia/Lord_Howe, UTC+10:30)", () => {
    expect(dayKeyInZone(new Date("2026-08-28T13:00:00Z"), "Australia/Lord_Howe")).toBe("2026-08-28");
    expect(dayKeyInZone(new Date("2026-08-28T13:30:00Z"), "Australia/Lord_Howe")).toBe("2026-08-29");
  });

  it("derives the correct local day across the DST spring-forward gap", () => {
    // US DST starts 2026-03-08 at 02:00 local (2:00 -> 3:00). The skipped hour
    // must not shift the local calendar date.
    expect(dayKeyInZone(new Date("2026-03-08T06:59:00Z"), "America/New_York")).toBe("2026-03-08");
    expect(dayKeyInZone(new Date("2026-03-08T07:05:00Z"), "America/New_York")).toBe("2026-03-08");
    expect(dayKeyInZone(new Date("2026-03-09T05:00:00Z"), "America/New_York")).toBe("2026-03-09");
  });

  it("keeps the same local day across the DST fall-back repeated hour", () => {
    // US DST ends 2026-11-01 at 02:00 local (2:00 -> 1:00). 01:30 happens twice;
    // both instants still belong to the same local date.
    expect(dayKeyInZone(new Date("2026-11-01T05:30:00Z"), "America/New_York")).toBe("2026-11-01");
    expect(dayKeyInZone(new Date("2026-11-01T06:30:00Z"), "America/New_York")).toBe("2026-11-01");
  });
});

/* ------------------------------------------------------------------ */
/* Calendar-key arithmetic (pure YYYY-MM-DD math)                      */
/* ------------------------------------------------------------------ */

describe("calendar key arithmetic", () => {
  it("round-trips a key through a Date", () => {
    expect(dayKey(new Date(Date.UTC(2026, 7, 28)))).toBe("2026-08-28");
  });

  it("adds and diffs days", () => {
    expect(addDays("2026-08-28", 1)).toBe("2026-08-29");
    expect(addDays("2026-08-28", -1)).toBe("2026-08-27");
    expect(diffDays("2026-08-29", "2026-08-28")).toBe(1);
    expect(diffDays("2026-08-28", "2026-08-29")).toBe(-1);
  });

  it("rolls over month and year boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("computes the Monday-first week start", () => {
    // 2026-08-28 is a Friday; the Monday-first week starts on the 24th.
    expect(startOfWeek("2026-08-28")).toBe("2026-08-24");
    // A Sunday belongs to the previous Monday-first week.
    expect(startOfWeek("2026-08-30")).toBe("2026-08-24");
  });

  it("returns the correct weekday index", () => {
    expect(weekdayOf("2026-08-28")).toBe(5); // Friday
    expect(weekdayOf("2026-08-30")).toBe(0); // Sunday
  });

  it("builds an inclusive key range", () => {
    expect(rangeKeys("2026-08-28", "2026-08-30")).toEqual([
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Numeric formatting                                                  */
/* ------------------------------------------------------------------ */

describe("numeric formatting and precision", () => {
  it("formats points without trailing zeros", () => {
    expect(formatPoints(10)).toBe("10");
    expect(formatPoints(3.5)).toBe("3.5");
    expect(formatPoints(0.5)).toBe("0.5");
    expect(formatPoints(1.6)).toBe("1.6");
  });

  it("formats ratings on the 0–10 scale", () => {
    expect(formatRating(0)).toBe("0");
    expect(formatRating(7.5)).toBe("7.5");
    expect(formatRating(10)).toBe("10");
    expect(formatRating(12)).toBe("10"); // clamped for display
    expect(formatRating(-1)).toBe("0");
  });

  it("formats percentages with a decimal only when meaningful", () => {
    expect(formatPercent(0.775)).toBe("77.5%");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("rounds decimals to avoid floating-point drift", () => {
    expect(roundPoints(0.1 + 0.2)).toBe(0.3);
    expect(roundPoints(1 / 3)).toBe(0.33);
  });
});
