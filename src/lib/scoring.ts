/**
 * THE scoring model.
 * =================
 *
 * Every rating shown anywhere in the application — dashboard, sidebar, calendar,
 * statistics, habit detail, task page, historical records — is computed by the
 * functions in this file. Nothing else may calculate a daily rating.
 *
 *   Daily Rating = habit contributions + task contributions − penalties
 *                  then clamp(raw, 0, 10)
 *
 * Historical accuracy
 * -------------------
 * Configuration changes (habit weight, repetitions, type, task target, task
 * reward) apply FORWARD only. A day keeps the contribution snapshot that was
 * stored when it was recorded:
 *
 *   - a day holding REAL recorded progress (habit count > 0) -> stored snapshot
 *   - a day with no recorded progress, or a provisional zero-progress row
 *     (e.g. an occurrence that was checked and unchecked again) -> computed
 *     live from the current configuration until real progress is recorded
 *
 * A provisional zero-progress row therefore never freezes the configuration:
 * the configuration in effect the moment the first REAL completion lands is
 * what becomes that day's snapshot. Rows with no snapshot (legacy data) fall
 * back to live computation so the migration is graceful.
 */

import { roundPoints } from "@/lib/format";
import { clampRating } from "@/lib/format";
import {
  RATING_MAX,
  type HabitDTO,
  type HabitLogEntry,
  type HabitLogMap,
  type TaskDTO,
  type TaskProgressMap,
} from "@/lib/types";

/**
 * The task configuration the reward maths reads. Structural so callers can pass
 * a full TaskDTO or just the configuration fields.
 */
export type TaskConfig = Pick<TaskDTO, "measureType" | "targetValue" | "unit" | "maxPoints">;

/* ------------------------------------------------------------------ */
/* Inputs                                                             */
/* ------------------------------------------------------------------ */

export type ScoringContext = {
  habits: HabitDTO[];
  habitLogs: HabitLogMap;
  tasks: TaskDTO[];
  taskProgress: TaskProgressMap;
  /** The user's local calendar date. All "is this history?" decisions use it. */
  today: string;
};

/* ------------------------------------------------------------------ */
/* Habit lookups                                                      */
/* ------------------------------------------------------------------ */

export function habitLogEntry(logs: HabitLogMap, habitId: number, day: string): HabitLogEntry | null {
  return logs[String(habitId)]?.[day] ?? null;
}

export function countFor(logs: HabitLogMap, habitId: number, day: string): number {
  return logs[String(habitId)]?.[day]?.count ?? 0;
}

export function habitDayCounts(logs: HabitLogMap, habitId: number): Record<string, number> {
  const inner = logs[String(habitId)] ?? {};
  const out: Record<string, number> = {};
  for (const [day, entry] of Object.entries(inner)) out[day] = entry.count;
  return out;
}

export function isDone(logs: HabitLogMap, habitId: number, day: string): boolean {
  return countFor(logs, habitId, day) > 0;
}

/**
 * True when a habit log holds REAL completed progress.
 *
 * A zero-progress row is PROVISIONAL (e.g. an occurrence checked then
 * unchecked), so it never counts as an immutable historical record: the day
 * keeps resolving against the current configuration. This is the single
 * boundary the whole snapshot model uses — read paths and write paths alike.
 */
export function hasRecordedProgress(entry: { count: number } | null | undefined): boolean {
  return !!entry && entry.count > 0;
}

/* ------------------------------------------------------------------ */
/* Live habit maths — uses CURRENT configuration                      */
/* ------------------------------------------------------------------ */

/** Signed contribution of a habit given an occurrence count, from current config. */
export function habitContribution(habit: HabitDTO, count: number): number {
  if (count <= 0) return 0;
  if (habit.kind === "negative") return -roundPoints(count * habit.pointValue);
  const target = Math.max(1, habit.targetCount);
  return roundPoints(Math.min(1, count / target) * habit.pointValue);
}

/** Per-occurrence value of a positive habit. */
export function perOccurrenceValue(habit: HabitDTO): number {
  if (habit.kind === "negative") return habit.pointValue;
  return roundPoints(habit.pointValue / Math.max(1, habit.targetCount));
}

/* ------------------------------------------------------------------ */
/* Shared habit-day snapshot resolution                               */
/*                                                                     */
/* This is the ONE authoritative implementation of the historical        */
/* snapshot rule. Every write path (/api/logs, /api/occurrences) and     */
/* every read path (scoreDay, habitStats) must go through it, so a       */
/* habit-log can never be recalculated from configuration that did not   */
/* apply to the day being written.                                     */
/*                                                                     */
/* A stored snapshot is authoritative ONLY for a day holding REAL      */
/* recorded progress (count > 0). A zero-progress row is provisional    */
/* and never freezes the configuration. Priority for a given day:      */
/*   1. a recorded day's stored snapshot (authoritative)                */
/*   2. a recorded legacy row's stored points   (preserved verbatim)    */
/*   3. the habit's current config             (day not yet recorded)    */
/* ------------------------------------------------------------------ */

/** The minimal stored-log shape the resolver needs. */
export type StoredHabitLog = {
  count: number;
  points: number;
  pointValueAtRecord?: number | null;
  targetCountAtRecord?: number | null;
  kindAtRecord?: string | null;
};

/** The resolved configuration that applies to one habit-day. */
export type HabitDaySnapshot = {
  weight: number;
  target: number;
  kind: "positive" | "negative";
  /** True when no log existed, so the current config becomes the snapshot. */
  isNewRecord: boolean;
  /**
   * Set for a legacy row with no snapshot columns. The stored points must be
   * preserved verbatim — history is never reconstructed from current settings.
   */
  legacyPreservePoints?: number;
};

export function resolveHabitSnapshot(
  habit: Pick<HabitDTO, "pointValue" | "targetCount" | "kind">,
  existingLog: StoredHabitLog | null | undefined,
): HabitDaySnapshot {
  const recorded = hasRecordedProgress(existingLog);

  // 1. A stored snapshot is authoritative for a RECORDED day.
  if (recorded && existingLog!.pointValueAtRecord != null) {
    return {
      weight: Number(existingLog!.pointValueAtRecord),
      target: Math.max(1, Number(existingLog!.targetCountAtRecord ?? habit.targetCount)),
      kind: existingLog!.kindAtRecord === "negative" ? "negative" : "positive",
      isNewRecord: false,
    };
  }

  // 2. Recorded legacy row with no snapshot: preserve the points verbatim.
  if (recorded) {
    return {
      weight: Number(habit.pointValue),
      target: Math.max(1, Number(habit.targetCount)),
      kind: habit.kind === "negative" ? "negative" : "positive",
      isNewRecord: false,
      legacyPreservePoints: Number(existingLog!.points),
    };
  }

  // 3. No real record yet (brand-new day OR a provisional zero-progress row):
  //    the current configuration becomes the day's snapshot the moment real
  //    progress is recorded.
  return {
    weight: Number(habit.pointValue),
    target: Math.max(1, Number(habit.targetCount)),
    kind: habit.kind === "negative" ? "negative" : "positive",
    isNewRecord: true,
  };
}

/**
 * THE authoritative habit contribution formula.
 *
 *   positive: min(1, count / target) × weight
 *   negative: count × penalty
 *
 * Both are rounded with roundPoints. The maximum configured weight can never
 * be exceeded.
 */
export function calculateHabitPointsFromSnapshot(
  count: number,
  snap: { weight: number; target: number; kind: "positive" | "negative" },
): number {
  if (count <= 0) return 0;
  return snap.kind === "negative"
    ? -roundPoints(count * snap.weight)
    : roundPoints(Math.min(1, count / Math.max(1, snap.target)) * snap.weight);
}

/* ------------------------------------------------------------------ */
/* Day-aware resolution                                               */
/*                                                                     */
/* These are the ONLY functions the UI may call to read a contribution  */
/* for a specific day. Days holding real recorded progress return the   */
/* stored snapshot; days without it (including provisional zero-progress */
/* rows) resolve against the current configuration.                     */
/* ------------------------------------------------------------------ */

/**
 * The habit's effective type on a given day.
 *
 * Recorded days are classified by the SIGN of the stored snapshot, so
 * flipping a habit from positive to negative (or back) never rewrites what a
 * recorded day actually earned. Days with no recorded progress use the live
 * configuration — a provisional zero-progress row never freezes the type.
 */
export function habitKindFor(
  habit: HabitDTO,
  habitLogs: HabitLogMap,
  day: string,
  _today: string,
): HabitDTO["kind"] {
  void _today;
  const entry = habitLogEntry(habitLogs, habit.id, day);
  if (hasRecordedProgress(entry)) {
    // Prefer the explicitly recorded kind; fall back to the sign of the points
    // for legacy rows that predate the kind snapshot.
    if (entry!.kindAtRecord === "positive" || entry!.kindAtRecord === "negative") {
      return entry!.kindAtRecord;
    }
    return entry!.points < 0 ? "negative" : "positive";
  }
  return habit.kind;
}

/**
 * A habit's contribution to a specific day.
 *
 * Recorded days with real progress return the snapshot unchanged, so editing
 * a habit's weight, repetitions or type never alters a recorded day. Days
 * without real progress (including provisional zero-progress rows) compute
 * live from current configuration — an entry left at zero never locks in an
 * obsolete reward.
 */
export function habitContributionFor(
  habit: HabitDTO,
  habitLogs: HabitLogMap,
  day: string,
  _today: string,
): number {
  void _today;
  /**
   * A record holding real completed progress is authoritative for ANY date.
   * Unrecorded activity — and provisional zero-progress entries — are
   * calculated from the current configuration.
   */
  const entry = habitLogEntry(habitLogs, habit.id, day);
  if (hasRecordedProgress(entry)) return entry!.points;
  return habitContribution(habit, 0);
}

/**
 * A task's contribution to a specific day.
 *
 * Historical days return the stored snapshot, so editing a task's target or
 * reward never rewrites a past day. Today computes live.
 */
export function taskContributionFor(
  task: TaskConfig,
  taskId: number,
  taskProgress: TaskProgressMap,
  day: string,
  _today: string,
): number {
  void _today;
  /**
   * A recorded progress log is authoritative for ANY date.
   * Unrecorded progress is calculated from the current configuration.
   */
  const entry = taskProgress[String(taskId)]?.[day];
  if (entry) return entry.points;
  return taskContribution(task, 0);
}

/** Progress recorded for a task on a given day. */
export function progressFor(taskProgress: TaskProgressMap, taskId: number, day: string): number {
  return taskProgress[String(taskId)]?.[day]?.progress ?? 0;
}

export function isScheduled(habit: HabitDTO, dayKey: string, weekdayOf: (k: string) => number): boolean {
  if (!habit.days || habit.days.length === 0) return true;
  return habit.days.includes(weekdayOf(dayKey));
}

/* ------------------------------------------------------------------ */
/* Task maths                                                         */
/* ------------------------------------------------------------------ */

export function taskProgressFor(
  progress: TaskProgressMap,
  taskId: number,
  day: string,
): number {
  return progress[String(taskId)]?.[day]?.progress ?? 0;
}

export function taskTarget(task: TaskConfig): number {
  if (task.measureType === "completion") return 1;
  return Math.max(0.000001, Number(task.targetValue) || 1);
}

export function taskCompletionRatio(task: TaskConfig, progress: number): number {
  return Math.max(0, progress) / taskTarget(task);
}

export function taskScoreRatio(task: TaskConfig, progress: number): number {
  return Math.max(0, Math.min(1, taskCompletionRatio(task, progress)));
}

/**
 * Reward a task has earned. Progress only decides how much of the FIXED
 * maximum has been earned — it never raises the maximum.
 *
 * Delegates to `calculateTaskPointsFromSnapshot` so there is exactly ONE
 * formula for earned task points across the live path and the historical
 * snapshot path.
 */
export function taskContribution(task: TaskConfig, progress: number): number {
  return calculateTaskPointsFromSnapshot(progress, task);
}

/**
 * THE authoritative task-points formula.
 *
 *   earned = min(progress / target, 1) × maxPoints, rounded
 *
 * Completion-measured tasks are binary: 0 or the full reward. This is used for
 * BOTH the live path (with current task configuration) AND the historical path
 * (with a day's stored snapshot configuration), so the dashboard, progress,
 * stats and historical day views all agree and editing a task's configuration
 * never rewrites an already-recorded day.
 */
export function calculateTaskPointsFromSnapshot(
  progress: number,
  snap: Pick<TaskConfig, "measureType" | "targetValue" | "maxPoints">,
): number {
  if (snap.measureType === "completion") {
    return progress >= 1 ? Math.max(0, snap.maxPoints) : 0;
  }
  const target = Math.max(0.000001, snap.targetValue || 1);
  return roundPoints(Math.max(0, Math.min(1, progress / target)) * snap.maxPoints);
}

/**
 * Whether a task counts toward a given day's rating.
 *
 * A task earns points on its scheduled day. Tasks without a scheduled date are
 * deliberately NOT applied to every historical day — that would let today's
 * progress contaminate past ratings. They are attributed to the day their
 * progress was actually recorded on.
 */
export function taskAppliesTo(
  task: TaskDTO,
  day: string,
  progress: TaskProgressMap,
): boolean {
  if (task.day) return task.day === day;
  return Object.keys(progress[String(task.id)] ?? {}).includes(day);
}

/** The days a task has any recorded progress on. */
export function taskProgressDays(progress: TaskProgressMap, taskId: number): string[] {
  return Object.keys(progress[String(taskId)] ?? {});
}

/* ------------------------------------------------------------------ */
/* The day score                                                      */
/* ------------------------------------------------------------------ */

export type HabitScoreRow = {
  habit: HabitDTO;
  /** Effective type on this day (recorded kind for historical days). */
  kind: HabitDTO["kind"];
  count: number;
  /** Target that applied when the day was recorded (snapshot). */
  target: number;
  /** Weight that applied when the day was recorded (snapshot). */
  pointValue: number;
  contribution: number;
  scheduled: boolean;
  /** True when the value came from a stored snapshot rather than live config. */
  historical: boolean;
};

export type TaskScoreRow = {
  task: TaskDTO;
  progress: number;
  contribution: number;
  /** True when the value came from a stored snapshot. */
  historical: boolean;
};

export type DayScore = {
  /** Final daily rating, always between 0 and 10. */
  rating: number;
  /** Positive habit contributions. */
  habits: number;
  /** Task contributions. */
  tasks: number;
  /** Penalties from negative habits, as a positive number. */
  penalties: number;
  /** Total positive weight available from habits scheduled that day. */
  habitAvailable: number;
  /** Total fixed reward available from tasks that count that day. */
  taskAvailable: number;
  /** True when habits + tasks available exceeds 10 (see PRODUCT_RULE below). */
  overConfigured: boolean;
  ratio: number;
  habitRows: HabitScoreRow[];
  taskRows: TaskScoreRow[];
};

/**
 * PRODUCT RULE — how the rating relates to configured weights
 * ------------------------------------------------------------------
 * The daily rating is clamped to 0–10. The intended configuration is positive
 * habit weights plus task rewards totalling 10. When the total exceeds 10 the
 * surplus is simply never used — the user's configured values are NOT rescaled
 * and NOT altered. The UI surfaces the surplus explicitly wherever it occurs.
 */
export const INTENDED_DAILY_REWARD = RATING_MAX;

export function scoreDay(
  ctx: ScoringContext,
  day: string,
  weekdayOf: (k: string) => number,
): DayScore {

  let habitsPositive = 0;
  let penalties = 0;
  let habitAvailable = 0;
  const habitRows: HabitScoreRow[] = [];

  for (const habit of ctx.habits) {
    const entry = habitLogEntry(ctx.habitLogs, habit.id, day);

    /**
     * REAL RECORDED PROGRESS MEANS THE HABIT PARTICIPATED IN THAT DAY.
     *
     * The stored record is checked BEFORE the habit's current `enabled` state,
     * `days` schedule, `targetCount`, `pointValue` or `kind`. This is what keeps
     * recorded history immutable: disabling the habit, changing its active
     * weekdays, altering its schedule, flipping its type or editing its weight
     * later must never make an already-recorded contribution disappear.
     *
     * A zero-progress row (an occurrence checked then unchecked) is PROVISIONAL:
     * it marks participation but freezes nothing — the day keeps resolving
     * against the current configuration until real progress is recorded.
     */
    const recorded = hasRecordedProgress(entry);
    const scheduled = !!entry || (habit.enabled && isScheduled(habit, day, weekdayOf));

    const count = entry?.count ?? 0;
    const contribution = recorded ? entry!.points : scheduled ? habitContribution(habit, count) : 0;

    // The recorded kind wins over the habit's current kind.
    const effectiveKind = habitKindFor(habit, ctx.habitLogs, day, ctx.today);

    // The recorded target/weight win over the current configuration.
    const snapshotWeight = recorded ? (entry!.pointValueAtRecord ?? habit.pointValue) : habit.pointValue;
    const snapshotTarget = recorded ? (entry!.targetCountAtRecord ?? habit.targetCount) : habit.targetCount;

    if (scheduled) {
      if (effectiveKind === "negative") {
        if (contribution < 0) penalties += -contribution;
      } else {
        habitAvailable += snapshotWeight;
        habitsPositive += contribution;
      }
    }

    habitRows.push({
      habit,
      kind: effectiveKind,
      count,
      target: effectiveKind === "negative" ? 0 : Math.max(1, snapshotTarget),
      pointValue: snapshotWeight,
      contribution,
      scheduled,
      historical: recorded,
    });
  }

  // ---- tasks ----
  let tasksPositive = 0;
  let taskAvailable = 0;
  const taskRows: TaskScoreRow[] = [];

  for (const task of ctx.tasks) {
    // Archived tasks no longer accept new progress, but their recorded history
    // still counts toward the day it was recorded on.
    if (task.status === "archived" && !ctx.taskProgress[String(task.id)]?.[day]) continue;
    const applies = taskAppliesTo(task, day, ctx.taskProgress);
    const entry = ctx.taskProgress[String(task.id)]?.[day];
    const progress = applies ? (entry?.progress ?? 0) : 0;

    const contribution =
      applies && entry
        ? entry.points
        : applies
          ? taskContribution(task, progress)
          : 0;

    if (applies) {
      taskAvailable += task.maxPoints;
      tasksPositive += contribution;
    }

    taskRows.push({
      task,
      progress,
      contribution,
      historical: !!entry,
    });
  }

  habitsPositive = roundPoints(habitsPositive);
  tasksPositive = roundPoints(tasksPositive);
  penalties = roundPoints(penalties);
  const available = roundPoints(habitAvailable + taskAvailable);

  return {
    rating: clampRating(habitsPositive + tasksPositive - penalties),
    habits: habitsPositive,
    tasks: tasksPositive,
    penalties,
    habitAvailable: roundPoints(habitAvailable),
    taskAvailable: roundPoints(taskAvailable),
    overConfigured: available > INTENDED_DAILY_REWARD + 0.01,
    ratio: clampRating(habitsPositive + tasksPositive - penalties) / RATING_MAX,
    habitRows,
    taskRows,
  };
}

/** Positive weight configured for a day — used for the "aim for 10" guidance. */
export function configuredPositiveWeight(
  habits: HabitDTO[],
  day: string,
  weekdayOf: (k: string) => number,
): number {
  return roundPoints(
    habits
      .filter((h) => h.enabled && h.kind === "positive" && isScheduled(h, day, weekdayOf))
      .reduce((acc, h) => acc + h.pointValue, 0),
  );
}
