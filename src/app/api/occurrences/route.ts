import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth";
import { weekdayOf } from "@/lib/dates";
import { parseWeekdayTargets } from "@/lib/weekday-targets";
import { effectiveTargetFor } from "@/lib/scoring";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function safeTimes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string" && TIME_RE.test(t));
    }
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * Toggles one scheduled occurrence of a habit on a day.
 *
 * The occurrence-level record is the source of truth for WHICH repetition was
 * completed. The aggregate habit log is re-derived inside the atomic RPC
 * (`handle_occurrence_toggle`) so the count and the rating snapshot can never
 * drift apart, and concurrent toggles of the same habit are serialised with a
 * row lock on the habit. The RPC is SECURITY INVOKER, so RLS (`user_id =
 * auth.uid()`) scopes every read/write to the session user.
 *
 * `day` is the user's local calendar date, supplied by the client from the
 * stored IANA timezone. The user id is never taken from the client.
 */
export async function POST(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as {
    habitId?: number;
    day?: string;
    occurrenceIndex?: number;
    scheduledTime?: string;
    completed?: boolean;
  };

  const habitId = Number(body.habitId);
  const day = body.day ?? "";
  const occurrenceIndex = Number(body.occurrenceIndex);
  const scheduledTime = body.scheduledTime ?? "";
  const completed = body.completed === true;

  // ---- 1. Basic input validation ----
  if (!Number.isFinite(habitId) || !KEY_RE.test(day) || !Number.isFinite(occurrenceIndex)) {
    return NextResponse.json({ error: "Invalid habit, date or occurrence." }, { status: 400 });
  }
  if (!TIME_RE.test(scheduledTime)) {
    return NextResponse.json({ error: "A valid scheduled time is required." }, { status: 400 });
  }

  // ---- 2. Ownership + configuration ----
  const { data: habit, error: habitError } = await supabase
    .from("habits")
    .select("id, schedule_times, target_count, weekday_targets, kind, point_value, name")
    .eq("id", habitId)
    .eq("user_id", userId)
    .single();
  if (habitError || !habit)
    return NextResponse.json({ error: "Habit not found." }, { status: 404 });

  const scheduleTimes = safeTimes(habit.schedule_times ?? "");
  // When a habit has no calendar times, the day's occurrence index is bounded by
  // that day's EFFECTIVE target (per-weekday override or the global target), so
  // an index can never exceed what the habit asks for on this weekday.
  const targetCount = effectiveTargetFor(
    {
      targetCount: Math.max(1, Number(habit.target_count ?? 1)),
      weekdayTargets: parseWeekdayTargets(habit.weekday_targets),
    },
    day,
    weekdayOf,
  );

  // ---- 3. Occurrence-index validation ----
  /**
   * The index must address a REAL scheduled occurrence. If the habit declares
   * scheduleTimes, only those indexes exist. Otherwise the index is bounded by
   * the daily target, so fake occurrences cannot be manufactured.
   */
  const maxIndex = scheduleTimes.length > 0 ? scheduleTimes.length : targetCount;
  if (occurrenceIndex < 0 || occurrenceIndex >= maxIndex) {
    return NextResponse.json(
      {
        error: `Occurrence index ${occurrenceIndex} is out of range. This habit has ${
          scheduleTimes.length > 0 ? `${scheduleTimes.length} scheduled times` : `a target of ${targetCount} repetitions`
        }, so valid indexes are 0–${maxIndex - 1}.`,
      },
      { status: 400 },
    );
  }

  // ---- 4. Schedule-time validation ----
  /**
   * If an occurrence RECORD already exists for this day + index, its stored
   * `scheduledTime` is the historical truth and is accepted. This lets a user
   * toggle a past occurrence after the habit's schedule has changed, without
   * the new schedule rejecting the old time.
   *
   * For a NEW occurrence the supplied time must match the habit's current
   * schedule at this index, so arbitrary client-generated times are rejected.
   */
  const { data: existingOcc } = await supabase
    .from("habit_occurrences")
    .select("scheduled_time")
    .eq("habit_id", habitId)
    .eq("user_id", userId)
    .eq("day", day)
    .eq("occurrence_index", occurrenceIndex)
    .maybeSingle();

  if (existingOcc) {
    if (scheduledTime !== existingOcc.scheduled_time) {
      return NextResponse.json(
        {
          error: `Scheduled time mismatch. This occurrence was recorded at ${existingOcc.scheduled_time}, but ${scheduledTime} was supplied.`,
        },
        { status: 400 },
      );
    }
  } else if (scheduleTimes.length > 0) {
    const expected = scheduleTimes[occurrenceIndex];
    if (scheduledTime !== expected) {
      return NextResponse.json(
        {
          error: `Scheduled time mismatch. Occurrence ${occurrenceIndex} is configured for ${expected}, but ${scheduledTime} was supplied.`,
        },
        { status: 400 },
      );
    }
  }

  // ---- 5. Atomic occurrence write + aggregate re-derivation ----
  /**
   * The single RPC below performs the row-locked occurrence upsert (only
   * `completed` changes; `scheduled_time` is captured at creation) and re-derives
   * the aggregate habit log using the same snapshot resolution as `/api/logs`.
   * Running it in Postgres keeps the two writes atomic AND under RLS.
   */
  const { data: rpc, error } = await supabase.rpc("handle_occurrence_toggle", {
    p_habit_id: habitId,
    p_day: day,
    p_occurrence_index: occurrenceIndex,
    p_scheduled_time: scheduledTime,
    p_completed: completed,
  });

  if (error) {
    // Map the RPC's ownership/not-found error code to a 404.
    if (String(error.code) === "S0101") {
      return NextResponse.json({ error: "Habit not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not update the occurrence." }, { status: 500 });
  }

  const row = Array.isArray(rpc) ? rpc[0] : rpc;
  return NextResponse.json({
    count: Number(row?.count ?? 0),
    pointsEarned: Number(row?.points_earned ?? 0),
    completed: Boolean(row?.completed ?? completed),
  });
}

export const dynamic = "force-dynamic";
