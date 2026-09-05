import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth";
import { upsertTaskProgress } from "@/lib/task-progress";
import { dayKeyInZone, normaliseTimezone } from "@/lib/timezone";
import type { FocusDTO, TaskStatus } from "@/lib/types";

const MODES = ["focus", "short_break", "long_break"];

type FocusRow = {
  id: number;
  mode: string;
  seconds: number;
  completed: boolean;
  habit_id: number | null;
  task_id: number | null;
  day: string;
  started_at: string | null;
};

/**
 * Records a focus session.
 *
 * `day` is the user's LOCAL calendar date, supplied by the client. When absent
 * the server derives it from the workspace's stored IANA timezone — never from
 * a UTC conversion.
 *
 * A focus session attached to a time-measured task adds real progress to that
 * task on that same day, without ever raising the task's fixed maximum reward.
 */
export async function POST(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as {
    mode?: string;
    seconds?: number;
    habitId?: number | null;
    taskId?: number | null;
    day?: string;
    startedAt?: string;
  };

  const seconds = Math.max(1, Math.min(60 * 180, Math.round(Number(body.seconds ?? 0))));
  const mode = MODES.includes(body.mode ?? "") ? (body.mode as string) : "focus";

  const { data: tzRow } = await supabase
    .from("user_settings")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const timezone = normaliseTimezone(tzRow?.timezone);

  /**
   * When the session actually started. Always resolved, so the stored day can
   * be derived from the authoritative instant rather than trusting the client.
   */
  const startedAtIso =
    typeof body.startedAt === "string" && !Number.isNaN(Date.parse(body.startedAt))
      ? new Date(body.startedAt)
      : new Date(Date.now() - seconds * 1000);

  /**
   * The calendar day is DERIVED from `startedAt` in the user's IANA timezone.
   *
   * A client-supplied `day` is never trusted over the timestamp: a session at
   * 23:30 local could otherwise be stored on the previous day while the calendar
   * renders it on the next, splitting the rating and the schedule apart.
   */
  const day = dayKeyInZone(startedAtIso, timezone);

  const { data: row, error } = await supabase
    .from("focus_sessions")
    .insert({
      user_id: userId,
      mode,
      seconds,
      completed: true,
      habit_id: body.habitId ?? null,
      task_id: body.taskId ?? null,
      day,
      started_at: startedAtIso.toISOString(),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Could not save the session." }, { status: 500 });

  const fRow = row as FocusRow;
  const session: FocusDTO = {
    id: fRow.id,
    mode: fRow.mode as FocusDTO["mode"],
    seconds: fRow.seconds,
    completed: fRow.completed,
    habitId: fRow.habit_id,
    taskId: fRow.task_id,
    day: fRow.day,
    startedAt: fRow.started_at,
  };

  // Timer -> time-measured task progress, on the same local day.
  let progressResult: { progress: number; points: number } | null = null;
  const taskId = Number(body.taskId);
  if (mode === "focus" && Number.isFinite(taskId) && taskId > 0) {
    const { data: task, error: taskReadError } = await supabase
      .from("tasks")
      .select("id, status, measure_type, target_value, max_points")
      .eq("id", taskId)
      .eq("user_id", userId)
      .single();
    if (taskReadError) {
      // The session itself saved fine; a task read failure isn't fatal to it.
      return NextResponse.json({ session, progress: null });
    }
    if (task && task.measure_type === "time") {
      const minutes = Math.max(1, Math.round(seconds / 60));

      // Task progress is written to the SAME locally-derived day as the session,
      // so the rating and the calendar can never disagree about which day a
      // focus session belongs to. The shared snapshot-aware upsert adds the
      // minutes and computes points from the stored snapshot (or captures the
      // current config for a brand-new day) — it never re-derives an existing
      // day's points from a changed task configuration.
      let result: { progress: number; points: number };
      try {
        result = await upsertTaskProgress(
          supabase,
          userId,
          taskId,
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
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Could not write task progress." },
          { status: 500 },
        );
      }

      const { error: statusUpdateError } = await supabase
        .from("tasks")
        .update({ status: task.status === "todo" ? "in_progress" : task.status })
        .eq("id", taskId)
        .eq("user_id", userId);
      if (statusUpdateError) {
        // Secondary best-effort status flip; not fatal to the saved session.
        progressResult = { progress: result.progress, points: result.points };
        return NextResponse.json({ session, progress: progressResult });
      }

      progressResult = { progress: result.progress, points: result.points };
    }
  }

  return NextResponse.json({ session, progress: progressResult });
}

export const dynamic = "force-dynamic";
