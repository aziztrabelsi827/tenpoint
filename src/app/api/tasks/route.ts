import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUserContext } from "@/lib/auth";
import { sanitizeMaxPoints } from "@/lib/tasks";
import { upsertTaskProgress } from "@/lib/task-progress";
import { normaliseTimezone, todayInZone } from "@/lib/timezone";
import type { TaskDTO, TaskMeasureType, TaskPriority, TaskStatus } from "@/lib/types";
import { TASK_PROGRESS_LIMIT } from "@/lib/types";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "completed"];
const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
const MEASURES: TaskMeasureType[] = ["time", "quantity", "count", "completion"];
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type TaskRow = {
  id: number;
  title: string;
  notes: string;
  status: string;
  priority: string;
  category: string;
  measureType: string;
  targetValue: number;
  unit: string;
  maxPoints: number;
  day: string | null;
  startTime: string | null;
  endTime: string | null;
  habitId: number | null;
  createdAt: string;
  completedAt: string | null;
};

type TaskPayload = {
  id?: number;
  title?: string;
  notes?: string;
  status?: string;
  priority?: string;
  category?: string;
  measureType?: string;
  targetValue?: number;
  unit?: string;
  maxPoints?: number;
  /** Progress for a specific calendar day (the user's local date). */
  progress?: number;
  /** Which calendar day the progress belongs to. Defaults to the user's today. */
  progressDay?: string;
  day?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  habitId?: number | null;
};

function mapTaskRow(r: Record<string, unknown>): TaskRow {
  return {
    id: Number(r.id),
    title: String(r.title ?? ""),
    notes: String(r.notes ?? ""),
    status: String(r.status ?? "todo"),
    priority: String(r.priority ?? "medium"),
    category: String(r.category ?? ""),
    measureType: String(r.measure_type ?? "completion"),
    targetValue: Number(r.target_value ?? 1),
    unit: String(r.unit ?? ""),
    maxPoints: Number(r.max_points ?? 0.5),
    day: r.day == null ? null : String(r.day),
    startTime: r.start_time == null ? null : String(r.start_time),
    endTime: r.end_time == null ? null : String(r.end_time),
    habitId: r.habit_id == null ? null : Number(r.habit_id),
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : new Date(0).toISOString(),
    completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : null,
  };
}

function serialise(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    category: row.category,
    measureType: MEASURES.includes(row.measureType as TaskMeasureType)
      ? (row.measureType as TaskMeasureType)
      : "completion",
    targetValue: Number(row.targetValue ?? 1),
    unit: row.unit ?? "",
    maxPoints: Number(row.maxPoints ?? 0.5),
    day: row.day,
    startTime: row.startTime,
    endTime: row.endTime,
    habitId: row.habitId,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

/** Validates and normalises the measurable-task configuration. */
function readMeasure(body: TaskPayload) {
  const measureType = MEASURES.includes(body.measureType as TaskMeasureType)
    ? (body.measureType as TaskMeasureType)
    : "completion";

  let targetValue = Number(body.targetValue);
  if (!Number.isFinite(targetValue) || targetValue <= 0) targetValue = 1;
  if (measureType === "completion") targetValue = 1;
  targetValue = Math.min(TASK_PROGRESS_LIMIT, targetValue);

  const unit =
    measureType === "time" || measureType === "completion"
      ? ""
      : (body.unit ?? "").toString().trim().slice(0, 20);

  const maxPoints = body.maxPoints === undefined ? 0.5 : sanitizeMaxPoints(body.maxPoints);

  return { measureType, targetValue, unit, maxPoints };
}

/** Server-side resolution of the user's local calendar day via Supabase. */
async function userTodayFor(userId: string, supabase: SupabaseClient) {
  const { data } = await supabase
    .from("user_settings")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  return todayInZone(normaliseTimezone(data?.timezone));
}

export async function POST(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as TaskPayload;

  const title = (body.title ?? "").trim();
  if (title.length === 0) return NextResponse.json({ error: "Task needs a title." }, { status: 400 });

  const status = STATUSES.includes(body.status as TaskStatus) ? (body.status as TaskStatus) : "todo";
  const priority = PRIORITIES.includes(body.priority as TaskPriority)
    ? (body.priority as TaskPriority)
    : "medium";
  const day = typeof body.day === "string" && KEY_RE.test(body.day) ? body.day : null;
  const measure = readMeasure(body);
  if (measure.maxPoints === null) {
    return NextResponse.json({ error: "Maximum reward must be between 0 and 10." }, { status: 400 });
  }

  const startTime = TIME_RE.test(body.startTime ?? "") ? (body.startTime as string) : null;
  const endTime = TIME_RE.test(body.endTime ?? "") ? (body.endTime as string) : null;
  if (startTime && endTime && startTime > endTime) {
    return NextResponse.json({ error: "Task end time must be after its start time." }, { status: 400 });
  }

  // A task may link a habit, but only one the session user owns. The FK alone
  // can't scope by owner, so the reference is resolved explicitly first.
  let habitId: number | null = null;
  if (body.habitId != null) {
    const parsed = Math.round(Number(body.habitId));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "Task needs a valid habit." }, { status: 400 });
    }
    const { data: habit } = await supabase
      .from("habits")
      .select("id")
      .eq("id", parsed)
      .eq("user_id", userId)
      .maybeSingle();
    if (!habit) return NextResponse.json({ error: "Habit not found." }, { status: 404 });
    habitId = parsed;
  }

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title: title.slice(0, 160),
      notes: (body.notes ?? "").slice(0, 2000),
      status,
      priority,
      category: (body.category ?? "General").slice(0, 40) || "General",
      measure_type: measure.measureType,
      target_value: measure.targetValue,
      unit: measure.unit,
      max_points: measure.maxPoints,
      day,
      start_time: startTime,
      end_time: endTime,
      habit_id: habitId,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "Could not create the task." }, { status: 500 });

  const task = serialise(mapTaskRow(inserted as Record<string, unknown>));

  // Optional initial progress, recorded against the user's local today.
  const progress = Math.max(0, Math.min(TASK_PROGRESS_LIMIT, Math.round(Number(body.progress ?? 0) * 100) / 100));
  let progressResult = { progress: 0, points: 0 };
  if (progress > 0) {
    const progressDay =
      typeof body.progressDay === "string" && KEY_RE.test(body.progressDay)
        ? body.progressDay
        : await userTodayFor(userId, supabase);
    try {
      progressResult = await upsertTaskProgress(supabase, userId, task.id, progressDay, progress, {
        measureType: task.measureType,
        targetValue: task.targetValue,
        unit: task.unit,
        maxPoints: task.maxPoints,
        status: task.status,
      }, { cohereStatus: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not write task progress." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    task,
    progress: progressResult,
    contribution: progressResult.points,
  });
}

export async function PATCH(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as TaskPayload;
  if (!body.id) return NextResponse.json({ error: "Missing task id" }, { status: 400 });

  const { data: current, error: readError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", body.id)
    .eq("user_id", userId)
    .single();
  if (readError && readError.code !== "PGRST116") {
    return NextResponse.json({ error: "Could not load the task." }, { status: 500 });
  }
  if (!current) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const existing = mapTaskRow(current as Record<string, unknown>);

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 160);
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000);
  if (typeof body.category === "string") patch.category = body.category.slice(0, 40) || "General";
  if (body.day === null || (typeof body.day === "string" && KEY_RE.test(body.day))) patch.day = body.day;
  if (body.startTime === null || (typeof body.startTime === "string" && TIME_RE.test(body.startTime)))
    patch.start_time = body.startTime;
  if (body.endTime === null || (typeof body.endTime === "string" && TIME_RE.test(body.endTime)))
    patch.end_time = body.endTime;

  // A relink must point to a habit the session user owns; null explicitly
  // detaches the task. Ownership is resolved before the write so a foreign id
  // can never be persisted (RLS WITH CHECK is the final safety net).
  if (body.habitId !== undefined) {
    if (body.habitId === null) {
      patch.habit_id = null;
    } else {
      const parsed = Math.round(Number(body.habitId));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json({ error: "Task needs a valid habit." }, { status: 400 });
      }
      const { data: habit } = await supabase
        .from("habits")
        .select("id")
        .eq("id", parsed)
        .eq("user_id", userId)
        .maybeSingle();
      if (!habit) return NextResponse.json({ error: "Habit not found." }, { status: 404 });
      patch.habit_id = parsed;
    }
  }

  // Either slot may change alone (e.g. drag-to-resize sends just an end time).
  // Validate the resulting pair against the stored partner so the effective
  // range never inverts.
  if (patch.start_time !== undefined || patch.end_time !== undefined) {
    const start = patch.start_time !== undefined ? (patch.start_time as string) : existing.startTime;
    const end = patch.end_time !== undefined ? (patch.end_time as string) : existing.endTime;
    if (start && end && start > end) {
      return NextResponse.json({ error: "Task end time must be after its start time." }, { status: 400 });
    }
  }

  if (typeof body.status === "string" && STATUSES.includes(body.status as TaskStatus)) {
    patch.status = body.status;
    patch.completed_at = body.status === "completed" ? new Date().toISOString() : null;
  }
  if (typeof body.priority === "string" && PRIORITIES.includes(body.priority as TaskPriority))
    patch.priority = body.priority;

  const hasMeasure =
    body.measureType !== undefined ||
    body.targetValue !== undefined ||
    body.unit !== undefined ||
    body.maxPoints !== undefined;

  if (hasMeasure) {
    const measure = readMeasure({
      measureType: body.measureType ?? existing.measureType,
      targetValue: body.targetValue ?? Number(existing.targetValue),
      unit: body.unit ?? existing.unit ?? "",
      maxPoints: body.maxPoints ?? Number(existing.maxPoints),
    });
    if (measure.maxPoints === null) {
      return NextResponse.json({ error: "Maximum reward must be between 0 and 10." }, { status: 400 });
    }
    patch.measure_type = measure.measureType;
    patch.target_value = measure.targetValue;
    patch.unit = measure.unit;
    patch.max_points = measure.maxPoints;
  }

  // A progress-only update produces no task-column changes; skip the write.
  let task: TaskDTO;
  if (Object.keys(patch).length === 0) {
    task = serialise(existing);
  } else {
    const { data: updated, error: taskUpdateError } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", body.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (taskUpdateError) return NextResponse.json({ error: "Could not update the task." }, { status: 500 });
    task = serialise(updated ? mapTaskRow(updated as Record<string, unknown>) : existing);
  }

  /**
   * Task-progress snapshots are IMMUTABLE to configuration changes.
   *
   * A progress log records one day's progress and the reward that day earned.
   * Once it exists, its `progress` and `pointsEarned` belong to that day and are
   * never rewritten — regardless of whether the day is historical, today or in
   * the future. New configuration only affects progress recorded from now on.
   */

  // Progress update for a specific day.
  let progressResult: { progress: number; points: number } | null = null;
  if (body.progress !== undefined) {
    const progress = Math.max(
      0,
      Math.min(TASK_PROGRESS_LIMIT, Math.round(Number(body.progress) * 100) / 100),
    );
    const progressDay =
      typeof body.progressDay === "string" && KEY_RE.test(body.progressDay)
        ? body.progressDay
        : await userTodayFor(userId, supabase);
    try {
      progressResult = await upsertTaskProgress(supabase, userId, task.id, progressDay, progress, {
        measureType: task.measureType,
        targetValue: task.targetValue,
        unit: task.unit,
        maxPoints: task.maxPoints,
        status: task.status,
      }, { cohereStatus: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not write task progress." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    task,
    progress: progressResult,
    contribution: progressResult?.points ?? null,
  });
}

/**
 * Deletes a task.
 *
 * DESTRUCTIVE DELETE IS GUARDED: tasks with recorded progress history are
 * archived (status set to a hidden/archived state) rather than deleted, because
 * cascade-deleting them would erase task_progress_logs and silently rewrite the
 * daily ratings those sessions contributed to.
 *
 * Tasks with no progress history are removed permanently.
 */
export async function DELETE(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as { id?: number; force?: boolean };
  if (!body.id) return NextResponse.json({ error: "Missing task id" }, { status: 400 });

  const { data: task, error: taskReadError } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("id", body.id)
    .eq("user_id", userId)
    .single();
  if (taskReadError && taskReadError.code !== "PGRST116") {
    return NextResponse.json({ error: "Could not load the task." }, { status: 500 });
  }
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const { count, error: progressCountError } = await supabase
    .from("task_progress_logs")
    .select("id", { count: "exact", head: true })
    .eq("task_id", body.id)
    .eq("user_id", userId);
  if (progressCountError) return NextResponse.json({ error: "Could not check task history." }, { status: 500 });

  const hasHistory = (count ?? 0) > 0;

  if (hasHistory && body.force !== true) {
    // Archive: keep every historical progress record, hide the task going forward.
    const { error: archiveError } = await supabase
      .from("tasks")
      .update({ status: "archived", day: null, start_time: null, end_time: null })
      .eq("id", body.id)
      .eq("user_id", userId);
    if (archiveError) return NextResponse.json({ error: "Could not archive the task." }, { status: 500 });

    return NextResponse.json({
      ok: true,
      archived: true,
      message: `“${task.title}” has ${count ?? 0} recorded day(s). It was archived instead of deleted so your history stays accurate. Pass force: true to delete permanently.`,
    });
  }

  const { error: deleteError } = await supabase.from("tasks").delete().eq("id", body.id).eq("user_id", userId);
  if (deleteError) return NextResponse.json({ error: "Could not delete the task." }, { status: 500 });
  return NextResponse.json({ ok: true, archived: false });
}

export const dynamic = "force-dynamic";
