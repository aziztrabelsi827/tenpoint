import { describe, expect, it } from "vitest";
import { scoreDay, type ScoringContext } from "@/lib/scoring";
import { habitComparison } from "@/lib/stats";
import { isArchivedHabit, splitHabits } from "@/lib/types";
import type { HabitDTO, HabitLogMap } from "@/lib/types";

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
  weekdayTargets: [],
  days: [],
  scheduleTimes: ["08:30"],
  sortOrder: 0,
  enabled: true,
  archivedAt: null,
  ...over,
});

const ctx = (over: { habits?: HabitDTO[]; logs?: HabitLogMap } = {}): ScoringContext => ({
  habits: over.habits ?? [],
  habitLogs: over.logs ?? {},
  tasks: [],
  taskProgress: {},
  today: "2026-08-28",
});

describe("archive / delete behavior", () => {
  it("isArchivedHabit distinguishes active (NULL) from archived timestamps", () => {
    expect(isArchivedHabit({ archivedAt: null })).toBe(false);
    expect(isArchivedHabit({ archivedAt: "2026-08-10T00:00:00.000Z" })).toBe(true);
  });

  it("splitHabits separates active habits (current UI) from archived ones", () => {
    const active = habit({ id: 1 });
    const archived = habit({ id: 2, enabled: false, archivedAt: "2026-08-10T00:00:00.000Z" });
    const { active: a, archived: ar } = splitHabits([active, archived]);
    expect(a.map((h) => h.id)).toEqual([1]);
    expect(ar.map((h) => h.id)).toEqual([2]);
  });

  it("a deleted (archived) habit no longer appears in the current habit list", () => {
    const all = [habit({ id: 1 }), habit({ id: 2, enabled: false, archivedAt: "2026-08-10T00:00:00.000Z" })];
    const { active } = splitHabits(all);
    expect(active.find((h) => h.id === 2)).toBeUndefined();
  });

  it("historical records survive a habit's deletion", () => {
    const member = habit({
      id: 1,
      enabled: false,
      archivedAt: "2026-08-10T00:00:00.000Z",
    });
    const logs: HabitLogMap = {
      "1": {
        "2026-08-05": { count: 5, points: 2, pointValueAtRecord: 2, targetCountAtRecord: 5 },
      },
    };
    // The records still resolve even though the habit is archived.
    const day = scoreDay(ctx({ habits: [member], logs }), "2026-08-05", weekdayOf);
    expect(day.habits).toBe(2);
  });

  it("historical rating stays unchanged after deletion", () => {
    const member = habit({
      id: 1,
      enabled: false,
      archivedAt: "2026-08-10T00:00:00.000Z",
    });
    const logs: HabitLogMap = {
      "1": {
        "2026-08-05": { count: 5, points: 2, pointValueAtRecord: 2, targetCountAtRecord: 5 },
      },
    };
    const before = scoreDay(ctx({ habits: [habit({ id: 1 })], logs }), "2026-08-05", weekdayOf);
    const after = scoreDay(ctx({ habits: [member], logs }), "2026-08-05", weekdayOf);
    expect(after.rating).toBe(before.rating);
  });

  it("an archived habit does not contribute to future (unrecorded) days", () => {
    const archived = habit({
      id: 1,
      enabled: false,
      archivedAt: "2026-08-10T00:00:00.000Z",
      scheduleTimes: [],
    });
    const day = scoreDay(ctx({ habits: [archived] }), "2026-08-28", weekdayOf);
    expect(day.habits).toBe(0);
    expect(day.habitAvailable).toBe(0);
  });

  it("habit comparison excludes archived habits", () => {
    const archived = habit({
      id: 1,
      enabled: false,
      archivedAt: "2026-08-10T00:00:00.000Z",
    });
    const comparison = habitComparison(ctx({ habits: [archived] }), ["2026-08-01"]);
    expect(comparison).toEqual([]);
  });
});