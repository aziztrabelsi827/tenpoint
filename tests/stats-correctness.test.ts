import { describe, expect, it } from "vitest";
import { allTimeTaskRows, habitComparison } from "@/lib/stats";
import type { HabitDTO, TaskDTO } from "@/lib/types";
import type { HabitLogMap, TaskProgressMap } from "@/lib/types";

const weekdayOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const today = "2026-08-28";

const habit = (over: Partial<HabitDTO> = {}): HabitDTO => ({
  id: 1,
  name: "Drink water",
  slug: "drink-water",
  icon: "💧",
  color: "#0ea5a4",
  description: "",
  kind: "positive",
  pointValue: 2,
  targetCount: 5,
  days: [],
  scheduleTimes: [],
  sortOrder: 0,
  enabled: true,
  ...over,
});

const task = (over: Partial<TaskDTO> = {}): TaskDTO => ({
  id: 10,
  title: "Study",
  notes: "",
  status: "todo",
  priority: "medium",
  category: "General",
  measureType: "time",
  targetValue: 120,
  unit: "",
  maxPoints: 1,
  day: null,
  startTime: null,
  endTime: null,
  habitId: null,
  createdAt: new Date().toISOString(),
  completedAt: null,
  ...over,
});

/* ------------------------------------------------------------------ */
/* habitComparison reads historical days from their STORED snapshot    */
/* (Phase 1.3 — same rule habitStats/scoreDay already apply)           */
/* ------------------------------------------------------------------ */

describe("habitComparison (snapshot-accurate historical rates)", () => {
  const base = () => {
    const logs: HabitLogMap = {
      "1": {
        "2026-08-20": { count: 2, points: 2, targetCountAtRecord: 3, kindAtRecord: "positive" },
      },
    };
    return { logs };
  };

  const ctxOf = (logs: HabitLogMap, over: Partial<HabitDTO> = {}) => ({
    habits: [habit(over)],
    habitLogs: logs,
    tasks: [],
    taskProgress: {},
    today,
  });

  it("uses the recorded target for a historical day even when the current target changed", () => {
    const { logs } = base();
    // Current config says 5/day, but 2026-08-20 was recorded when the target
    // was 3. The historical rate must stay frozen at the recorded target.
    const rows = habitComparison(ctxOf(logs, { targetCount: 5 }), ["2026-08-20"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe(3);
    expect(rows[0].occurrences).toBe(2);
    expect(rows[0].rate).toBe(Math.round((2 / 3) * 100));
  });

  it("keeps a habit typed negative on a recorded day even after it became positive", () => {
    const h = habit({ kind: "positive", targetCount: 4 });
    const logs: HabitLogMap = {
      "1": {
        "2026-08-20": { count: 2, points: -2, kindAtRecord: "negative", targetCountAtRecord: 3 },
      },
    };
    const rows = habitComparison(ctxOf(logs), ["2026-08-20"]);
    // Recorded days classified by their stored kind: negative days never add to
    // the target, so the "rate" is n/a and only occurrences are reported.
    expect(rows[0].target).toBe(0);
    expect(rows[0].occurrences).toBe(2);
  });

  it("falls back to the current configuration for a scheduled but unrecorded day", () => {
    const { logs } = base();
    const rows = habitComparison(ctxOf(logs, { targetCount: 5 }), ["2026-08-21"]);
    expect(rows[0].target).toBe(5);
    expect(rows[0].occurrences).toBe(0);
  });

  it("skips days that are neither scheduled by the current config nor recorded", () => {
    // Monday-only habit; 2026-08-21 is a Friday with no record => not counted.
    const friday = habitComparison(
      ctxOf({}, { days: [1], targetCount: 2 }),
      ["2026-08-21"],
    );
    expect(friday).toHaveLength(1);
    expect(friday[0].target).toBe(0);
    expect(friday[0].occurrences).toBe(0);
  });

  it("keeps a recorded day in the picture even after the schedule dropped it", () => {
    // Habit was Monday-only, but 2026-08-20 (Thursday) HAS a record written
    // when it was scheduled; it must still count rather than vanish.
    const logs: HabitLogMap = {
      "1": { "2026-08-20": { count: 1, points: 1, targetCountAtRecord: 2, kindAtRecord: "positive" } },
    };
    const rows = habitComparison(ctxOf(logs, { days: [1], targetCount: 2 }), ["2026-08-20"]);
    expect(rows[0].target).toBe(2);
    expect(rows[0].occurrences).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* allTimeTaskRows aggregates the ENTIRE progress history server-side  */
/* (Phase 1.4)                                                         */
/* ------------------------------------------------------------------ */

describe("allTimeTaskRows (full-history task rewards)", () => {
  it("sums recorded progress across every day, snapshot points included", () => {
    const t = task();
    const taskProgress: TaskProgressMap = {
      "10": {
        "2025-01-05": { progress: 60, points: 0 },
        "2026-08-20": { progress: 120, points: 1 },
      },
    };
    const ctx = { habits: [], habitLogs: {}, tasks: [t], taskProgress, today };
    const rows = allTimeTaskRows(ctx, ["2025-01-05", "2026-08-20"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].progress).toBe(180);
    expect(rows[0].earned).toBe(1);
    // Reward never exceeds the task's fixed maximum.
    expect(rows[0].ratio).toBe(1);
  });

  it("excludes tasks with no recorded progress and no single-day anchor", () => {
    const t = task({ id: 11, day: null });
    const ctx = {
      habits: [],
      habitLogs: {},
      tasks: [t],
      taskProgress: {},
      today,
    };
    expect(allTimeTaskRows(ctx, ["2026-08-20"])).toEqual([]);
  });

  it("keeps a one-off task whose anchor day falls inside the span", () => {
    const t = task({ id: 12, day: "2026-08-20", measureType: "completion", targetValue: 1, maxPoints: 0.5 });
    const taskProgress: TaskProgressMap = {
      "12": { "2026-08-20": { progress: 1, points: 0.5 } },
    };
    const ctx = { habits: [], habitLogs: {}, tasks: [t], taskProgress, today };
    const rows = allTimeTaskRows(ctx, ["2026-08-20"]);
    expect(rows.map((r) => r.task.id)).toEqual([12]);
    expect(rows[0].earned).toBe(0.5);
  });
});