import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/dates";
import { normaliseTimezone, todayInZone } from "@/lib/timezone";
import type {
  EventDTO,
  FocusDTO,
  HabitDTO,
  HabitLogMap,
  OccurrenceDTO,
  OccurrenceMap,
  SettingsDTO,
  TaskDTO,
  TaskPriority,
  TaskProgressMap,
  TaskStatus,
  WorkspaceDTO,
} from "@/lib/types";

/**
 * DATA ACCESS ARCHITECTURE
 * ========================
 *
 * Every user-owned row is read and written through the AUTHENTICATED Supabase
 * server client (`getSupabaseServerClient()`). That client attaches the user's
 * session JWT to each PostgREST request, so the database runs under
 * `request.jwt.claims` and ROW LEVEL SECURITY (`user_id = auth.uid()`) enforces
 * isolation at the database layer.
 *
 * There is NO direct PostgreSQL (Drizzle/pg) connection in the application
 * runtime path. A direct pool would connect as a role that bypasses RLS, which
 * would make isolation depend on application-level filtering alone — that is the
 * anti-pattern this codebase deliberately avoids.
 *
 * The authenticated user id is always resolved from the session, never from the
 * request body, query string, or a client-supplied value.
 */

/** Guard rail, not a product limit — the rating stays on a 0-10 scale however many habits are tracked. */
export const MAX_HABITS = 60;

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return base.length > 0 ? base.slice(0, 60) : "habit";
}

export function defaultSettings(): SettingsDTO {
  return {
    theme: "productivity",
    timezone: "Etc/UTC",
    customPrimary: "#2563eb",
    customAccent: "#14b8a6",
    customBackground: "#f6f7f9",
    customCard: "#ffffff",
    customRadius: 14,
    customMode: "light",
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
  };
}

type SettingsRow = {
  user_id?: string;
  theme: string;
  custom_primary: string | null;
  custom_accent: string | null;
  custom_background: string | null;
  custom_card: string | null;
  custom_radius: number;
  custom_mode: string | null;
  timezone: string | null;
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  sessions_before_long_break: number;
};

function settingsDTO(r: SettingsRow): SettingsDTO {
  return {
    theme: r.theme,
    customPrimary: r.custom_primary ?? "#2563eb",
    customAccent: r.custom_accent ?? "#14b8a6",
    customBackground: r.custom_background ?? "#f6f7f9",
    customCard: r.custom_card ?? "#ffffff",
    customRadius: r.custom_radius,
    customMode: (r.custom_mode === "dark" ? "dark" : "light") as "light" | "dark",
    timezone: normaliseTimezone(r.timezone),
    focusMinutes: r.focus_minutes,
    shortBreakMinutes: r.short_break_minutes,
    longBreakMinutes: r.long_break_minutes,
    sessionsBeforeLongBreak: r.sessions_before_long_break,
  };
}

/** Resolves the authenticated client + session user, or null when unauthenticated. */
async function serverUserContext(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

/**
 * Ensures a settings row exists, returning the effective settings DTO.
 *
 * The user id is taken from the authenticated session (never from the caller).
 *
 * Uses upsert (INSERT ... ON CONFLICT (user_id) DO UPDATE) so the call is:
 * - IDEMPOTENT: first load creates defaults, second+ load returns existing row
 * - RACE-SAFE: two concurrent requests both resolve to the same single row
 * - ATOMIC: the database handles the conflict, not application-level checks
 *
 * A SELECT-then-INSERT pattern would be unsafe: two requests could both see
 * "no row" and both attempt INSERT, producing 23505 (duplicate key).
 */
export async function ensureSettings(_userIdHint?: string): Promise<SettingsDTO> {
  const ctx = await serverUserContext();
  if (!ctx) throw new Error("Unauthenticated");
  const { supabase, userId } = ctx;

  // Upsert with select: creates a default row if none exists, or returns the
  // existing one. On conflict the UPDATE clause is a no-op (updated_at is
  // refreshed but no user-configured values are overwritten), then .select()
  // returns the final row in either case.
  const { data: row, error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: false })
    .select("*")
    .single();
  if (error) throw error;
  return settingsDTO(row as SettingsRow);
}

export async function ensureStarterHabits(_userId?: string): Promise<void> {
  // Starter/demo habits are no longer auto-provisioned. A fresh account starts
  // empty so no fake demo data is ever seeded into a real user's workspace.
}

/* ------------------------------------------------------------------ */
/* Row serialisation (PostgREST snake_case -> DTO)                     */
/* ------------------------------------------------------------------ */

export type HabitRow = {
  id: number;
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
  kind: string;
  point_value: number;
  target_count: number;
  days: string;
  schedule_times: string;
  sort_order: number;
  enabled: boolean;
};

export function habitDTO(h: HabitRow): HabitDTO {
  return {
    id: h.id,
    name: h.name,
    slug: h.slug,
    icon: h.icon,
    color: h.color,
    description: h.description,
    kind: h.kind === "negative" ? "negative" : "positive",
    pointValue: Number(h.point_value ?? 1),
    targetCount: Math.max(1, Number(h.target_count ?? 1)),
    days: safeDays(h.days),
    scheduleTimes: safeTimes(h.schedule_times),
    sortOrder: h.sort_order,
    enabled: h.enabled,
  };
}

export type TaskRow = {
  id: number;
  title: string;
  notes: string;
  status: string;
  priority: string;
  category: string;
  measure_type: string;
  target_value: number;
  unit: string | null;
  max_points: number;
  day: string | null;
  start_time: string | null;
  end_time: string | null;
  habit_id: number | null;
  created_at: string;
  completed_at: string | null;
};

export function taskDTO(t: TaskRow): TaskDTO {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status as TaskStatus,
    priority: t.priority as TaskPriority,
    category: t.category,
    measureType: normaliseMeasure(t.measure_type),
    targetValue: Number(t.target_value ?? 1),
    unit: t.unit ?? "",
    maxPoints: Number(t.max_points ?? 0.5),
    day: t.day,
    startTime: t.start_time,
    endTime: t.end_time,
    habitId: t.habit_id,
    createdAt: new Date(t.created_at).toISOString(),
    completedAt: t.completed_at ? new Date(t.completed_at).toISOString() : null,
  };
}

type EventRow = {
  id: number;
  title: string;
  kind: string;
  day: string;
  start_time: string;
  end_time: string;
  notes: string;
  location: string;
  color: string;
};

function eventDTO(e: EventRow): EventDTO {
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    day: e.day,
    startTime: e.start_time,
    endTime: e.end_time,
    notes: e.notes,
    location: e.location,
    color: e.color,
  };
}

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

function focusDTO(f: FocusRow): FocusDTO {
  return {
    id: f.id,
    mode: f.mode as FocusDTO["mode"],
    seconds: f.seconds,
    completed: f.completed,
    habitId: f.habit_id,
    taskId: f.task_id,
    day: f.day,
    startedAt: f.started_at ? new Date(f.started_at).toISOString() : null,
  };
}

export type HabitLogRow = {
  habit_id: number;
  day: string;
  count: number;
  points_earned: number | null;
  point_value_at_record: number | null;
  target_count_at_record: number | null;
  kind_at_record: string | null;
};

/** Builds the habit-log map with the shared snapshot semantics of the workspace. */
export function habitLogMap(rows: HabitLogRow[]): HabitLogMap {
  const logs: HabitLogMap = {};
  for (const row of rows) {
    const key = String(row.habit_id);
    if (!logs[key]) logs[key] = {};
    if (row.count > 0 || row.point_value_at_record != null) {
      logs[key][row.day] = {
        count: row.count,
        points: Number(row.points_earned ?? 0),
        pointValueAtRecord:
          row.point_value_at_record == null ? null : Number(row.point_value_at_record),
        targetCountAtRecord:
          row.target_count_at_record == null ? null : Number(row.target_count_at_record),
        kindAtRecord:
          row.kind_at_record === "negative"
            ? "negative"
            : row.kind_at_record === "positive"
              ? "positive"
              : null,
      };
    }
  }
  return logs;
}

export type TaskProgressLogRow = {
  task_id: number;
  day: string;
  progress: number;
  points_earned: number | null;
  target_value_at_record: number | null;
  max_points_at_record: number | null;
  measure_type_at_record: string | null;
  unit_at_record: string | null;
};

/** Builds the task-progress map with the shared snapshot semantics of the workspace. */
export function taskProgressLogMap(rows: TaskProgressLogRow[]): TaskProgressMap {
  const taskProgress: TaskProgressMap = {};
  for (const row of rows) {
    const key = String(row.task_id);
    if (!taskProgress[key]) taskProgress[key] = {};
    taskProgress[key][row.day] = {
      progress: Number(row.progress ?? 0),
      points: Number(row.points_earned ?? 0),
      targetValueAtRecord:
        row.target_value_at_record == null ? null : Number(row.target_value_at_record),
      maxPointsAtRecord:
        row.max_points_at_record == null ? null : Number(row.max_points_at_record),
      measureTypeAtRecord:
        row.measure_type_at_record === "time" ||
        row.measure_type_at_record === "quantity" ||
        row.measure_type_at_record === "count" ||
        row.measure_type_at_record === "completion"
          ? (row.measure_type_at_record as TaskDTO["measureType"])
          : null,
      unitAtRecord: row.unit_at_record == null ? null : String(row.unit_at_record),
    };
  }
  return taskProgress;
}

type OccurrenceRow = {
  id: number;
  habit_id: number;
  day: string;
  occurrence_index: number;
  scheduled_time: string | null;
  completed: boolean;
};

/* ------------------------------------------------------------------ */
/* Workspace load                                                      */
/* ------------------------------------------------------------------ */

export async function loadWorkspace(_userIdHint?: string): Promise<WorkspaceDTO> {
  const ctx = await serverUserContext();
  if (!ctx) throw new Error("Unauthenticated");
  const { supabase, userId } = ctx;

  const settings = await ensureSettings(userId);
  const today = todayInZone(settings.timezone);
  const logFloor = addDays(today, -540);
  const focusFloor = addDays(today, -400);

  const [
    habitRes,
    logRes,
    occRes,
    taskRes,
    progressRes,
    eventRes,
    focusRes,
  ] = await Promise.all([
    supabase
      .from("habits")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("habit_logs")
      .select("habit_id, day, count, points_earned, point_value_at_record, target_count_at_record, kind_at_record")
      .eq("user_id", userId)
      .gte("day", logFloor),
    supabase
      .from("habit_occurrences")
      .select("id, habit_id, day, occurrence_index, scheduled_time, completed")
      .eq("user_id", userId)
      .gte("day", logFloor),
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(600),
    supabase
      .from("task_progress_logs")
      .select("task_id, day, progress, points_earned, target_value_at_record, max_points_at_record, measure_type_at_record, unit_at_record")
      .eq("user_id", userId)
      .gte("day", logFloor),
    supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", userId)
      .order("day", { ascending: true })
      .limit(900),
    supabase
      .from("focus_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("day", focusFloor),
  ]);

  for (const res of [habitRes, logRes, occRes, taskRes, progressRes, eventRes, focusRes]) {
    if (res.error) throw res.error;
  }

  const logs = habitLogMap((logRes.data ?? []) as HabitLogRow[]);

  const occurrences: OccurrenceMap = {};
  for (const row of (occRes.data ?? []) as OccurrenceRow[]) {
    const idx = Number(row.occurrence_index);
    if (!Number.isFinite(idx)) continue;
    const habitKey = String(row.habit_id);
    const day = String(row.day);
    if (!occurrences[habitKey]) occurrences[habitKey] = {};
    if (!occurrences[habitKey][day]) occurrences[habitKey][day] = {};
    occurrences[habitKey][day][idx] = {
      id: Number(row.id),
      habitId: Number(row.habit_id),
      day,
      occurrenceIndex: idx,
      scheduledTime: String(row.scheduled_time ?? ""),
      completed: row.completed === true,
    };
  }

  const taskProgress = taskProgressLogMap((progressRes.data ?? []) as TaskProgressLogRow[]);

  return {
    habits: (habitRes.data ?? []).map((h: any) => habitDTO(h as HabitRow)),
    logs,
    occurrences,
    tasks: (taskRes.data ?? []).map((t: any) => taskDTO(t as TaskRow)),
    taskProgress,
    events: (eventRes.data ?? []).map((e: any) => eventDTO(e as EventRow)),
    focus: (focusRes.data ?? []).map((f: any) => focusDTO(f as FocusRow)),
    settings,
    today,
  };
}

function normaliseMeasure(raw: string): TaskDTO["measureType"] {
  return raw === "time" || raw === "quantity" || raw === "count" ? raw : "completion";
}

function safeTimes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((t): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
        .slice(0, 24)
        .sort();
    }
  } catch {
    /* ignore */
  }
  return [];
}

function safeDays(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6);
    }
  } catch {
    /* ignore */
  }
  return [];
}
