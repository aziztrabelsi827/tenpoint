import { describe, expect, it } from "vitest";
import {
  calculateHabitPointsFromSnapshot,
  habitContribution,
  habitContributionFor,
  habitKindFor,
  hasRecordedProgress,
  resolveHabitSnapshot,
  scoreDay,
  taskContribution,
  type StoredHabitLog,
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

  it("treats a zero-progress row with a STALE snapshot as provisional (current config wins)", () => {
    // The day's row was created at count 0 carrying the OLD 0.5 max; the habit
    // has since been raised to 1.0. No real progress has been recorded yet, so
    // the current configuration must become the snapshot on first completion.
    const provisional: StoredHabitLog = {
      count: 0,
      points: 0,
      pointValueAtRecord: 0.5,
      targetCountAtRecord: 10,
      kindAtRecord: "positive",
    };
    const snap = resolveHabitSnapshot(
      { pointValue: 1, targetCount: 10, kind: "positive" },
      provisional,
    );
    expect(snap).toEqual({ weight: 1, target: 10, kind: "positive", isNewRecord: true });
  });

  it("treats a zero-progress LEGACY row as provisional too", () => {
    const provisional: StoredHabitLog = {
      count: 0,
      points: 0,
      pointValueAtRecord: null,
      targetCountAtRecord: null,
      kindAtRecord: null,
    };
    const snap = resolveHabitSnapshot({ pointValue: 3, targetCount: 2, kind: "negative" }, provisional);
    expect(snap).toEqual({ weight: 3, target: 2, kind: "negative", isNewRecord: true });
  });

  it("keeps the stored snapshot for a row with real recorded progress", () => {
    const recorded: StoredHabitLog = {
      count: 10,
      points: 0.5,
      pointValueAtRecord: 0.5,
      targetCountAtRecord: 10,
      kindAtRecord: "positive",
    };
    const snap = resolveHabitSnapshot(
      { pointValue: 1, targetCount: 10, kind: "positive" },
      recorded,
    );
    expect(snap).toEqual({ weight: 0.5, target: 10, kind: "positive", isNewRecord: false });
  });

  it("flags only real progress as recorded", () => {
    expect(hasRecordedProgress({ count: 1 })).toBe(true);
    expect(hasRecordedProgress({ count: 0 })).toBe(false);
    expect(hasRecordedProgress(null)).toBe(false);
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

  it("treats a recorded zero as provisional, not a frozen historical record", () => {
    // The day's row carries a stale 2-pt snapshot but NO real progress yet. The
    // day resolves against the current configuration (still 0 at count 0), so
    // nothing about the value is immutable history.
    const logs: HabitLogMap = {
      "1": { "2026-08-28": { count: 0, points: 0, pointValueAtRecord: 2, targetCountAtRecord: 5 } },
    };
    const r = scoreDay({ ...base, habits: [habit()], habitLogs: logs }, "2026-08-28", weekdayOf);
    expect(r.habitRows[0].historical).toBe(false);
    // Participation is preserved — the habit was toggled that day.
    expect(r.habitRows[0].scheduled).toBe(true);
    // The current configuration drives the day, not the stale snapshot.
    expect(r.habitRows[0].pointValue).toBe(2);
    expect(r.habitRows[0].target).toBe(5);
    expect(r.rating).toBe(0);
  });

  it("shows the CURRENT weight/target for a provisional zero-progress row", () => {
    // The row carries a stale 0.5 max from before the user raised the habit to
    // 1.0 (target 10) — but nothing real was recorded. Today must reflect the
    // new configuration, so the "available" and target shown are not obsolete.
    const logs: HabitLogMap = {
      "1": { "2026-08-28": { count: 0, points: 0, pointValueAtRecord: 0.5, targetCountAtRecord: 10 } },
    };
    const nowOne = habit({ id: 1, pointValue: 1, targetCount: 10 });
    const r = scoreDay({ ...base, habits: [nowOne], habitLogs: logs }, "2026-08-28", weekdayOf);
    expect(r.habitRows[0].pointValue).toBe(1);
    expect(r.habitRows[0].target).toBe(10);
    expect(r.habitRows[0].contribution).toBe(0);
    expect(r.habitRows[0].historical).toBe(false);
    expect(r.habitAvailable).toBe(1);
  });

  it("repeated habit at 10 reps: resolving a provisional day after a config change yields the NEW max", () => {
    // Day started with a stale 0.5 max snapshot (a zero-progress provisional
    // row). The user raises the max to 1.0 and completes. The WRITE path
    // resolves the provisional row against the CURRENT configuration, so the
    // day pays: 0/10 -> 0, 5/10 -> 0.5, 10/10 -> 1.0.
    const provisional: StoredHabitLog = {
      count: 0,
      points: 0,
      pointValueAtRecord: 0.5,
      targetCountAtRecord: 10,
      kindAtRecord: "positive",
    };
    const snap = resolveHabitSnapshot({ pointValue: 1, targetCount: 10, kind: "positive" }, provisional);
    expect(snap).toEqual({ weight: 1, target: 10, kind: "positive", isNewRecord: true });
    expect(calculateHabitPointsFromSnapshot(0, snap)).toBe(0);
    expect(calculateHabitPointsFromSnapshot(5, snap)).toBe(0.5);
    expect(calculateHabitPointsFromSnapshot(10, snap)).toBe(1);
  });

  it("recorded days stay frozen; provisional day follows the new config", () => {
    const today = "2026-08-28";
    const yesterday = "2026-08-27";
    const changed = habit({ id: 1, pointValue: 1, targetCount: 10 });
    const logs: HabitLogMap = {
      "1": {
        // Yesterday was genuinely recorded at 5/10 while the max was 0.5: +0.25,
        // immutably frozen even though the habit now pays 1.0.
        [yesterday]: {
          count: 5,
          points: 0.25,
          pointValueAtRecord: 0.5,
          targetCountAtRecord: 10,
          kindAtRecord: "positive",
        },
        // Today's row only has a stale 0.5 snapshot, but the user then completed
        // 10/10 under the new 1.0 max: +1.0.
        [today]: {
          count: 10,
          points: 1,
          pointValueAtRecord: 1,
          targetCountAtRecord: 10,
          kindAtRecord: "positive",
        },
      },
    };
    const y = scoreDay({ ...base, today, habits: [changed], habitLogs: logs }, yesterday, weekdayOf);
    expect(y.habits).toBe(0.25);
    expect(y.habitRows[0].historical).toBe(true);

    const t = scoreDay({ ...base, today, habits: [changed], habitLogs: logs }, today, weekdayOf);
    expect(t.habits).toBe(1);
  });

  it("habitContributionFor/habitKindFor ignore a provisional row's stale data", () => {
    const logs: HabitLogMap = {
      "1": { "2026-08-28": { count: 0, points: 0, pointValueAtRecord: 0.5, targetCountAtRecord: 10 } },
    };
    const nowOne = habit({ id: 1, pointValue: 1, targetCount: 10, kind: "positive" });
    expect(habitContributionFor(nowOne, logs, "2026-08-28", "2026-08-28")).toBe(0);
    expect(habitKindFor(nowOne, logs, "2026-08-28", "2026-08-28")).toBe("positive");
  });
});
