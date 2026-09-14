import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth";
import { applyFocusToTask } from "@/lib/focus-progress";
import { dayKeyInZone, normaliseTimezone } from "@/lib/timezone";
import type { FocusDTO } from "@/lib/types";

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
  ends_at: string | null;
  remaining_seconds: number | null;
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

  /**
   * Links to a habit or task must resolve to a row the session user owns —
   * the `user_id` scoping lives purely in the application, so a foreign id is
   * dropped rather than persisted. A task link is reused below to add
   * time-measured progress.
   */
  let habitLink: number | null = null;
  if (body.habitId != null && Number.isFinite(Number(body.habitId))) {
    const hid = Math.round(Number(body.habitId));
    const { data: ownedHabit } = await supabase
      .from("habits")
      .select("id")
      .eq("id", hid)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownedHabit) habitLink = hid;
  }
  let taskLink: number | null = null;
  if (body.taskId != null && Number.isFinite(Number(body.taskId))) {
    const tid = Math.round(Number(body.taskId));
    const { data: ownedTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", tid)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownedTask) taskLink = tid;
  }

  const { data: row, error } = await supabase
    .from("focus_sessions")
    .insert({
      user_id: userId,
      mode,
      seconds,
      completed: true,
      habit_id: habitLink,
      task_id: taskLink,
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
    endsAt: fRow.ends_at,
    remainingSeconds: fRow.remaining_seconds,
  };

  // Timer -> time-measured task progress, on the same local day.
  try {
    const progress = await applyFocusToTask(supabase, userId, taskLink, mode, seconds, day);
    return NextResponse.json({ session, progress });
  } catch (err) {
    // The session itself saved fine; a task write failure isn't fatal to it.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not write task progress." },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
