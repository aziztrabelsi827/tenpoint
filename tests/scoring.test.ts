import { describe, expect, it } from "vitest";
import {
  calculateHabitPointsFromSnapshot,
  habitContribution,
  resolveHabitSnapshot,
  scoreDay,
  taskContribution,
} from "@/lib/scoring";
import type { HabitDTO, HabitLogMap, TaskDTO, TaskProgressMap } from "@/lib/types";

const weekdayOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

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
/* Habit contribution                                                  */
/* ------------------------------------------------------------------ */

describe("habitContribution (live, current configuration)", () => {
  it("gives full weight at 100% completion", () => {
    expect(habitContribution(habit({ pointValue: 2, targetCount: 5 }), 5)).toBe(2);
  });

  it("gives proportional credit for partial completion", () => {
    expect(habitContribution(habit({ pointValue: 2, targetCount: 5 }), 4)).toBe(1.6);
    expect(habitContribution(habit({ pointValue: 2, targetCount: 3 }), 2)).toBe(1.33);
  });

  it("returns 0 for no completions", () => {
    expect(habitContribution(habit(), 0)).toBe(0);
  });

  it("never exceeds the configured weight on over-completion", () => {
    expect(habitContribution(habit({ pointValue: 2, targetCount: 5 }), 9)).toBe(2);
  });

  it("treats negative habits as occurrences × penalty", () => {
    const neg = habit({ kind: "negative", pointValue: 0.5, targetCount: 1 });
    expect(habitContribution(neg, 2)).toBe(-1);
    expect(habitContribution(neg, 0)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Snapshot resolution                                                 */
/* ------------------------------------------------------------------ */

describe("resolveHabitSnapshot", () => {
  it("uses the stored snapshot when one exists", () => {
    const snap = resolveHabitSnapshot(
      { pointValue: 1, targetCount: 3, kind: "negative" },
      { count: 4, points: 1.6, pointValueAtRecord: 2, targetCountAtRecord: 5, kindAtRecord: "positive" },
    );
    expect(snap.weight).toBe(2);
    expect(snap.target).toBe(5);
    expect(snap.kind).toBe("positive");
    expect(snap.isNewRecord).toBe(false);
  });

  it("flags a legacy row so its points are preserved verbatim", () => {
    const snap = resolveHabitSnapshot(
      { pointValue: 1, targetCount: 3, kind: "negative" },
      { count: 4, points: 1.6, pointValueAtRecord: null, targetCountAtRecord: null, kindAtRecord: null },
    );
    expect(snap.legacyPreservePoints).toBe(1.6);
    expect(snap.isNewRecord).toBe(false);
  });

  it("captures the current configuration for a brand-new day", () => {
    const snap = resolveHabitSnapshot({ pointValue: 3, targetCount: 2, kind: "positive" }, null);
    expect(snap).toEqual({ weight: 3, target: 2, kind: "positive", isNewRecord: true });
  });
});

describe("calculateHabitPointsFromSnapshot", () => {
  it("positive: min(1, count/target) × weight", () => {
    expect(calculateHabitPointsFromSnapshot(3, { weight: 2, target: 5, kind: "positive" })).toBe(1.2);
    expect(calculateHabitPointsFromSnapshot(5, { weight: 2, target: 5, kind: "positive" })).toBe(2);
    expect(calculateHabitPointsFromSnapshot(7, { weight: 2, target: 5, kind: "positive" })).toBe(2);
    expect(calculateHabitPointsFromSnapshot(0, { weight: 2, target: 5, kind: "positive" })).toBe(0);
  });

  it("negative: count × penalty", () => {
    expect(calculateHabitPointsFromSnapshot(2, { weight: 0.5, target: 1, kind: "negative" })).toBe(-1);
    expect(calculateHabitPointsFromSnapshot(3, { weight: 0.5, target: 1, kind: "negative" })).toBe(-1.5);
  });
});

/* ------------------------------------------------------------------ */
/* Task contribution                                                   */
/* ------------------------------------------------------------------ */

describe("taskContribution", () => {
  it("is proportional to progress against the target", () => {
    const t = task({ targetValue: 120, maxPoints: 1 });
    expect(taskContribution(t, 0)).toBe(0);
    expect(taskContribution(t, 30)).toBe(0.25);
    expect(taskContribution(t, 60)).toBe(0.5);
    expect(taskContribution(t, 90)).toBe(0.75);
    expect(taskContribution(t, 120)).toBe(1);
  });

  it("never exceeds the fixed maximum reward", () => {
    expect(taskContribution(task({ targetValue: 120, maxPoints: 1 }), 180)).toBe(1);
    expect(taskContribution(task({ targetValue: 120, maxPoints: 1 }), 9999)).toBe(1);
  });

  it("handles completion-measured tasks", () => {
    const t = task({ measureType: "completion", targetValue: 1, maxPoints: 0.5 });
    expect(taskContribution(t, 0)).toBe(0);
    expect(taskContribution(t, 1)).toBe(0.5);
  });
});

/* ------------------------------------------------------------------ */
/* scoreDay                                                            */
/* ------------------------------------------------------------------ */

describe("scoreDay", () => {
  const base = {
    habits: [] as HabitDTO[],
    habitLogs: {} as HabitLogMap,
    tasks: [] as TaskDTO[],
    taskProgress: {} as TaskProgressMap,
    today: "2026-08-28",
  };

  it("clamps the rating to 0–10", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      habit({ id: i + 1, pointValue: 3, targetCount: 1 }),
    );
    const r = scoreDay({ ...base, habits: many }, "2026-08-28", weekdayOf);
    expect(r.rating).toBeLessThanOrEqual(10);
    expect(r.rating).toBeGreaterThanOrEqual(0);
  });

  it("never returns a negative rating", () => {
    const neg = habit({ id: 1, kind: "negative", pointValue: 5, targetCount: 1 });
    const logs: HabitLogMap = { "1": { "2026-08-28": { count: 4, points: -20 } } };
    const r = scoreDay({ ...base, habits: [neg], habitLogs: logs }, "2026-08-28", weekdayOf);
    expect(r.rating).toBe(0);
    expect(r.penalties).toBe(20);
  });

  it("combines habits + tasks − penalties", () => {
    const h = habit({ id: 1, pointValue: 2, targetCount: 5 });
    const logs: HabitLogMap = { "1": { "2026-08-28": { count: 4, points: 1.6 } } };
    const t = task({ id: 10, targetValue: 120, maxPoints: 1 });
    const progress: TaskProgressMap = {
      "10": { "2026-08-28": { progress: 60, points: 0.5 } },
    };
    const r = scoreDay(
      { ...base, habits: [h], habitLogs: logs, tasks: [t], taskProgress: progress },
      "2026-08-28",
      weekdayOf,
    );
    expect(r.habits).toBe(1.6);
    expect(r.tasks).toBe(0.5);
    expect(r.penalties).toBe(0);
    expect(r.rating).toBe(2.1);
  });

  it("uses the stored snapshot even when the habit configuration has changed", () => {
    // Day recorded when Prayer was 5 reps @ 2 pts, 4 completed = +1.6.
    const logs: HabitLogMap = {
      "1": {
        "2026-08-28": {
          count: 4,
          points: 1.6,
          pointValueAtRecord: 2,
          targetCountAtRecord: 5,
          kindAtRecord: "positive",
        },
      },
    };
    // The habit is NOW negative, 3 target, 1 point, and disabled.
    const changed = habit({ kind: "negative", pointValue: 1, targetCount: 3, enabled: false, days: [1] });
    const r = scoreDay({ ...base, habits: [changed], habitLogs: logs }, "2026-08-28", weekdayOf);

    expect(r.habits).toBe(1.6);
    expect(r.rating).toBe(1.6);
    expect(r.penalties).toBe(0);
  });

  it("shows the recorded target, not the current one", () => {
    const logs: HabitLogMap = {
      "1": { "2026-08-28": { count: 4, points: 1.6, targetCountAtRecord: 5, pointValueAtRecord: 2 } },
    };
    const changed = habit({ targetCount: 3 });
    const r = scoreDay({ ...base, habits: [changed], habitLogs: logs }, "2026-08-28", weekdayOf);
    expect(r.habitRows[0].target).toBe(5);
    expect(r.habitRows[0].pointValue).toBe(2);
  });

  it("counts a recorded day even when the habit is disabled or unscheduled", () => {
    const logs: HabitLogMap = { "1": { "2026-08-28": { count: 3, points: 1.2 } } };
    const disabled = habit({ enabled: false, days: [1] }); // 2026-08-28 is a Friday
    const r = scoreDay({ ...base, habits: [disabled], habitLogs: logs }, "2026-08-28", weekdayOf);
    expect(r.habits).toBe(1.2);
    expect(r.habitRows[0].scheduled).toBe(true);
  });

  it("ignores unscheduled habits with no record", () => {
    const h = habit({ days: [1] }); // Friday not included
    const r = scoreDay({ ...base, habits: [h] }, "2026-08-28", weekdayOf);
    expect(r.habits).toBe(0);
    expect(r.habitRows[0].scheduled).toBe(false);
  });

  it("treats a recorded zero as a record, not a missing day", () => {
    const logs: HabitLogMap = {
      "1": { "2026-08-28": { count: 0, points: 0, pointValueAtRecord: 2, targetCountAtRecord: 5 } },
    };
    const r = scoreDay({ ...base, habits: [habit()], habitLogs: logs }, "2026-08-28", weekdayOf);
    expect(r.habitRows[0].historical).toBe(true);
    expect(r.rating).toBe(0);
  });
});
