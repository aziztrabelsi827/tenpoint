import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth";
import { weekdayOf } from "@/lib/dates";
import { parseWeekdayTargets } from "@/lib/weekday-targets";
import {
  calculateHabitPointsFromSnapshot,
  effectiveTargetFor,
  resolveHabitSnapshot,
  type StoredHabitLog,
} from "@/lib/scoring";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Records how many occurrences of a habit were completed on a calendar day.
 *
 * `day` is the user's LOCAL calendar date and is always supplied by the client,
 * which derives it from the user's IANA timezone.
 *
 * Historical integrity is enforced by the shared `resolveHabitSnapshot` helper:
 * if the day already has a configuration snapshot, that snapshot — not the
 * habit's current configuration — determines the contribution. Only a
 * brand-new record captures the current configuration. This is the exact same
 * rule `/api/occurrences` (via the `handle_occurrence_toggle` RPC) follows, so
 * the two write paths can never disagree.
 *
 * RLS (`user_id = auth.uid()`) scopes every read/write to the session user.
 */
export async function POST(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as { habitId?: number; day?: string; count?: number };
  const habitId = Number(body.habitId);
  const day = body.day ?? "";
  const raw = Number(body.count);
  const count = Math.max(0, Math.min(200, Math.round(Number.isFinite(raw) ? raw : 0)));

  if (!Number.isFinite(habitId) || !KEY_RE.test(day)) {
    return NextResponse.json({ error: "Invalid habit or date." }, { status: 400 });
  }

  const { data: habit, error: habitReadError } = await supabase
    .from("habits")
    .select("id, point_value, target_count, weekday_targets, kind")
    .eq("id", habitId)
    .eq("user_id", userId)
    .single();
  if (habitReadError && habitReadError.code !== "PGRST116") {
    return NextResponse.json({ error: "Could not load the habit." }, { status: 500 });
  }
  if (!habit) return NextResponse.json({ error: "Habit not found." }, { status: 404 });

  const { data: existing, error: existingReadError } = await supabase
    .from("habit_logs")
    .select("id, count, points_earned, point_value_at_record, target_count_at_record, kind_at_record")
    .eq("habit_id", habitId)
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (existingReadError) return NextResponse.json({ error: "Could not load the day's record." }, { status: 500 });

  const stored: StoredHabitLog | null = existing
    ? {
        count: Number(existing.count),
        points: Number(existing.points_earned),
        pointValueAtRecord: existing.point_value_at_record,
        targetCountAtRecord: existing.target_count_at_record,
        kindAtRecord: existing.kind_at_record,
      }
    : null;

  // Resolve the configuration that applies to THIS day. `dayTarget` is the
  // per-weekday effective target, so a brand-new (or provisional) record
  // captures the target that actually applies on this weekday rather than the
  // habit's global target_count.
  const dayTarget = effectiveTargetFor(
    {
      targetCount: Math.max(1, Number(habit.target_count ?? 1)),
      weekdayTargets: parseWeekdayTargets(habit.weekday_targets),
    },
    day,
    weekdayOf,
  );
  const snap = resolveHabitSnapshot(
    {
      pointValue: Number(habit.point_value ?? 1),
      targetCount: Math.max(1, Number(habit.target_count ?? 1)),
      kind: habit.kind === "negative" ? "negative" : "positive",
    },
    stored,
    dayTarget,
  );

  /**
   * A RECORDED ZERO IS NOT THE SAME AS NO RECORD.
   *
   * A day that has ever been recorded keeps its row (and its snapshot) even when
   * the count drops to zero, so a later re-check is scored against the day's own
   * snapshot rather than today's configuration.
   */
  if (count <= 0) {
    if (existing) {
      const { error: zeroError } = await supabase
        .from("habit_logs")
        .update({ count: 0, points_earned: 0 })
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (zeroError) return NextResponse.json({ error: "Could not update the day's record." }, { status: 500 });
    }
    return NextResponse.json({ count: 0, contribution: 0 });
  }

  /**
   * Legacy row with no snapshot: preserve the recorded points verbatim rather
   * than reconstructing history from today's settings.
   */
  if (snap.legacyPreservePoints !== undefined) {
    const preserved = Number(existing?.points_earned ?? 0);
    if (existing) {
      const { error: legacyError } = await supabase
        .from("habit_logs")
        .update({ count })
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (legacyError) return NextResponse.json({ error: "Could not update the day's record." }, { status: 500 });
    }
    return NextResponse.json({ count, contribution: preserved, legacyPreserved: true });
  }

  const pointsEarned = calculateHabitPointsFromSnapshot(count, snap);

  if (existing) {
    const { error: updateError } = await supabase
      .from("habit_logs")
      .update({
        count,
        points_earned: pointsEarned,
        // Snapshot columns are write-once: an existing day keeps its original values.
        ...(snap.isNewRecord
          ? {
              point_value_at_record: snap.weight,
              target_count_at_record: snap.target,
              kind_at_record: snap.kind,
            }
          : {}),
      })
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (updateError) return NextResponse.json({ error: "Could not update the day's record." }, { status: 500 });
  } else {
    const { error: insertError } = await supabase.from("habit_logs").insert({
      user_id: userId,
      habit_id: habitId,
      day,
      count,
      points_earned: pointsEarned,
      point_value_at_record: snap.weight,
      target_count_at_record: snap.target,
      kind_at_record: snap.kind,
    });
    if (insertError) return NextResponse.json({ error: "Could not save the day's record." }, { status: 500 });
  }

  return NextResponse.json({ count, contribution: pointsEarned });
}

export const dynamic = "force-dynamic";
