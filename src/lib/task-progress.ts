import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateTaskPointsFromSnapshot, type TaskConfig } from "@/lib/scoring";
import { TASK_PROGRESS_LIMIT, type TaskMeasureType, type TaskStatus } from "@/lib/types";

export { calculateTaskPointsFromSnapshot };

/**
 * TASK-PROGRESS SNAPSHOTS — single shared write path.
 * ===================================================
 *
 * A task-progress log records one task/day. When it is FIRST created it stores
 * the task configuration (target, reward, measure type, unit) that produced the
 * points. Those snapshot columns are WRITE-ONCE: editing a task's target,
 * reward or measure type later must never rewrite what an already-recorded day
 * earned. Subsequent edits to the same day recompute points ONLY from the stored
 * snapshot.
 *
 * Source-of-truth rule for a task/day:
 *   1. existing row WITH snapshot  -> stored snapshot is authoritative
 *   2. existing row WITHOUT (legacy)-> points_earned is authoritative & FROZEN
 *   3. no row                      -> current task config becomes the snapshot
 *
 * Both /api/tasks and /api/focus route here so the two write paths can never
 * disagree about a day's earned points.
 */

export type StoredTaskProgress = {
  id: number;
  progress: number;
  pointsEarned: number;
  targetValueAtRecord: number | null;
  maxPointsAtRecord: number | null;
  measureTypeAtRecord: string | null;
  unitAtRecord: string | null;
};

export type TaskSnapshotConfig = {
  measureType: TaskMeasureType;
  targetValue: number;
  unit: string;
  maxPoints: number;
};

export type TaskProgressResolution =
  | { kind: "snapshot"; config: TaskSnapshotConfig } // stored snapshot is authoritative
  | { kind: "legacy" } // existing pre-snapshot row: points are frozen
  | { kind: "new" }; // no row yet: current config becomes the snapshot

/**
 * Pure resolver. Testable in isolation and identical for /api/tasks and
 * /api/focus.
 */
export function resolveTaskProgressSnapshot(
  existing: StoredTaskProgress | null,
): TaskProgressResolution {
  if (existing && existing.targetValueAtRecord != null) {
    const kind = existing.measureTypeAtRecord;
    return {
      kind: "snapshot",
      config: {
        measureType:
          kind === "time" || kind === "quantity" || kind === "count" ? kind : "completion",
        targetValue: Number(existing.targetValueAtRecord),
        maxPoints: Number(existing.maxPointsAtRecord ?? 0),
        unit: existing.unitAtRecord ?? "",
      },
    };
  }
  if (existing) return { kind: "legacy" };
  return { kind: "new" };
}

export type UpsertTaskProgressOptions = {
  /** When true, `progress` is a positive delta ADDED to any existing progress (timer mode). */
  additive?: boolean;
  /** When true, keep the task's status coherent with the target (tasks route). */
  cohereStatus?: boolean;
};

export type UpsertTaskProgressResult = {
  progress: number;
  points: number;
  snapshot: boolean;
  legacy: boolean;
};

export type WriteTaskProgressInput = TaskConfig & { status?: TaskStatus };

/**
 * Loads (or creates) the task-progress log for a task/day and applies a new
 * progress value, computing points ONLY from the authoritative configuration
 * (stored snapshot, frozen legacy points, or newly-captured current config).
 * Snapshot columns are written once and never overwritten.
 */
export async function upsertTaskProgress(
  supabase: SupabaseClient,
  userId: string,
  taskId: number,
  day: string,
  progress: number,
  live: WriteTaskProgressInput,
  opts: UpsertTaskProgressOptions = {},
): Promise<UpsertTaskProgressResult> {
  const { data: existing, error: readError } = await supabase
    .from("task_progress_logs")
    .select(
      "id, progress, points_earned, target_value_at_record, max_points_at_record, measure_type_at_record, unit_at_record",
    )
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (readError) throw new Error(`Failed to read task progress: ${readError.message}`);

  const stored: StoredTaskProgress | null = existing
    ? {
        id: Number(existing.id),
        progress: Number(existing.progress ?? 0),
        pointsEarned: Number(existing.points_earned ?? 0),
        targetValueAtRecord: existing.target_value_at_record == null ? null : Number(existing.target_value_at_record),
        maxPointsAtRecord: existing.max_points_at_record == null ? null : Number(existing.max_points_at_record),
        measureTypeAtRecord: existing.measure_type_at_record == null ? null : String(existing.measure_type_at_record),
        unitAtRecord: existing.unit_at_record == null ? null : String(existing.unit_at_record),
      }
    : null;

  const resolution = resolveTaskProgressSnapshot(stored);

  const effective = opts.additive
    ? Math.min(TASK_PROGRESS_LIMIT, Math.max(0, (stored?.progress ?? 0) + progress))
    : Math.max(0, Math.min(TASK_PROGRESS_LIMIT, Math.round(progress * 100) / 100));

  // ---- determine points from the authoritative configuration ----
  let points: number;
  if (resolution.kind === "legacy") {
    // Section 9: an existing pre-snapshot row's points are authoritative and
    // FROZEN. Never reinterpret history from today's settings — not even to zero.
    points = stored!.pointsEarned;
  } else if (resolution.kind === "snapshot") {
    points = calculateTaskPointsFromSnapshot(effective, resolution.config);
  } else {
    points = calculateTaskPointsFromSnapshot(effective, live);
  }

  // ---- keep task status coherent with the target ----
  if (opts.cohereStatus) {
    const cfg = resolution.kind === "snapshot" ? resolution.config : live;
    const target = cfg.measureType === "completion" ? 1 : Math.max(0.000001, cfg.targetValue || 1);
    const reachedTarget = effective > 0 && effective >= target;
    let nextStatus: TaskStatus = live.status ?? "todo";
    if (reachedTarget && live.status !== "completed") nextStatus = "completed";
    else if (!reachedTarget && live.status === "completed") nextStatus = "in_progress";
    if (nextStatus !== live.status) {
      const { error: statusError } = await supabase
        .from("tasks")
        .update({
          status: nextStatus,
          completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", taskId)
        .eq("user_id", userId);
      if (statusError) throw new Error(`Failed to update task status: ${statusError.message}`);
    }
  }

  // ---- write the row (write-once snapshots) ----
  if (stored) {
    const patch: Record<string, unknown> = { progress: effective };
    if (resolution.kind !== "legacy") patch.points_earned = points;
    const { error: updateError } = await supabase
      .from("task_progress_logs")
      .update(patch)
      .eq("id", stored.id)
      .eq("user_id", userId);
    if (updateError) throw new Error(`Failed to update task progress: ${updateError.message}`);
  } else if (effective > 0) {
    // A recorded zero is only meaningful for an existing row; a brand-new row is
    // created only when real progress exists, capturing the current config.
    const { error: insertError } = await supabase.from("task_progress_logs").insert({
      user_id: userId,
      task_id: taskId,
      day,
      progress: effective,
      points_earned: points,
      target_value_at_record: live.targetValue,
      max_points_at_record: live.maxPoints,
      measure_type_at_record: live.measureType,
      unit_at_record: live.unit,
    });
    if (insertError) throw new Error(`Failed to write task progress: ${insertError.message}`);
  }

  return {
    progress: effective,
    points,
    snapshot: resolution.kind === "snapshot",
    legacy: resolution.kind === "legacy",
  };
}
