import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth";
import {
  ensureSettings,
  habitDTO,
  habitLogMap,
  taskDTO,
  taskProgressLogMap,
  type HabitLogRow,
  type HabitRow,
  type TaskProgressLogRow,
  type TaskRow,
} from "@/lib/data";
import { addDays, addMonths, diffDays, rangeKeys, startOfMonth, startOfWeek } from "@/lib/dates";
import { todayInZone } from "@/lib/timezone";
import type { HabitDTO, TaskDTO } from "@/lib/types";
import {
  allTimeTaskRows,
  focusTotals,
  habitComparison,
  monthlyBuckets,
  overallStats,
  ratingSeries,
  weeklyBuckets,
  type AllTimeStats,
  type RatingPoint,
  type ScoringContext,
} from "@/lib/stats";

/**
 * Server-side "All time" aggregation for the Progress page.
 *
 * The workspace intentionally caps what it ships to the client (the newest
 * ~540 days) so the bundle and client state stay bounded. "All time" needs the
 * FULL history, so it is computed here and returns only derived numbers — raw
 * logs never leave this route.
 */
export async function GET() {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const settings = await ensureSettings(userId);
  const today = todayInZone(settings.timezone);

  const [habitRes, logRes, taskRes, progressRes, focusRes] = await Promise.all([
    supabase
      .from("habits")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("habit_logs")
      .select(
        "habit_id, day, count, points_earned, point_value_at_record, target_count_at_record, kind_at_record",
      )
      .eq("user_id", userId),
    supabase.from("tasks").select("*").eq("user_id", userId),
    supabase
      .from("task_progress_logs")
      .select(
        "task_id, day, progress, points_earned, target_value_at_record, max_points_at_record, measure_type_at_record, unit_at_record",
      )
      .eq("user_id", userId),
    supabase
      .from("focus_sessions")
      .select("day, mode, seconds, completed")
      .eq("user_id", userId),
  ]);

  for (const res of [habitRes, logRes, taskRes, progressRes, focusRes]) {
    if (res.error) {
      return NextResponse.json({ error: "Could not load statistics." }, { status: 500 });
    }
  }

  const habits: HabitDTO[] = (habitRes.data ?? []).map((h: HabitRow) => habitDTO(h));
  const logs = habitLogMap((logRes.data ?? []) as HabitLogRow[]);
  const tasks: TaskDTO[] = (taskRes.data ?? []).map((t: TaskRow) => taskDTO(t));
  const taskProgress = taskProgressLogMap((progressRes.data ?? []) as TaskProgressLogRow[]);
  const focus = (focusRes.data ?? []) as { day: string; mode: string; seconds: number; completed: boolean }[];

  // Earliest recorded day across every scored source — the true start of the span.
  let earliest: string | null = null;
  for (const map of [logs, taskProgress]) {
    for (const days of Object.values(map)) {
      for (const day of Object.keys(days)) {
        if (earliest === null || day < earliest) earliest = day;
      }
    }
  }
  for (const s of focus) {
    if (s.day && (earliest === null || s.day < earliest)) earliest = s.day;
  }

  // Guarded so a pathological account can never force an unbounded work loop.
  const days = earliest ? Math.max(1, Math.min(3660, diffDays(today, earliest) + 1)) : 1;
  const from = addDays(today, -(days - 1));
  const keys = rangeKeys(from, today);

  const sc: ScoringContext = { habits, habitLogs: logs, tasks, taskProgress, today };
  const series = ratingSeries(sc, keys);
  const overall = overallStats(sc, days);
  const comparison = habitComparison(sc, keys);
  const taskRows = allTimeTaskRows(sc, keys);
  const focusStats = focusTotals(focus, keys);

  // Weekly/monthly buckets over the FULL span so the Progress page shows the
  // same depth under "All time" as it does for the fixed ranges.
  const weekly = weeklyBuckets(sc, Math.max(1, Math.ceil(days / 7)));
  let monthCount = 1;
  let cursor = startOfMonth(today);
  const firstMonth = startOfMonth(from);
  while (cursor > firstMonth && monthCount < 370) {
    monthCount += 1;
    cursor = addMonths(cursor, -1);
  }
  const monthly = monthlyBuckets(sc, monthCount);

  const payload: AllTimeStats = {
    days,
    from,
    series: downsampleSeries(series, days),
    overall,
    comparison,
    taskRows,
    weekly,
    monthly,
    focusSeconds: focusStats.seconds,
    focusSessions: focusStats.sessions,
  };

  return NextResponse.json(payload);
}

/**
 * Long spans are bucketed into weekly points so a multi-year account does not
 * ship thousands of daily rating points to the client. Each bucket averages the
 * DAYS it contains; the line chart stays readable either way.
 */
function downsampleSeries(series: RatingPoint[], days: number): RatingPoint[] {
  if (days <= 730) return series;
  const buckets = new Map<string, { sum: number; count: number; rated: boolean; last: RatingPoint }>();
  for (const p of series) {
    const week = startOfWeek(p.key);
    const bucket = buckets.get(week) ?? { sum: 0, count: 0, rated: false, last: p };
    if (p.rated) {
      bucket.sum += p.rating;
      bucket.count += 1;
      bucket.rated = true;
    }
    bucket.last = p;
    buckets.set(week, bucket);
  }
  return [...buckets.values()].map((b) => ({
    key: b.last.key,
    rating: b.count === 0 ? 0 : Math.round((b.sum / b.count) * 10) / 10,
    habits: 0,
    tasks: 0,
    penalties: 0,
    occurrences: 0,
    rated: b.rated,
  }));
}

export const dynamic = "force-dynamic";