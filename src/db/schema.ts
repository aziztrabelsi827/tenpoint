import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  doublePrecision,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database schema.
 *
 * The AUTHORITATIVE schema lives in the SQL migrations under `supabase/`.
 * This file mirrors that schema for the Drizzle query layer ONLY — it is kept
 * in lockstep with the migrations so there is one consistent mental model and
 * never a competing migration system. Supabase migrations define tables,
 * indexes, FKs, constraints and RLS; this file provides typed access.
 *
 * Identity: primary keys for app rows remain surrogate `serial` ids, while
 * OWNERSHIP is `user_id uuid` referencing `auth.users.id`. RLS protects every
 * user-owned row with `user_id = auth.uid()`.
 */
export function authUserId() {
  return uuid("user_id");
}

/* ------------------------------------------------------------------ */
/* Profile (1:1 with auth.users.id)                                    */
/* ------------------------------------------------------------------ */

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name").notNull().default(""),
  displayName: text("display_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey(),
  theme: text("theme").notNull().default("productivity"),
  customPrimary: text("custom_primary").default("#2563eb"),
  customAccent: text("custom_accent").default("#14b8a6"),
  customBackground: text("custom_background").default("#f6f7f9"),
  customCard: text("custom_card").default("#ffffff"),
  customRadius: integer("custom_radius").notNull().default(14),
  customMode: text("custom_mode").notNull().default("light"),
  /** IANA timezone, e.g. Africa/Tunis. Drives every "today" calculation. */
  timezone: text("timezone").notNull().default("Etc/UTC"),
  focusMinutes: integer("focus_minutes").notNull().default(25),
  shortBreakMinutes: integer("short_break_minutes").notNull().default(5),
  longBreakMinutes: integer("long_break_minutes").notNull().default(15),
  sessionsBeforeLongBreak: integer("sessions_before_long_break").notNull().default(4),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Habits                                                             */
/* ------------------------------------------------------------------ */

export const habits = pgTable(
  "habits",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    icon: text("icon").notNull().default("✅"),
    color: text("color").notNull().default("#2563eb"),
    description: text("description").notNull().default(""),
    /** positive = adds to the day's rating, negative = subtracts from it. */
    kind: text("kind").notNull().default("positive"),
    /**
     * Weight of the habit on the 0-10 daily rating.
     * Positive habit: maximum contribution once every occurrence is completed.
     * Negative habit: penalty applied per recorded occurrence.
     */
    pointValue: doublePrecision("point_value").notNull().default(1),
    /** How many occurrences per day this habit is meant to be completed. */
    targetCount: integer("target_count").notNull().default(1),
    /**
     * JSON text, length 7, indexed Sun(0)..Sat(6). Each entry is a whole number
     * 1..20 overriding `targetCount` for that weekday, or null to fall back to it.
     */
    weekdayTargets: text("weekday_targets").notNull().default("[]"),
    /** JSON encoded number[] of weekday indexes (0=Sun). Empty = every day. */
    days: text("days").notNull().default("[]"),
    /** JSON encoded string[] of "HH:MM" times when scheduled on the calendar. */
    scheduleTimes: text("schedule_times").notNull().default("[]"),
    sortOrder: integer("sort_order").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    /** NULL = active. NOT NULL = archived (hidden from the current UI). */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("habits_user_slug_idx").on(t.userId, t.slug)],
);

export const habitLogs = pgTable(
  "habit_logs",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    habitId: integer("habit_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    /** How many occurrences of this habit were completed on this day. */
    count: integer("count").notNull().default(1),
    /** Snapshot of the contribution this day made to the 0-10 rating. */
    pointsEarned: doublePrecision("points_earned").notNull().default(0),
    /**
     * Configuration snapshot captured when this day was first recorded. Later
     * occurrence edits on the SAME day use these values, so changing a habit's
     * weight, target or kind never rewrites what an already-recorded day earned.
     * NULL for legacy rows created before snapshots existed — those keep their
     * stored pointsEarned untouched.
     */
    pointValueAtRecord: doublePrecision("point_value_at_record"),
    targetCountAtRecord: integer("target_count_at_record"),
    kindAtRecord: text("kind_at_record"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habit_logs_habit_day_uidx").on(t.habitId, t.day),
    index("habit_logs_user_day_idx").on(t.userId, t.day),
  ],
);

/* ------------------------------------------------------------------ */
/* Habit occurrences                                                  */
/* ------------------------------------------------------------------ */

export const habitOccurrences = pgTable(
  "habit_occurrences",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    habitId: integer("habit_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    /** Index into the habit's scheduleTimes for that day. */
    occurrenceIndex: integer("occurrence_index").notNull(),
    /** The scheduled time this occurrence represents, e.g. "13:00". */
    scheduledTime: text("scheduled_time").notNull(),
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("habit_occurrences_habit_day_idx_idx").on(t.habitId, t.day, t.occurrenceIndex),
    index("habit_occurrences_user_day_idx").on(t.userId, t.day),
  ],
);

/* ------------------------------------------------------------------ */
/* Tasks                                                              */
/* ------------------------------------------------------------------ */

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("todo"), // todo | in_progress | completed | archived
    priority: text("priority").notNull().default("medium"), // low | medium | high
    category: text("category").notNull().default("General"),
    measureType: text("measure_type").notNull().default("completion"),
    /** What the user intends to accomplish. Measured in the unit above. */
    targetValue: doublePrecision("target_value").notNull().default(1),
    /** Free-text unit label, e.g. pages / km / reps. Empty for time and completion. */
    unit: text("unit").notNull().default(""),
    /**
     * The FIXED maximum reward this task can add to the daily rating.
     * This is task CONFIGURATION — progress never raises it.
     */
    maxPoints: doublePrecision("max_points").notNull().default(0.5),
    /** The day this task is scheduled for. Progress is tracked per day below. */
    day: date("day", { mode: "string" }),
    startTime: text("start_time"),
    endTime: text("end_time"),
    habitId: integer("habit_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("tasks_user_day_idx").on(t.userId, t.day)],
);

/* ------------------------------------------------------------------ */
/* Task progress history                                              */
/* ------------------------------------------------------------------ */

export const taskProgressLogs = pgTable(
  "task_progress_logs",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    taskId: integer("task_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    /** What was actually completed on this day, in the task's own unit. */
    progress: doublePrecision("progress").notNull().default(0),
    /** Snapshot of the reward this day earned toward the daily rating. */
    pointsEarned: doublePrecision("points_earned").notNull().default(0),
    /**
     * Task configuration captured when this day was FIRST recorded, so later
     * edits to the task's target/reward/measure never rewrite the day. WRITE-ONCE.
     * NULL on legacy rows created before snapshots existed — those keep their
     * frozen pointsEarned and are never reinterpreted from current settings.
     */
    targetValueAtRecord: doublePrecision("target_value_at_record"),
    maxPointsAtRecord: doublePrecision("max_points_at_record"),
    measureTypeAtRecord: text("measure_type_at_record"),
    unitAtRecord: text("unit_at_record"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("task_progress_task_day_idx").on(t.taskId, t.day),
    index("task_progress_user_day_idx").on(t.userId, t.day),
  ],
);

/* ------------------------------------------------------------------ */
/* Calendar events                                                    */
/* ------------------------------------------------------------------ */

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("event"), // event | personal | work | focus
    day: date("day", { mode: "string" }).notNull(),
    startTime: text("start_time").notNull().default("09:00"),
    endTime: text("end_time").notNull().default("10:00"),
    notes: text("notes").notNull().default(""),
    location: text("location").notNull().default(""),
    color: text("color").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calendar_events_user_day_idx").on(t.userId, t.day)],
);

/* ------------------------------------------------------------------ */
/* Focus sessions                                                     */
/* ------------------------------------------------------------------ */

export const focusSessions = pgTable(
  "focus_sessions",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    mode: text("mode").notNull().default("focus"), // focus | short_break | long_break
    seconds: integer("seconds").notNull().default(0),
    completed: boolean("completed").notNull().default(true),
    habitId: integer("habit_id"),
    taskId: integer("task_id"),
    day: date("day", { mode: "string" }).notNull(),
    /** When the session actually started, so the calendar can position it. */
    startedAt: timestamp("started_at", { withTimezone: true }),
    /** Absolute instant the current run must end while RUNNING (else NULL). */
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Frozen countdown (seconds) while PAUSED; NULL otherwise. */
    remainingSeconds: integer("remaining_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("focus_sessions_user_day_idx").on(t.userId, t.day),
    index("focus_sessions_active_idx")
      .on(t.userId, t.id)
      .where(sql`${t.completed} is not true`),
  ],
);

/* ------------------------------------------------------------------ */
/* Push subscriptions                                                  */
/* ------------------------------------------------------------------ */

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
  index("push_subscriptions_user_idx").on(t.userId),
]);

/* ------------------------------------------------------------------ */
/* Scheduled reminders (idempotent 30-min-before queue)                */
/* ------------------------------------------------------------------ */

export const scheduledReminders = pgTable(
  "scheduled_reminders",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    sourceType: text("source_type").notNull(), // 'task' | 'event'
    sourceId: integer("source_id").notNull(),
    title: text("title").notNull().default(""),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    reminderType: text("reminder_type").notNull().default("30min_before"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("scheduled_reminders_due_idx").on(t.scheduledFor),
    index("scheduled_reminders_user_idx").on(t.userId),
  ],
);

export type UserRow = typeof profiles.$inferSelect;
export type HabitRow = typeof habits.$inferSelect;
export type HabitLogRow = typeof habitLogs.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type EventRow = typeof calendarEvents.$inferSelect;
export type FocusRow = typeof focusSessions.$inferSelect;
export type TaskProgressRow = typeof taskProgressLogs.$inferSelect;
export type HabitOccurrenceRow = typeof habitOccurrences.$inferSelect;
export type SettingsRow = typeof userSettings.$inferSelect;
