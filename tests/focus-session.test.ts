import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clampPlannedSeconds,
  MAX_SESSION_SECONDS,
  pauseSeconds,
  plannedEnd,
  resumeEndsAt,
  runningRemainingSeconds,
} from "@/lib/focus-session";
import { focusSessionStatus } from "@/lib/types";

const T0 = Date.parse("2026-09-14T08:00:00.000Z");
const MINUTE = 60;
const HOUR = 60 * 60;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("focus session countdown (absolute endsAt)", () => {
  it("clamps the planned length to [1, 3 hours]", () => {
    expect(clampPlannedSeconds(0)).toBe(1);
    expect(clampPlannedSeconds(-5)).toBe(1);
    expect(clampPlannedSeconds(25)).toBe(25);
    expect(clampPlannedSeconds(25.6)).toBe(26);
    expect(clampPlannedSeconds(MAX_SESSION_SECONDS + 1)).toBe(MAX_SESSION_SECONDS);
    expect(clampPlannedSeconds(Number.NaN)).toBe(1);
  });

  it("derives remaining time from endsAt and the wall clock, never a tick count", () => {
    const endsAt = new Date(T0 + 5 * MINUTE * 1000).toISOString();
    // Half the session in: 150s left.
    expect(runningRemainingSeconds(endsAt, T0 + 150_000)).toBe(150);
    // Backgrounded past the end: reads as 0 (into negative territory, clamped).
    expect(runningRemainingSeconds(endsAt, T0 + 6 * MINUTE * 1000)).toBe(0);
  });

  it("ceil()s partial seconds so exactly-at-end finalizes, not earlier", () => {
    const endsAt = new Date(T0 + 90_000).toISOString();
    expect(runningRemainingSeconds(endsAt, T0 + 89_999)).toBe(1);
    expect(runningRemainingSeconds(endsAt, T0 + 90_000)).toBe(0);
  });

  it("pauses a running session to the frozen remaining seconds", () => {
    const endsAt = new Date(T0 + 5 * MINUTE * 1000).toISOString();
    expect(pauseSeconds(endsAt, T0 + 60_000, 5 * MINUTE)).toEqual({ kind: "paused", seconds: 240 });
  });

  it("never lets a pause exceed the planned length", () => {
    const endsAt = new Date(T0 + 5 * MINUTE * 1000).toISOString();
    expect(pauseSeconds(endsAt, T0, 120)).toEqual({ kind: "paused", seconds: 120 });
    expect(pauseSeconds(endsAt, T0, 3 * MINUTE)).toEqual({ kind: "paused", seconds: 3 * MINUTE });
  });

  it("treats pausing at the exact end as expired so it finalizes", () => {
    const endsAt = new Date(T0 + 5 * MINUTE * 1000).toISOString();
    expect(pauseSeconds(endsAt, T0 + 5 * MINUTE * 1000, 5 * MINUTE)).toEqual({ kind: "expired" });
    expect(pauseSeconds(endsAt, T0 + 10 * MINUTE * 1000, 5 * MINUTE)).toEqual({ kind: "expired" });
  });

  it("resume pins a fresh absolute endsAt from the frozen remaining seconds", () => {
    const resumed = resumeEndsAt(90, T0);
    expect(Date.parse(resumed) - T0).toBe(90_000);
  });

  it("a completed-but-never-stopped session ends exactly at its planned length", () => {
    const started = new Date(T0).toISOString();
    const end = plannedEnd(25 * MINUTE, started);
    expect(Date.parse(end) - T0).toBe(25 * MINUTE * 1000);
  });

  it("survives a multi-day background gap without drift", () => {
    // Start 08:00 for 25 minutes (ends 08:25)…
    const endsAt = plannedEnd(25 * MINUTE, new Date(T0).toISOString());
    // …phone locked until 14:00 — still exactly 0 left, no accumulated error.
    expect(runningRemainingSeconds(endsAt, T0 + 6 * HOUR * 1000)).toBe(0);
  });
});

describe("focusSessionStatus (persisted row is the source of truth)", () => {
  it("is idle with no session or a completed session", () => {
    expect(focusSessionStatus(null)).toBe("idle");
    expect(focusSessionStatus({ completed: true, endsAt: "x", remainingSeconds: null })).toBe("idle");
  });

  it("is running while endsAt is set, paused while it is frozen", () => {
    expect(
      focusSessionStatus({ completed: false, endsAt: new Date(T0 + 1000).toISOString(), remainingSeconds: null }),
    ).toBe("running");
    expect(focusSessionStatus({ completed: false, endsAt: null, remainingSeconds: 60 })).toBe("paused");
  });

  it("ignores a stale endsAt once completed", () => {
    expect(
      focusSessionStatus({ completed: true, endsAt: new Date(T0 + 1000).toISOString(), remainingSeconds: null }),
    ).toBe("idle");
  });

  it("derives the timer display exactly from that status", () => {
    const session = {
      completed: false,
      endsAt: new Date(T0 + 90_000).toISOString(),
      remainingSeconds: null,
    };
    const status = focusSessionStatus(session);
    expect(status).toBe("running");
    const shown =
      status === "running" && session.endsAt
        ? runningRemainingSeconds(session.endsAt, T0 + 60_000)
        : 0;
    // After one minute of real elapsed time, the app shows 30s — no local
    // counter that could have been suspended was involved.
    expect(shown).toBe(30);
  });
});