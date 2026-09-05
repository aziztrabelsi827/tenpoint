import { describe, it, expect } from "vitest";
import type { TaskDTO } from "@/lib/types";
import { scoreDay } from "@/lib/scoring";
import {
  calculateTaskPointsFromSnapshot,
  resolveTaskProgressSnapshot,
  type StoredTaskProgress,
} from "@/lib/task-progress";

/**
 * These unit tests cover the pure snapshot resolution + points formula that is
 * shared by /api/tasks and /api/focus. The DB-backed write path (upsert) is
 * covered by the integration suite (tested only against a live Supabase).
 */

const snapshotRow = (over: Partial<StoredTaskProgress> = {}): StoredTaskProgress => ({
  id: 1,
  progress: 60,
  pointsEarned: 0.5,
  targetValueAtRecord: 120,
  maxPointsAtRecord: 1,
  measureTypeAtRecord: "time",
  unitAtRecord: "",
  ...over,
});

describe("resolveTaskProgressSnapshot", () => {
  it("returns 'new' when no row exists (current config becomes the snapshot)", () => {
    expect(resolveTaskProgressSnapshot(null).kind).toBe("new");
  });

  it("returns 'snapshot' using the STORED configuration for a row that has one", () => {
    const res = resolveTaskProgressSnapshot(snapshotRow());
    expect(res.kind).toBe("snapshot");
    if (res.kind !== "snapshot") return;
    expect(res.config).toEqual({
      measureType: "time",
      targetValue: 120,
      maxPoints: 1,
      unit: "",
    });
  });

  it("returns 'legacy' for an existing row with no snapshot columns", () => {
    const res = resolveTaskProgressSnapshot(snapshotRow({ targetValueAtRecord: null }));
    expect(res.kind).toBe("legacy");
  });
});

describe("calculateTaskPointsFromSnapshot", () => {
  it("Study: 120-min target, 1 point, 60 min -> 0.5", () => {
    const snap = { measureType: "time" as const, targetValue: 120, maxPoints: 1 };
    expect(calculateTaskPointsFromSnapshot(60, snap)).toBe(0.5);
  });

  it("uses the snapshot target, never the current configuration (historical re-edit)", () => {
    // Day A recorded with target=240, reward=1.
    const storedSnap = { measureType: "time" as const, targetValue: 240, maxPoints: 1 };
    // Task was later edited to target=120, reward=1 (current config).
    const currentCfg = { measureType: "time" as const, targetValue: 120, maxPoints: 1 };

    const viaSnapshot = calculateTaskPointsFromSnapshot(60, storedSnap);
    const viaCurrent = calculateTaskPointsFromSnapshot(60, currentCfg);

    expect(viaSnapshot).toBe(0.25); // 60 / 240 × 1
    expect(viaCurrent).toBe(0.5); //   60 / 120 × 1
    expect(viaSnapshot).not.toBe(viaCurrent);
  });

  it("after a recorded zero, later progress uses the ORIGINAL snapshot", () => {
    // The zeroed row keeps its snapshot columns (write-once). Resolving it again
    // returns the same snapshot, so 60 min is scored 60/120×1 = 0.5 even after
    // the task configuration changed.
    const zeroedRow = snapshotRow({ progress: 0, pointsEarned: 0 });
    const res = resolveTaskProgressSnapshot(zeroedRow);
    expect(res.kind).toBe("snapshot");
    if (res.kind !== "snapshot") return;
    expect(calculateTaskPointsFromSnapshot(60, res.config)).toBe(0.5);
  });

  it("never exceeds the fixed snapshot maximum reward", () => {
    const snap = { measureType: "time" as const, targetValue: 120, maxPoints: 1 };
    expect(calculateTaskPointsFromSnapshot(240, snap)).toBe(1);
    expect(calculateTaskPointsFromSnapshot(9999, snap)).toBe(1);
  });

  it("completion tasks are 0-or-max", () => {
    const snap = { measureType: "completion" as const, targetValue: 1, maxPoints: 0.5 };
    expect(calculateTaskPointsFromSnapshot(0, snap)).toBe(0);
    expect(calculateTaskPointsFromSnapshot(1, snap)).toBe(0.5);
  });

  it("quantity/count tasks scale proportionally", () => {
    const snap = { measureType: "quantity" as const, targetValue: 100, maxPoints: 2 };
    expect(calculateTaskPointsFromSnapshot(50, snap)).toBe(1);
  });
});

describe("legacy task rows (source-of-truth rule)", () => {
  it("legacy rows resolve as 'legacy' so points stay authoritative, not reinterpreted", () => {
    // A pre-snapshot row: the application must never reconstruct its
    // historical configuration from today's settings. The resolver marks it
    // 'legacy'; the upsert then freezes its pointsEarned.
    const legacy = snapshotRow({
      targetValueAtRecord: null,
      maxPointsAtRecord: null,
      measureTypeAtRecord: null,
      unitAtRecord: null,
    });
    expect(resolveTaskProgressSnapshot(legacy).kind).toBe("legacy");
  });
});

describe("daily rating consistency for task snapshots", () => {
  it("a recorded day's points flow through scoreDay unchanged, regardless of current config", () => {
    const t = task({ id: 7, measureType: "time", targetValue: 120, maxPoints: 1 });
    const day = "2026-08-28";
    const weekdayOf = (key: string) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    };

    const score = scoreDay(
      {
        habits: [],
        habitLogs: {},
        tasks: [t],
        // Recorded: 60 min -> 0.5, with an explicit snapshot.
        taskProgress: {
          "7": {
            [day]: {
              progress: 60,
              points: 0.5,
              targetValueAtRecord: 120,
              maxPointsAtRecord: 1,
              measureTypeAtRecord: "time",
            },
          },
        },
        today: day,
      },
      day,
      weekdayOf,
    );

    const row = score.taskRows.find((r) => r.task.id === 7);
    expect(row?.contribution).toBe(0.5);
    expect(row?.progress).toBe(60);
    // Even if the task config were different, the recorded snapshot wins.
    expect(row?.historical).toBe(true);
  });
});

/** Minimal TaskDTO factory for scoring tests. */
const task = (over: Partial<TaskDTO> = {}): TaskDTO => ({
  id: 1,
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
