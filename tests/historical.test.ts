import { describe, expect, it } from "vitest";
import {
  habitContributionFor,
  habitDayCounts,
  habitKindFor,
  scoreDay,
  taskAppliesTo,
  taskContributionFor,
} from "@/lib/scoring";
import type { HabitDTO, HabitLogMap, TaskDTO, TaskProgressMap } from "@/lib/types";

const weekdayOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const today = "2026-08-28";

const habit = (over: Partial<HabitDTO> = {}): HabitDTO => ({
  id: 1,
  name: "Prayer",
  slug: "prayer",
  icon: "🕌",
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
/* Historical task contributions are frozen at record time             */
/* ------------------------------------------------------------------ */

describe("taskContributionFor (historical immutability)", () => {
  it("returns the stored snapshot even when the target and reward changed", () => {
    const progress: TaskProgressMap = {
      "10": { "2026-08-20": { progress: 120, points: 1 } }, // recorded under old config
    };
    // Now the task is harder (target 240) and worth more (max 2).
    const changed = { measureType: "time" as const, targetValue: 240, unit: "", maxPoints: 2 };
    expect(taskContributionFor(changed, 10, progress, "2026-08-20", today)).toBe(1);
  });

  it("returns zero for an unrecorded day (no snapshot, no progress)", () => {
    const progress: TaskProgressMap = {
      "10": { "2026-08-20": { progress: 120, points: 1 } },
    };
    const cfg = { measureType: "time" as const, targetValue: 240, unit: "", maxPoints: 2 };
    // '2026-08-28' has no recorded progress, so nothing is attributed to it.
    expect(taskContributionFor(cfg, 10, progress, "2026-08-28", today)).toBe(0);
  });
});

describe("taskAppliesTo (no contamination of past ratings)", () => {
  const progress: TaskProgressMap = {
    "10": { "2026-08-20": { progress: 120, points: 1 } },
  };

  it("applies a dated task only on its scheduled day", () => {
    const dated = task({ day: "2026-08-21" });
    expect(taskAppliesTo(dated, "2026-08-21", progress)).toBe(true);
    expect(taskAppliesTo(dated, "2026-08-20", progress)).toBe(false);
  });

  it("applies an undated task only to days that actually recorded progress", () => {
    const undated = task({ day: null });
    expect(taskAppliesTo(undated, "2026-08-20", progress)).toBe(true);
    expect(taskAppliesTo(undated, "2026-08-28", progress)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Historical habit kinds/contributions are frozen at record time      */
/* ------------------------------------------------------------------ */

describe("habit historical resolution", () => {
  const logs: HabitLogMap = {
    "1": {
      "2026-08-20": {
        count: 4,
        points: 1.6,
        pointValueAtRecord: 2,
        targetCountAtRecord: 5,
        kindAtRecord: "positive",
      },
    },
  };

  it("keeps the recorded kind even if the habit is now negative", () => {
    const nowNegative = habit({ kind: "negative", pointValue: 1 });
    expect(habitKindFor(nowNegative, logs, "2026-08-20", today)).toBe("positive");
  });

  it("uses the stored contribution on a recorded day", () => {
    const changed = habit({ pointValue: 0.1, targetCount: 1 });
    expect(habitContributionFor(changed, logs, "2026-08-20", today)).toBe(1.6);
  });

  it("falls back to the habit's current kind on an unrecorded day", () => {
    expect(habitKindFor(habit({ kind: "negative" }), logs, "2026-08-28", today)).toBe("negative");
  });

  it("exposes per-day counts", () => {
    expect(habitDayCounts(logs, 1)).toEqual({ "2026-08-20": 4 });
  });
});

/* ------------------------------------------------------------------ */
/* scoreDay: over-configuration and recorded contributions             */
/* ------------------------------------------------------------------ */

describe("scoreDay remaining guarantees", () => {
  const base = {
    habits: [] as HabitDTO[],
    habitLogs: {} as HabitLogMap,
    tasks: [] as TaskDTO[],
    taskProgress: {} as TaskProgressMap,
    today,
  };

  it("flags over-configuration when configured positive weight exceeds 10", () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      habit({ id: i + 1, pointValue: 2, targetCount: 1 }),
    );
    const r = scoreDay({ ...base, habits: six }, today, weekdayOf);
    expect(r.habitAvailable).toBe(12);
    expect(r.overConfigured).toBe(true);
  });

  it("does not flag over-configuration for exactly 10 configured points", () => {
    // Five habit rows at 2 pts each total exactly 10 available weight. Nothing
    // is completed here, so the rating is 0 — but the availability is not
    // over-configured.
    const five = Array.from({ length: 5 }, (_, i) =>
      habit({ id: i + 1, pointValue: 2, targetCount: 1 }),
    );
    const r = scoreDay({ ...base, habits: five }, today, weekdayOf);
    expect(r.habitAvailable).toBe(10);
    expect(r.overConfigured).toBe(false);
    expect(r.rating).toBe(0);
  });

  it("never lets a capitalised negative day drop the rating below zero", () => {
    const logs: HabitLogMap = {
      "1": { [today]: { count: 10, points: -30 } },
    };
    const r = scoreDay(
      { ...base, habits: [habit({ id: 1, kind: "negative", pointValue: 5 })], habitLogs: logs },
      today,
      weekdayOf,
    );
    expect(r.penalties).toBe(30);
    expect(r.rating).toBe(0);
  });
});
