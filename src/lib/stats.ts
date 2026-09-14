/**
 * Aggregations built on top of the shared scoring model in `@/lib/scoring`.
 *
 * Every rating here comes from `scoreDay()` — this file never computes a daily
 * rating on its own.
 */

import {
  addDays,
  diffDays,
  endOfMonth,
  fromKey,
  rangeKeys,
  startOfMonth,
  startOfWeek,
  weekdayOf,
} from "@/lib/dates";
import { roundPoints } from "@/lib/format";
import { ratioFor } from "@/lib/tasks";
import { RATING_MAX, type HabitDTO, type HabitLogMap, type TaskProgressMap } from "@/lib/types";
import type { TaskDTO } from "@/lib/types";
import {
  configuredPositiveWeight,
  countFor,
  effectiveTargetFor,
  habitDayCounts,
  habitContribution,
  habitContributionFor,
  habitKindFor,
  isScheduled,
  perOccurrenceValue,
  progressFor,
  scoreDay,
  taskContributionFor,
  taskProgressFor,
  type ScoringContext,
} from "@/lib/scoring";

export {
  configuredPositiveWeight,
  countFor,
  effectiveTargetFor,
  habitDayCounts,
  habitContribution,
  habitContributionFor,
  habitKindFor,
  isScheduled,
  perOccurrenceValue,
  taskContributionFor,
  taskProgressFor,
  progressFor,
};
export { scoreDay };
export type { ScoringContext };

const ctxOf = (ctx: ScoringContext) => ctx;

/* ------------------------------------------------------------------ */
/* Habit level statistics                                             */
/* ------------------------------------------------------------------ */

export type HabitStats = {
  currentStreak: number;
  longestStreak: number;
  /** Occurrences done ÷ occurrences targeted. */
  completionRate: number;
  totalOccurrences: number;
  totalTarget: number;
  fullDays: number;
  /** Total signed contribution to daily ratings. */
  contribution: number;
  bestMonth: { key: string; label: string; occurrences: number; target: number } | null;
  last7: { occurrences: number; target: number };
  last30: { occurrences: number; target: number };
};

export function habitStats(
  habit: HabitDTO,
  logs: HabitLogMap,
  today: string,
  sinceKey?: string,
): HabitStats {
  const dayCounts = habitDayCounts(logs, habit.id);

  const start = sinceKey ?? habitStart(dayCounts, today);
  const keys = rangeKeys(start, today);

  let totalOccurrences = 0;
  let totalTarget = 0;
  let fullDays = 0;
  let longest = 0;
  let run = 0;
  let contribution = 0;
  const monthTotals = new Map<string, { occurrences: number; target: number }>();

  for (const key of keys) {
    const entry = logs[String(habit.id)]?.[key];
    /**
     * A recorded log means the habit participated in that day regardless of the
     * habit's CURRENT enabled state or weekday schedule. Only unrecorded days
     * consult the current configuration.
     */
    const dayScheduled = !!entry || isScheduled(habit, key, weekdayOf);
    if (!dayScheduled) continue;
    // The recorded target wins over the current configuration.
    const dayTarget = entry?.targetCountAtRecord ?? effectiveTargetFor(habit, key, weekdayOf);
    const done = dayCounts[key] ?? 0;
    // Historical days use the recorded kind; today uses live configuration.
    const dayKind = habitKindFor(habit, logs, key, today);
    const effectiveDayTarget = dayKind === "negative" ? 0 : dayTarget;

    totalOccurrences += done;
    totalTarget += effectiveDayTarget;
    // Historical days read their snapshot; today recomputes from live config.
    // A recorded log is authoritative for ANY date.
    contribution += entry ? entry.points : 0;

    if (dayTarget > 0) {
      if (done >= effectiveDayTarget) {
        fullDays += 1;
        run += 1;
        if (run > longest) longest = run;
      } else if (key < today) {
        run = 0;
      }
    }

    const m = startOfMonth(key);
    const prev = monthTotals.get(m) ?? { occurrences: 0, target: 0 };
    monthTotals.set(m, {
      occurrences: prev.occurrences + (dayKind === "negative" ? done : Math.min(done, dayTarget)),
      target: prev.target + effectiveDayTarget,
    });
  }

  // Current streak: consecutive scheduled days meeting the target.
  let currentStreak = 0;
  let cursor = today;
  if ((dayCounts[today] ?? 0) < effectiveTargetFor(habit, today, weekdayOf)) cursor = addDays(today, -1);
  let guard = 0;
  while (guard < 2000) {
    if (diffDays(cursor, start) < 0) break;
    if (!isScheduled(habit, cursor, weekdayOf)) {
      cursor = addDays(cursor, -1);
      guard += 1;
      continue;
    }
    const streakEntry = logs[String(habit.id)]?.[cursor];
    const streakTarget = Math.max(1, streakEntry?.targetCountAtRecord ?? effectiveTargetFor(habit, cursor, weekdayOf));
    if ((dayCounts[cursor] ?? 0) >= streakTarget) {
      currentStreak += 1;
      cursor = addDays(cursor, -1);
      guard += 1;
    } else break;
  }

  let bestMonth: HabitStats["bestMonth"] = null;
  for (const [k, v] of monthTotals) {
    if (!bestMonth || v.occurrences > bestMonth.occurrences) {
      bestMonth = { key: k, label: monthLabelOf(k), ...v };
    }
  }

  const sumRange = (ks: string[]) => {
    let o = 0;
    let t = 0;
    for (const k of ks) {
      const e = logs[String(habit.id)]?.[k];
      if (!e && !isScheduled(habit, k, weekdayOf)) continue;
      o += dayCounts[k] ?? 0;
      t += habitKindFor(habit, logs, k, today) === "negative"
        ? 0
        : (e?.targetCountAtRecord ?? effectiveTargetFor(habit, k, weekdayOf));
    }
    return { occurrences: o, target: t };
  };

  const last7Keys = rangeKeys(addDays(today, -6), today);
  const last30Keys = rangeKeys(addDays(today, -29), today);

  return {
    currentStreak,
    longestStreak: Math.max(longest, currentStreak),
    completionRate: totalTarget === 0 ? 0 : Math.round((totalOccurrences / totalTarget) * 100),
    totalOccurrences,
    totalTarget,
    fullDays,
    contribution: roundPoints(contribution),
    bestMonth,
    last7: sumRange(last7Keys),
    last30: sumRange(last30Keys),
  };
}

function habitStart(dayCounts: Record<string, number>, today: string): string {
  const fallback = addDays(today, -540);
  const keys = Object.keys(dayCounts).filter((k) => (dayCounts[k] ?? 0) > 0);
  if (keys.length === 0) return fallback;
  let earliest = fallback;
  for (const key of keys) if (diffDays(key, earliest) < 0) earliest = key;
  return earliest;
}

function monthLabelOf(key: string): string {
  const d = fromKey(key);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* ------------------------------------------------------------------ */
/* Rating series + overall statistics                                 */
/* ------------------------------------------------------------------ */

export type RatingPoint = {
  key: string;
  rating: number;
  habits: number;
  tasks: number;
  penalties: number;
  occurrences: number;
  rated: boolean;
};

export function ratingSeries(ctx: ScoringContext, keys: string[]): RatingPoint[] {
  return keys.map((key) => {
    const s = scoreDay(ctx, key, weekdayOf);
    const occurrences = s.habitRows.reduce((a, r) => a + r.count, 0);
    return {
      key,
      rating: s.rating,
      habits: s.habits,
      tasks: s.tasks,
      penalties: s.penalties,
      occurrences,
      rated: occurrences > 0 || s.tasks > 0,
    };
  });
}

export type OverallStats = {
  averageRating: number;
  bestDay: { key: string; rating: number } | null;
  lowestDay: { key: string; rating: number } | null;
  daysRated: number;
  perfectDays: number;
  currentStreak: number;
  longestStreak: number;
  sevenDayAverage: number;
  thirtyDayAverage: number;
  todayRating: number;
  todayHabits: number;
  todayTasks: number;
  todayPenalties: number;
  todayAvailable: number;
  totalOccurrences: number;
  totalPenalties: number;
};

export function overallStats(ctx: ScoringContext, windowDays = 540): OverallStats {
  const start = addDays(ctx.today, -(windowDays - 1));
  const keys = rangeKeys(start, ctx.today);
  const series = ratingSeries(ctx, keys);

  let rated = 0;
  let sum = 0;
  let perfectDays = 0;
  let longest = 0;
  let run = 0;
  let totalOccurrences = 0;
  let totalPenalties = 0;
  let bestDay: OverallStats["bestDay"] = null;
  let lowestDay: OverallStats["lowestDay"] = null;

  for (const p of series) {
    totalOccurrences += p.occurrences;
    totalPenalties += p.penalties;
    if (!p.rated) {
      run = 0;
      continue;
    }
    rated += 1;
    sum += p.rating;
    if (p.rating >= RATING_MAX - 0.05) perfectDays += 1;
    if (!bestDay || p.rating > bestDay.rating) bestDay = { key: p.key, rating: p.rating };
    if (!lowestDay || p.rating < lowestDay.rating) lowestDay = { key: p.key, rating: p.rating };
    if (p.rating > 0) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  let currentStreak = 0;
  let cursor = ctx.today;
  const last = series[series.length - 1];
  if (!last?.rated || last.rating === 0) cursor = addDays(ctx.today, -1);
  let guard = 0;
  while (guard < 2000) {
    if (diffDays(cursor, start) < 0) break;
    if (scoreDay(ctx, cursor, weekdayOf).rating > 0) {
      currentStreak += 1;
      cursor = addDays(cursor, -1);
    } else break;
    guard += 1;
  }

  const average = (ks: string[]) => {
    const subset = ks.map((k) => scoreDay(ctx, k, weekdayOf)).filter((s) => s.habitRows.some((r) => r.count > 0) || s.tasks > 0);
    if (subset.length === 0) return 0;
    return Math.round((subset.reduce((a, s) => a + s.rating, 0) / subset.length) * 10) / 10;
  };

  const today = scoreDay(ctx, ctx.today, weekdayOf);

  return {
    averageRating: rated === 0 ? 0 : Math.round((sum / rated) * 10) / 10,
    bestDay,
    lowestDay,
    daysRated: rated,
    perfectDays,
    currentStreak,
    longestStreak: longest,
    sevenDayAverage: average(rangeKeys(addDays(ctx.today, -6), ctx.today)),
    thirtyDayAverage: average(rangeKeys(addDays(ctx.today, -29), ctx.today)),
    todayRating: today.rating,
    todayHabits: today.habits,
    todayTasks: today.tasks,
    todayPenalties: today.penalties,
    todayAvailable: roundPoints(today.habitAvailable + today.taskAvailable),
    totalOccurrences,
    totalPenalties: roundPoints(totalPenalties),
  };
}

/* ------------------------------------------------------------------ */
/* Chart buckets                                                      */
/* ------------------------------------------------------------------ */

export type Bucket = { label: string; rating: number; total: number; key: string; days: number };

export function weeklyBuckets(ctx: ScoringContext, weeks: number): Bucket[] {
  const out: Bucket[] = [];
  let weekStart = startOfWeek(ctx.today);
  for (let i = 0; i < weeks; i += 1) {
    const keys = rangeKeys(weekStart, addDays(weekStart, 6));
    let sum = 0;
    let days = 0;
    for (const key of keys) {
      const s = scoreDay(ctx, key, weekdayOf);
      if (s.habitRows.some((r) => r.count > 0) || s.tasks > 0) {
        sum += s.rating;
        days += 1;
      }
    }
    const d = fromKey(weekStart);
    out.push({
      key: weekStart,
      label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
      rating: days === 0 ? 0 : Math.round((sum / days) * 10) / 10,
      total: RATING_MAX,
      days,
    });
    weekStart = addDays(weekStart, -7);
  }
  return out.reverse();
}

export function monthlyBuckets(ctx: ScoringContext, months: number): Bucket[] {
  const out: Bucket[] = [];
  let monthStart = startOfMonth(ctx.today);
  for (let i = 0; i < months; i += 1) {
    const keys = rangeKeys(monthStart, endOfMonth(monthStart));
    let sum = 0;
    let days = 0;
    for (const key of keys) {
      const s = scoreDay(ctx, key, weekdayOf);
      if (s.habitRows.some((r) => r.count > 0) || s.tasks > 0) {
        sum += s.rating;
        days += 1;
      }
    }
    const d = fromKey(monthStart);
    out.push({
      key: monthStart,
      label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()],
      rating: days === 0 ? 0 : Math.round((sum / days) * 10) / 10,
      total: RATING_MAX,
      days,
    });
    monthStart = startOfMonth(addDays(monthStart, -1));
  }
  return out.reverse();
}

export type HabitComparisonRow = {
  habit: HabitDTO;
  occurrences: number;
  target: number;
  rate: number;
};

export function habitComparison(
  ctx: ScoringContext,
  keys: string[],
): HabitComparisonRow[] {
  return ctx.habits
    .filter((h) => h.enabled)
    .map((habit) => {
      let occurrences = 0;
      let target = 0;
      for (const key of keys) {
        const entry = ctx.habitLogs[String(habit.id)]?.[key];
        // A recorded log means the habit participated that day regardless of
        // the CURRENT schedule; only unrecorded days consult it.
        if (!entry && !isScheduled(habit, key, weekdayOf)) continue;
        // The recorded kind/target win over the current configuration, so
        // historical rates stay frozen when a habit's type or repetitions
        // change — same snapshot rule habitStats/scoreDay apply.
        const dayKind = habitKindFor(habit, ctx.habitLogs, key, ctx.today);
        const dayTarget = entry?.targetCountAtRecord ?? effectiveTargetFor(habit, key, weekdayOf);
        occurrences += countFor(ctx.habitLogs, habit.id, key);
        target += dayKind === "negative" ? 0 : Math.max(1, dayTarget);
      }
      return {
        habit,
        occurrences,
        target,
        rate: target === 0 ? 0 : Math.round((Math.min(occurrences, target) / target) * 100),
      };
    })
    .sort((a, b) => b.rate - a.rate);
}

export function taskComparison(
  ctx: ScoringContext,
  keys: string[],
): { task: TaskDTO; progress: number; target: number; earned: number; maxPoints: number }[] {
  return ctx.tasks
    .map((task) => {
      let progress = 0;
      for (const key of keys) progress += taskProgressFor(ctx.taskProgress, task.id, key);
      return {
        task,
        progress,
        target: taskTargetOf(task),
        earned: 0,
        maxPoints: task.maxPoints,
      };
    })
    .filter((r) => r.progress > 0 || r.task.day === null || keys.includes(r.task.day ?? ""));
}

function taskTargetOf(task: TaskDTO): number {
  return task.measureType === "completion" ? 1 : Math.max(1, Number(task.targetValue) || 1);
}

export function focusTotals(
  focus: { day: string; mode: string; seconds: number; completed: boolean }[],
  keys: string[],
) {
  const set = new Set(keys);
  let seconds = 0;
  let sessions = 0;
  for (const s of focus) {
    if (!set.has(s.day)) continue;
    if (s.mode !== "focus") continue;
    if (!s.completed) continue;
    seconds += s.seconds;
    sessions += 1;
  }
  return { seconds, sessions };
}

export type StatsTaskRow = { task: TaskDTO; progress: number; earned: number; ratio: number };

/**
 * Per-task reward rows over an unbounded day span. Days with any recorded
 * progress contribute their stored snapshot; every day with at least one
 * progress log counts toward the running total, so the whole history is
 * aggregated without ever shipping the raw logs to the client.
 */
export function allTimeTaskRows(ctx: ScoringContext, keys: string[]): StatsTaskRow[] {
  return ctx.tasks
    .map((t) => {
      const days = Object.keys(ctx.taskProgress[String(t.id)] ?? {});
      const progress = days.reduce((a, d) => a + taskProgressFor(ctx.taskProgress, t.id, d), 0);
      const earned = days.reduce(
        (a, d) => a + taskContributionFor(t, t.id, ctx.taskProgress, d, ctx.today),
        0,
      );
      return { task: t, progress, earned, ratio: ratioFor(t, progress) };
    })
    .filter((r) => r.progress > 0 || (r.task.day && keys.includes(r.task.day)))
    .sort((a, b) => b.ratio - a.ratio);
}

export type AllTimeStats = {
  days: number;
  from: string;
  series: RatingPoint[];
  overall: OverallStats;
  comparison: HabitComparisonRow[];
  taskRows: StatsTaskRow[];
  weekly: Bucket[];
  monthly: Bucket[];
  focusSeconds: number;
  focusSessions: number;
};

export { ctxOf };
