import { formatPoints, roundPoints } from "@/lib/format";
import type { TaskConfig } from "@/lib/scoring";
import { TASK_MAX_POINTS, TASK_PROGRESS_LIMIT, type TaskDTO } from "@/lib/types";

/** The subset of a task the reward maths actually reads. */
/**
 * The subset of task configuration the reward maths reads, plus the progress
 * value for a specific day. Progress is deliberately NOT part of TaskDTO
 * because it is a per-day value.
 */
export type TaskLike = {
  measureType: TaskDTO["measureType"];
  targetValue: number;
  unit: string;
  maxPoints: number;
  status?: TaskDTO["status"];
};

/* ------------------------------------------------------------------ */
/* Task reward maths                                                  */
/*                                                                     */
/* Re-exported from the shared scoring model so there is exactly ONE   */
/* implementation. Progress is always passed in explicitly because it  */
/* is now a per-day value.                                            */
/* ------------------------------------------------------------------ */

export {
  taskTarget,
  taskCompletionRatio,
  taskScoreRatio,
  taskContribution,
  calculateTaskPointsFromSnapshot,
  taskProgressFor,
  taskAppliesTo,
  taskProgressDays,
} from "@/lib/scoring";

import {
  taskTarget as _target,
  taskContribution as _contribution,
  taskScoreRatio as _ratio,
  taskCompletionRatio as _completion,
} from "@/lib/scoring";

/** The capped ratio actually used for scoring. */
export function ratioFor(task: TaskConfig, progress: number): number {
  return _ratio(task, progress);
}

/** Uncapped ratio, so 150% can still be displayed. */
export function completionRatio(task: TaskConfig, progress: number): number {
  return _completion(task, progress);
}

/** Points earned, capped at the task's fixed maximum reward. */
export function contribution(task: TaskConfig, progress: number): number {
  return _contribution(task, progress);
}

/** Unit suffix for number inputs in the editor. */
export function taskUnitLabel(task: Pick<TaskLike, "measureType" | "unit">): string {
  if (task.measureType === "time") return "minutes";
  if (task.measureType === "completion") return "—";
  return task.unit || (task.measureType === "count" ? "reps" : "units");
}

/** Human label for one unit of progress, e.g. "1h 20m" or "20 pages". */
export function formatTaskProgress(task: Pick<TaskConfig, "measureType" | "unit">, progress: number): string {
  if (task.measureType === "time") return formatMinutes(progress);
  if (task.measureType === "completion") return progress >= 1 ? "done" : "not done";
  const unit = task.unit || (task.measureType === "count" ? "reps" : "units");
  return `${formatPoints(Math.round(progress * 100) / 100, 2)} ${unit}`;
}

/** Human label for the target. */
export function formatTaskTarget(task: TaskConfig): string {
  if (task.measureType === "time") return formatMinutes(_target(task));
  if (task.measureType === "completion") return "complete";
  const unit = task.unit || (task.measureType === "count" ? "reps" : "units");
  return `${formatPoints(_target(task), 2)} ${unit}`;
}

/** "1h 20m / 2h" — actual over intended. */
export function formatTaskProgressOverTarget(
  task: TaskConfig,
  progress: number,
): string {
  return `${formatTaskProgress(task, progress)} / ${formatTaskTarget(task)}`;
}

/** "1h 20m" from minutes. */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

/** Parses "1h 20m", "1:20", "90m", "1.5" into minutes. */
export function parseMinutes(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "") return null;
  if (/^[0-9]+:[0-9]{1,2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(":").map(Number);
    return h * 60 + m;
  }
  const hm = /^([0-9]*\.?[0-9]+)\s*h(?:ours?|rs?)?(?:\s*([0-9]*\.?[0-9]+)\s*m(?:in(?:utes?)?)?)?$/.exec(trimmed);
  if (hm) {
    return Math.round(parseFloat(hm[1]) * 60 + (hm[2] ? parseFloat(hm[2]) : 0));
  }
  const mOnly = /^([0-9]*\.?[0-9]+)\s*(?:m|min|mins|minutes?)$/.exec(trimmed);
  if (mOnly) return Math.round(parseFloat(mOnly[1]));
  if (/^[0-9]*\.?[0-9]+$/.test(trimmed)) return Math.round(parseFloat(trimmed) * 60);
  return null;
}

/** Human label for one unit of progress, e.g. "1h 20m" or "20 pages". */
export function sanitizeMaxPoints(input: unknown): number | null {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded < 0 || rounded > TASK_MAX_POINTS) return null;
  return rounded;
}
