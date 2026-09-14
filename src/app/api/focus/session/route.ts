import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUserContext } from "@/lib/auth";
import { applyFocusToTask } from "@/lib/focus-progress";
import { clampPlannedSeconds, pauseSeconds, plannedEnd, resumeEndsAt } from "@/lib/focus-session";
import { dayKeyInZone, normaliseTimezone } from "@/lib/timezone";
import type { FocusDTO } from "@/lib/types";

const MODES: FocusDTO["mode"][] = ["focus", "short_break", "long_break"];

type SessionRow = {
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

function toDTO(row: SessionRow): FocusDTO {
  return {
    id: row.id,
    mode: (MODES.includes(row.mode as FocusDTO["mode"])
      ? row.mode
      : "focus") as FocusDTO["mode"],
    seconds: row.seconds,
    completed: row.completed,
    habitId: row.habit_id,
    taskId: row.task_id,
    day: row.day,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    remainingSeconds: row.remaining_seconds,
  };
}

/** The user's current active/paused session — at most one is possible. */
async function currentActive(
  supabase: SupabaseClient,
  userId: string,
): Promise<SessionRow | null> {
  const { data } = await supabase
    .from("focus_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("completed", false)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return data as SessionRow;
}

/**
 * Verifies a habit/task link resolves to a row the session user owns. A foreign
 * id is dropped rather than persisted (RLS scoping lives in the application).
 */
async function resolveLinks(
  supabase: SupabaseClient,
  userId: string,
  habitId: number | null,
  taskId: number | null,
): Promise<{ habit: number | null; task: number | null }> {
  let habit: number | null = null;
  if (habitId != null && Number.isFinite(habitId)) {
    const id = Math.round(habitId);
    const { data } = await supabase
      .from("habits")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) habit = id;
  }
  let task: number | null = null;
  if (taskId != null && Number.isFinite(taskId)) {
    const id = Math.round(taskId);
    const { data } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) task = id;
  }
  return { habit, task };
}

async function timezoneOf(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from("user_settings")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  return normaliseTimezone(data?.timezone);
}

/**
 * Finalizes the user's active session in place (keeps id, started_at, ends_at)
 * so the historical record and its clock-facing day stay exactly where they
 * started. Returns `{ row, transitioned }`:
 *   - `transitioned: true`  — THIS request completed the active row.
 *   - `transitioned: false` — no active row existed; the newest completed row is
 *     returned for cross-tab convergence. The caller must NOT treat this as a
 *     fresh completion (no task progress re-feed, which would double-count).
 */
async function finalize(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ row: SessionRow; transitioned: boolean } | null> {
  const { data, error } = await supabase
    .from("focus_sessions")
    .update({ completed: true, remaining_seconds: null })
    .eq("user_id", userId)
    .eq("completed", false)
    .select("*")
    .single();
  if (data) return { row: data as SessionRow, transitioned: true };
  // PGRST116 = no active row to finalize (another tab reset/skipped it).
  if (error && error.code !== "PGRST116") return null;
  const { data: done } = await supabase
    .from("focus_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("completed", true)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return done ? { row: done as SessionRow, transitioned: false } : null;
}

export async function GET() {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;
  const session = await currentActive(supabase, userId);
  return NextResponse.json({ session: session ? toDTO(session) : null });
}

export async function POST(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as {
    action?: string;
    mode?: string;
    seconds?: number;
    habitId?: number | null;
    taskId?: number | null;
  };
  const action = body.action ?? "start";

  // start/resume carry a config; pause/reset/skip/complete only finalize.
  const mode = MODES.includes(body.mode as FocusDTO["mode"])
    ? (body.mode as FocusDTO["mode"])
    : "focus";
  const seconds = clampPlannedSeconds(Number(body.seconds ?? 0));

  if (action === "start") {
    const timezone = await timezoneOf(supabase, userId);
    const now = new Date();
    const endsAt = new Date(now.getTime() + seconds * 1000).toISOString();
    const day = dayKeyInZone(now, timezone);
    const { habit, task } = await resolveLinks(supabase, userId, body.habitId ?? null, body.taskId ?? null);

    // Upsert semantics: a user has exactly ONE active/paused session, so two
    // tabs starting "at once" converge on the same row instead of creating two.
    const existing = await currentActive(supabase, userId);
    let row: SessionRow;
    if (existing) {
      const { data, error } = await supabase
        .from("focus_sessions")
        .update({
          mode,
          seconds,
          habit_id: habit,
          task_id: task,
          day,
          started_at: now.toISOString(),
          ends_at: endsAt,
          remaining_seconds: null,
        })
        .eq("id", existing.id)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Could not start the session." }, { status: 500 });
      }
      row = data as SessionRow;
    } else {
      const { data, error } = await supabase
        .from("focus_sessions")
        .insert({
          user_id: userId,
          mode,
          seconds,
          completed: false,
          habit_id: habit,
          task_id: task,
          day,
          started_at: now.toISOString(),
          ends_at: endsAt,
          remaining_seconds: null,
        })
        .select("*")
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Could not start the session." }, { status: 500 });
      }
      row = data as SessionRow;
    }
    return NextResponse.json({ session: toDTO(row) });
  }

  if (action === "pause") {
    const active = await currentActive(supabase, userId);
    if (!active) return NextResponse.json({ session: null });
    // Already paused — idempotent, return it unchanged.
    if (active.ends_at === null) {
      return NextResponse.json({ session: toDTO(active) });
    }
    const freeze = pauseSeconds(active.ends_at, Date.now(), active.seconds);
    // Pausing at the exact end is effectively a completion.
    if (freeze.kind === "expired") {
      const finalized = await finalize(supabase, userId);
      if (finalized) {
        const progress = finalized.transitioned
          ? await applyFocusToTask(
              supabase, userId, finalized.row.task_id, finalized.row.mode, finalized.row.seconds, finalized.row.day,
            )
          : null;
        return NextResponse.json({ session: toDTO(finalized.row), progress });
      }
      return NextResponse.json({ session: null });
    }
    const { data, error } = await supabase
      .from("focus_sessions")
      .update({ ends_at: null, remaining_seconds: freeze.seconds })
      .eq("id", active.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Could not pause the session." }, { status: 500 });
    }
    return NextResponse.json({ session: toDTO(data as SessionRow) });
  }

  if (action === "resume") {
    const active = await currentActive(supabase, userId);
    if (!active) return NextResponse.json({ session: null });
    if (active.ends_at !== null) {
      // Already running — idempotent.
      return NextResponse.json({ session: toDTO(active) });
    }
    const remaining = active.remaining_seconds ?? active.seconds;
    // Resuming an already-expired pause is effectively a completion.
    if (remaining <= 0) {
      const finalized = await finalize(supabase, userId);
      if (finalized) {
        const progress = finalized.transitioned
          ? await applyFocusToTask(
              supabase, userId, finalized.row.task_id, finalized.row.mode, finalized.row.seconds, finalized.row.day,
            )
          : null;
        return NextResponse.json({ session: toDTO(finalized.row), progress });
      }
      return NextResponse.json({ session: null });
    }
    const endsAt = resumeEndsAt(remaining, Date.now());
    const { data, error } = await supabase
      .from("focus_sessions")
      .update({ ends_at: endsAt, remaining_seconds: null })
      .eq("id", active.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Could not resume the session." }, { status: 500 });
    }
    return NextResponse.json({ session: toDTO(data as SessionRow) });
  }

  if (action === "complete") {
    const finalized = await finalize(supabase, userId);
    if (!finalized) return NextResponse.json({ session: null, progress: null });
    const { row, transitioned } = finalized;
    // A completed-but-never-stopped pause has no ends_at; pin it to a full run.
    if (row.ends_at === null && row.started_at) {
      const end = plannedEnd(row.seconds, row.started_at);
      const { data, error } = await supabase
        .from("focus_sessions")
        .update({ ends_at: end })
        .eq("id", row.id)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (!error && data) {
        row.ends_at = (data as SessionRow).ends_at;
      }
    }
    // Only a row THIS request finalized feeds task progress — a stale tab
    // converging on another session must never double-count a day's minutes.
    let progress = null;
    if (transitioned && row.task_id != null) {
      try {
        progress = await applyFocusToTask(
          supabase, userId, row.task_id, row.mode, row.seconds, row.day,
        );
      } catch {
        // The session finalized fine; a task write failure is not fatal.
        progress = null;
      }
    }
    return NextResponse.json({ session: toDTO(row), progress });
  }

  // "reset" and "skip" both discard the active session without logging it —
  // matching the existing product where skip never records a session.
  if (action === "reset" || action === "skip") {
    const active = await currentActive(supabase, userId);
    if (!active) return NextResponse.json({ session: null });
    await supabase.from("focus_sessions").delete().eq("id", active.id).eq("user_id", userId);
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export const dynamic = "force-dynamic";