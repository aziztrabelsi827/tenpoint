import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertTaskProgress } from "@/lib/task-progress";
import type { TaskStatus } from "@/lib/types";

/**
 * FOCUS -> TIME-MEASURED TASK — the single shared completion write.
 *
 * Used by BOTH the legacy `POST /api/focus` and the active-session lifecycle
 * route (`/api/focus/session`, action "complete") so a finished focus block
 * always feeds the linked time-measured task exactly the same way:
 *
 *  - progress is added for the SAME local calendar day the session belongs to,
 *  - points are computed from the write-once snapshot (never re-derived from a
 *    changed task configuration),
 *  - a `todo` task is best-effort flipped to `in_progress` (never `completed`).
 *
 * Returns `null` when the session is not focus-mode, has no linked task, or the
 * task is not time-measured.
 */
export async function applyFocusToTask(
  supabase: SupabaseClient,
  userId: string,
  taskId: number | null,
  mode: string,
  seconds: number,
  day: string,
): Promise<{ progress: number; points: number } | null> {
  if (mode !== "focus" || !Number.isFinite(taskId) || (taskId ?? 0) <= 0) return null;

  const { data: task, error: taskReadError } = await supabase
    .from("tasks")
    .select("id, status, measure_type, target_value, max_points")
    .eq("id", taskId)
    .eq("user_id", userId)
    .single();

  if (taskReadError || !task || task.measure_type !== "time") return null;

  const minutes = Math.max(1, Math.round(seconds / 60));

  const result = await upsertTaskProgress(
    supabase,
    userId,
    taskId!,
    day,
    minutes,
    {
      measureType: "time",
      targetValue: Number(task.target_value),
      unit: "",
      maxPoints: Number(task.max_points),
      status: task.status as TaskStatus,
    },
    { additive: true },
  );

  // Secondary best-effort status flip (todo -> in_progress); not a hard
  // requirement on the saved session.
  await supabase
    .from("tasks")
    .update({ status: task.status === "todo" ? "in_progress" : task.status })
    .eq("id", taskId)
    .eq("user_id", userId);

  return result;
}