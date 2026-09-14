"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { slugify } from "@/lib/slug";
import { buildCustomTokens, cssVarMap, type CustomThemeInput, type ThemeId } from "@/lib/themes";
import { todayInZone } from "@/lib/timezone";
import { weekdayOf } from "@/lib/dates";
import {
  calculateHabitPointsFromSnapshot,
  effectiveTargetFor,
  resolveHabitSnapshot,
  taskContribution,
} from "@/lib/scoring";
import { roundPoints } from "@/lib/format";
import {
  HABIT_LIMIT,
  type EventDTO,
  type OccurrenceDTO,
  type OccurrenceMap,
  type FocusDTO,
  type HabitDTO,
  type HabitKind,
  type HabitLogMap,
  type TaskMeasureType,
  type SettingsDTO,
  type TaskDTO,
  type TaskProgressMap,
  type TaskPriority,
  type TaskStatus,
  type WorkspaceDTO,
} from "@/lib/types";
import { useToast } from "@/components/ui";

type NewHabit = {
  name: string;
  icon: string;
  color: string;
  description: string;
  days: number[];
  scheduleTimes?: string[];
  pointValue: number;
  kind: HabitKind;
  targetCount: number;
  weekdayTargets?: (number | null)[];
};

type NewTask = {
  title: string;
  notes?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  measureType?: TaskMeasureType;
  targetValue?: number;
  unit?: string;
  maxPoints?: number;
  progress?: number;
  progressDay?: string;
  day?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  habitId?: number | null;
};

type NewEvent = {
  title: string;
  kind?: string;
  day: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  location?: string;
  color?: string;
};

type WorkspaceValue = {
  habits: HabitDTO[];
  archivedHabits: HabitDTO[];
  allHabits: HabitDTO[];
  logs: HabitLogMap;
  occurrences: OccurrenceMap;
  taskProgress: TaskProgressMap;
  /** The user's local calendar date — the single source of truth for "today". */
  today: string;
  timezone: string;
  tasks: TaskDTO[];
  events: EventDTO[];
  focus: FocusDTO[];
  settings: SettingsDTO;
  busy: Record<string, boolean>;
  setHabitCount: (habitId: number, day: string, count: number) => Promise<void>;
  /** Toggles one scheduled occurrence; keeps the aggregate habit log in sync. */
  toggleOccurrence: (
    habitId: number,
    day: string,
    occurrenceIndex: number,
    scheduledTime: string,
    completed: boolean,
  ) => Promise<void>;
  occurrenceFor: (habitId: number, day: string, index: number) => OccurrenceDTO | null;
  cycleHabit: (habitId: number, day: string) => void;
  countFor: (habitId: number, day: string) => number;
  isDone: (habitId: number, day: string) => boolean;
  createHabit: (input: NewHabit) => Promise<boolean>;
  updateHabit: (id: number, patch: Partial<HabitDTO>) => Promise<void>;
  deleteHabit: (id: number) => Promise<void>;
  moveHabit: (id: number, direction: -1 | 1) => Promise<void>;
  createTask: (input: NewTask) => Promise<void>;
  updateTask: (id: number, patch: Partial<TaskDTO>) => Promise<void>;
  setTaskProgress: (id: number, day: string, progress: number) => Promise<void>;
  taskProgressFor: (taskId: number, day: string) => number;
  deleteTask: (id: number) => Promise<void>;
  createEvent: (input: NewEvent) => Promise<void>;
  updateEvent: (id: number, patch: Partial<EventDTO>) => Promise<void>;
  deleteEvent: (id: number) => Promise<void>;
  logFocus: (input: { mode: string; seconds: number; habitId: number | null; taskId: number | null; day: string }) => Promise<void>;
  /** The user's active or paused focus session (never more than one). */
  focusSession: FocusDTO | null;
  startFocusSession: (input: { mode: string; seconds: number; habitId: number | null; taskId: number | null }) => Promise<void>;
  pauseFocusSession: () => Promise<void>;
  resumeFocusSession: () => Promise<void>;
  completeFocusSession: () => Promise<void>;
  discardFocusSession: () => Promise<void>;
  /** Re-fetches the active session so multiple tabs converge on the same one. */
  refreshFocusSession: () => Promise<void>;
  saveSettings: (patch: Partial<SettingsDTO>) => Promise<void>;
  setTheme: (theme: ThemeId, custom?: CustomThemeInput) => void;
  MAX_HABITS: number;
  positiveWeight: number;
};

const Ctx = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

const MAX_HABITS = HABIT_LIMIT;

async function api(path: string, method: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: WorkspaceDTO;
  children: ReactNode;
}) {
  const toast = useToast();
  const [habits, setHabits] = useState<HabitDTO[]>(initial.habits);
  const [archivedHabits, setArchivedHabits] = useState<HabitDTO[]>(initial.archivedHabits ?? []);
  const [logs, setLogs] = useState<HabitLogMap>(initial.logs);
  const [occurrences, setOccurrences] = useState<OccurrenceMap>(initial.occurrences);
  const [taskProgress, setTaskProgressMap] = useState<TaskProgressMap>(initial.taskProgress);
  const [today, setToday] = useState<string>(initial.today);
  const [tasks, setTasks] = useState<TaskDTO[]>(initial.tasks);
  const [events, setEvents] = useState<EventDTO[]>(initial.events);
  const [focus, setFocus] = useState<FocusDTO[]>(initial.focus);
  const [settings, setSettings] = useState<SettingsDTO>(initial.settings);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Roll over at local midnight without a reload. "today" follows the user's
  // explicit Settings choice only — the browser timezone is never adopted (or
  // persisted) silently on page load. Changing the timezone in Settings below
  // re-syncs "today" through saveSettings.
  useEffect(() => {
    const check = () => {
      const next = todayInZone(settings.timezone);
      setToday((prev) => (prev === next ? prev : next));
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [settings.timezone]);

  const countFor = useCallback(
    (habitId: number, day: string) => logs[String(habitId)]?.[day]?.count ?? 0,
    [logs],
  );

  const isDone = useCallback(
    (habitId: number, day: string) => (logs[String(habitId)]?.[day]?.count ?? 0) > 0,
    [logs],
  );

  const occurrenceFor = useCallback(
    (habitId: number, day: string, index: number) =>
      occurrences[String(habitId)]?.[day]?.[index] ?? null,
    [occurrences],
  );

  /**
   * Toggles one scheduled occurrence and re-derives the aggregate habit log so
   * the count and the rating snapshot stay in sync.
   */
  const toggleOccurrence = useCallback(
    async (
      habitId: number,
      day: string,
      occurrenceIndex: number,
      scheduledTime: string,
      completed: boolean,
    ) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;

      // Optimistic occurrence update.
      setOccurrences((prev) => {
        const hk = String(habitId);
        const next: OccurrenceMap = { ...prev };
        if (!next[hk]) next[hk] = {};
        if (!next[hk][day]) next[hk][day] = {};
        next[hk][day] = { ...next[hk][day] };
        next[hk][day][occurrenceIndex] = {
          id: prev[hk]?.[day]?.[occurrenceIndex]?.id ?? -Date.now(),
          habitId,
          day,
          occurrenceIndex,
          scheduledTime,
          completed,
        };
        return next;
      });

      // Optimistic aggregate re-derivation.
      const dayOccurrences = occurrences[String(habitId)]?.[day] ?? {};
      const count = Object.values(dayOccurrences).filter((o) =>
        o.occurrenceIndex === occurrenceIndex ? completed : o.completed,
      ).length;
      const target = Math.max(1, habit.targetCount);
      const optimisticPoints =
        habit.kind === "negative"
          ? -roundPoints(count * habit.pointValue)
          : roundPoints(Math.min(1, count / target) * habit.pointValue);

      const beforeCount = logs[String(habitId)]?.[day]?.count ?? 0;
      const beforePoints = logs[String(habitId)]?.[day]?.points ?? 0;

      setLogs((prev) => ({
        ...prev,
        [String(habitId)]: {
          ...(prev[String(habitId)] ?? {}),
          [day]: { count, points: optimisticPoints },
        },
      }));

      try {
        await api("/api/occurrences", "POST", {
          habitId,
          day,
          occurrenceIndex,
          scheduledTime,
          completed,
        });
      } catch (err) {
        // Roll back both representations.
        setOccurrences((prev) => {
          const hk = String(habitId);
          const next: OccurrenceMap = { ...prev };
          if (next[hk]?.[day]?.[occurrenceIndex]) {
            next[hk] = { ...next[hk] };
            next[hk][day] = { ...next[hk][day] };
            next[hk][day][occurrenceIndex] = {
              ...next[hk][day][occurrenceIndex],
              completed: !completed,
            };
          }
          return next;
        });
        setLogs((prev) => ({
          ...prev,
          [String(habitId)]: {
            ...(prev[String(habitId)] ?? {}),
            [day]: { count: beforeCount, points: beforePoints },
          },
        }));
        toast.push((err as Error).message, "error");
      }
    },
    [habits, occurrences, logs, toast],
  );

  const taskProgressFor = useCallback(
    (taskId: number, day: string) => taskProgress[String(taskId)]?.[day]?.progress ?? 0,
    [taskProgress],
  );

  const setHabitCount = useCallback(
    async (habitId: number, day: string, count: number) => {
      const previous = logs[String(habitId)] ?? {};
      const before = previous[day]?.count ?? 0;
      const beforeEntry = previous[day];
      const next = Math.max(0, Math.min(50, Math.round(count)));
      /**
       * Compute the optimistic points with the SAME shared snapshot rule the
       * server uses, so a historical day never flashes a value calculated from
       * the habit's current configuration while the request is in flight.
       */
      const habit = habits.find((h) => h.id === habitId);
      const resolved = habit
        ? resolveHabitSnapshot(habit, beforeEntry ?? null, effectiveTargetFor(habit, day, weekdayOf))
        : null;
      const optimisticPoints = resolved ? calculateHabitPointsFromSnapshot(next, resolved) : 0;
      setLogs((prev) => ({
        ...prev,
        [String(habitId)]: {
          ...(prev[String(habitId)] ?? {}),
          [day]: {
            count: next,
            points: optimisticPoints,
            // Carry the day's own snapshot: for a NEW or provisional (zero-
            // progress) record the resolved snapshot is exactly what the server
            // will store; for an already-recorded day keep what was stored.
            pointValueAtRecord: resolved?.isNewRecord ? resolved.weight : beforeEntry?.pointValueAtRecord,
            targetCountAtRecord: resolved?.isNewRecord ? resolved.target : beforeEntry?.targetCountAtRecord,
            kindAtRecord: resolved?.isNewRecord ? resolved.kind : beforeEntry?.kindAtRecord,
          },
        },
      }));
      const key = `log-${habitId}-${day}`;
      setBusy((prev) => ({ ...prev, [key]: true }));
      try {
        await api("/api/logs", "POST", { habitId, day, count: next });
      } catch (err) {
        setLogs((prev) => ({
          ...prev,
          [String(habitId)]: {
            ...(prev[String(habitId)] ?? {}),
            [day]: beforeEntry ?? { count: 0, points: 0 },
          },
        }));
        toast.push((err as Error).message, "error");
      } finally {
        setBusy((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }
    },
    [habits, logs, toast],
  );

  const cycleHabit = useCallback(
    (habitId: number, day: string) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;
      const target = effectiveTargetFor(habit, day, weekdayOf);
      const current = logs[String(habitId)]?.[day]?.count ?? 0;
      const next = current >= target ? 0 : current + 1;
      void setHabitCount(habitId, day, next);
    },
    [habits, logs, setHabitCount],
  );

  const createHabit = useCallback(
    async (input: NewHabit) => {
      if (habits.length >= MAX_HABITS) {
        toast.push(`That is the ${MAX_HABITS}-habit storage limit for one workspace.`, "error");
        return false;
      }
      const optimistic: HabitDTO = {
        id: -Date.now(),
        name: input.name,
        slug: slugify(input.name),
        icon: input.icon,
        color: input.color,
        description: input.description,
        kind: input.kind,
        pointValue: input.pointValue,
        targetCount: input.targetCount,
        weekdayTargets: input.weekdayTargets ?? [],
        days: input.days,
        scheduleTimes: input.scheduleTimes ?? [],
        sortOrder: habits.length,
        enabled: true,
        archivedAt: null,
      };
      setHabits((prev) => [...prev, optimistic]);
      try {
        const res = (await api("/api/habits", "POST", input)) as { habit: HabitDTO };
        setHabits((prev) => prev.map((h) => (h.id === optimistic.id ? res.habit : h)));
        toast.push(`“${input.name}” added to your daily scorecard`);
        return true;
      } catch (err) {
        setHabits((prev) => prev.filter((h) => h.id !== optimistic.id));
        toast.push((err as Error).message, "error");
        return false;
      }
    },
    [habits, toast],
  );

  const updateHabit = useCallback(
    async (id: number, patch: Partial<HabitDTO>) => {
      const before = habits.find((h) => h.id === id);
      setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
      try {
        await api(`/api/habits`, "PATCH", { id, ...patch });
      } catch (err) {
        if (before) setHabits((prev) => prev.map((h) => (h.id === id ? before : h)));
        toast.push((err as Error).message, "error");
      }
    },
    [habits, toast],
  );

const deleteHabit = useCallback(
    async (id: number) => {
      const beforeHabits = habits;
      const beforeArchived = archivedHabits;
      const target = habits.find((h) => h.id === id);
      // Optimistic: remove from active immediately.
      setHabits((prev) => prev.filter((h) => h.id !== id));
      try {
        const res = (await api(`/api/habits`, "DELETE", { id })) as {
          archived?: boolean;
          habit?: HabitDTO;
          message?: string;
        };
        if (res.archived && res.habit) {
          // Keep the archived DTO so historical scoring still resolves past days.
          setArchivedHabits((prev) => [...prev, res.habit!]);
        }
        toast.push(res.message ?? (target ? `"${target.name}" deleted` : "Habit deleted"));
      } catch (err) {
        setHabits(beforeHabits);
        setArchivedHabits(beforeArchived);
        toast.push((err as Error).message, "error");
      }
    },
    [habits, archivedHabits, toast],
  );

  const moveHabit = useCallback(
    async (id: number, direction: -1 | 1) => {
      const idx = habits.findIndex((h) => h.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= habits.length) return;
      const next = [...habits];
      [next[idx], next[target]] = [next[target], next[idx]];
      const reordered = next.map((h, i) => ({ ...h, sortOrder: i }));
      setHabits(reordered);
      try {
        await api("/api/habits/reorder", "POST", { order: reordered.map((h) => h.id) });
      } catch (err) {
        setHabits(habits);
        toast.push((err as Error).message, "error");
      }
    },
    [habits, toast],
  );

  const createTask = useCallback(
    async (input: NewTask) => {
      const optimistic: TaskDTO = {
        id: -Date.now(),
        title: input.title,
        notes: input.notes ?? "",
        status: input.status ?? "todo",
        priority: input.priority ?? "medium",
        category: input.category ?? "General",
        measureType: input.measureType ?? "completion",
        targetValue: input.targetValue ?? 1,
        unit: input.unit ?? "",
        maxPoints: input.maxPoints ?? 0.5,
        day: input.day ?? null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        habitId: input.habitId ?? null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
      setTasks((prev) => [optimistic, ...prev]);
      try {
        const res = (await api("/api/tasks", "POST", input)) as { task: TaskDTO };
        setTasks((prev) => prev.map((t) => (t.id === optimistic.id ? res.task : t)));
      } catch (err) {
        setTasks((prev) => prev.filter((t) => t.id !== optimistic.id));
        toast.push((err as Error).message, "error");
      }
    },
    [toast],
  );

  const updateTask = useCallback(
    async (id: number, patch: Partial<TaskDTO>) => {
      const before = tasks.find((t) => t.id === id);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      try {
        await api("/api/tasks", "PATCH", { id, ...patch });
      } catch (err) {
        if (before) setTasks((prev) => prev.map((t) => (t.id === id ? before : t)));
        toast.push((err as Error).message, "error");
      }
    },
    [tasks, toast],
  );

  /**
   * Records task progress for a specific calendar day. Progress is per-day, so
   * it can never rewrite another day's rating.
   */
  const setTaskProgress = useCallback(
    async (id: number, day: string, progress: number) => {
      const safe = Math.max(0, Math.round(progress * 100) / 100);
      const before = taskProgress[String(id)]?.[day]?.progress ?? 0;
      const task = tasks.find((t) => t.id === id);
      // Real snapshot so the UI never shows a transient 0 reward.
      const optimisticPoints = task ? taskContribution(task, safe) : 0;
      setTaskProgressMap((prev) => ({
        ...prev,
        [String(id)]: { ...(prev[String(id)] ?? {}), [day]: { progress: safe, points: optimisticPoints } },
      }));
      try {
        const res = (await api("/api/tasks", "PATCH", { id, progress: safe, progressDay: day })) as {
          progress?: { progress: number; points: number } | null;
        };
        // The server is authoritative for historical days: it computes points
        // from the stored snapshot (or captures a new one), never from the
        // task's current configuration. Replace the optimistic value with it.
        if (res?.progress) {
          const { progress: sp, points } = res.progress;
          setTaskProgressMap((prev) => ({
            ...prev,
            [String(id)]: {
              ...(prev[String(id)] ?? {}),
              [day]: { progress: sp, points },
            },
          }));
        }
      } catch (err) {
        setTaskProgressMap((prev) => ({
          ...prev,
          [String(id)]: {
            ...(prev[String(id)] ?? {}),
            [day]: {
              progress: before,
              points: task ? taskContribution(task, before) : 0,
            },
          },
        }));
        toast.push((err as Error).message, "error");
      }
    },
    [taskProgress, tasks, toast],
  );

  const deleteTask = useCallback(
    async (id: number) => {
      const before = tasks;
      setTasks((prev) => prev.filter((t) => t.id !== id));
      try {
        await api("/api/tasks", "DELETE", { id });
        toast.push("Task deleted");
      } catch (err) {
        setTasks(before);
        toast.push((err as Error).message, "error");
      }
    },
    [tasks, toast],
  );

  const createEvent = useCallback(
    async (input: NewEvent) => {
      const optimistic: EventDTO = {
        id: -Date.now(),
        title: input.title,
        kind: input.kind ?? "event",
        day: input.day,
        startTime: input.startTime ?? "09:00",
        endTime: input.endTime ?? "10:00",
        notes: input.notes ?? "",
        location: input.location ?? "",
        color: input.color ?? "",
      };
      setEvents((prev) => [...prev, optimistic]);
      try {
        const res = (await api("/api/events", "POST", input)) as { event: EventDTO };
        setEvents((prev) => prev.map((e) => (e.id === optimistic.id ? res.event : e)));
        toast.push("Event added to your calendar");
      } catch (err) {
        setEvents((prev) => prev.filter((e) => e.id !== optimistic.id));
        toast.push((err as Error).message, "error");
      }
    },
    [toast],
  );

  const updateEvent = useCallback(
    async (id: number, patch: Partial<EventDTO>) => {
      const before = events.find((e) => e.id === id);
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      try {
        await api("/api/events", "PATCH", { id, ...patch });
      } catch (err) {
        if (before) setEvents((prev) => prev.map((e) => (e.id === id ? before : e)));
        toast.push((err as Error).message, "error");
      }
    },
    [events, toast],
  );

  const deleteEvent = useCallback(
    async (id: number) => {
      const before = events;
      setEvents((prev) => prev.filter((e) => e.id !== id));
      try {
        await api("/api/events", "DELETE", { id });
      } catch (err) {
        setEvents(before);
        toast.push((err as Error).message, "error");
      }
    },
    [events, toast],
  );

  const logFocus = useCallback(
    async (input: { mode: string; seconds: number; habitId: number | null; taskId: number | null; day: string }) => {
      const optimistic: FocusDTO = {
        id: -Date.now(),
        mode: (input.mode === "short_break" || input.mode === "long_break" ? input.mode : "focus") as FocusDTO["mode"],
        seconds: input.seconds,
        completed: true,
        habitId: input.habitId,
        taskId: input.taskId,
        day: input.day,
        startedAt: new Date(Date.now() - input.seconds * 1000).toISOString(),
        endsAt: null,
        remainingSeconds: null,
      };
      setFocus((prev) => [...prev, optimistic]);
      try {
        const res = (await api("/api/focus", "POST", input)) as {
          session: FocusDTO;
          progress: { progress: number; points: number } | null;
        };
        setFocus((prev) => prev.map((f) => (f.id === optimistic.id ? res.session : f)));
        if (res.progress) {
          const taskId = Number(input.taskId);
          const day = input.day;
          if (Number.isFinite(taskId) && day) {
            setTaskProgressMap((prev) => ({
              ...prev,
              [String(taskId)]: {
                ...(prev[String(taskId)] ?? {}),
                [day]: { progress: res.progress!.progress, points: res.progress!.points },
              },
            }));
          }
        }
      } catch (err) {
        setFocus((prev) => prev.filter((f) => f.id !== optimistic.id));
        toast.push((err as Error).message, "error");
      }
    },
    [toast],
  );

  /**
   * Keeps the `focus` array exactly consistent with the server's single active
   * session: every non-completed entry is replaced by the latest known session
   * (or dropped when there is none). Completed history is left untouched, and a
   * finalized session (complete/skip-from-another-tab) replaces itself in the
   * list once.
   */
  const commitSession = useCallback(
    (session: FocusDTO | null, progress?: { progress: number; points: number } | null) => {
      setFocus((prev) => {
        if (session?.completed) {
          const rest = prev.filter((f) => f.id !== session.id);
          return [session, ...rest.filter((f) => f.completed)];
        }
        const base = prev.filter((f) => f.completed);
        return session ? [session, ...base] : base;
      });
      if (progress && session && session.taskId && session.day) {
        setTaskProgressMap((prev) => ({
          ...prev,
          [String(session.taskId)]: {
            ...(prev[String(session.taskId)] ?? {}),
            [session.day!]: { progress: progress.progress, points: progress.points },
          },
        }));
      }
    },
    [setTaskProgressMap],
  );

  const focusSession = useMemo(
    () => focus.find((f) => !f.completed) ?? null,
    [focus],
  );

  const refreshFocusSession = useCallback(async () => {
    try {
      const res = (await api("/api/focus/session", "GET")) as { session: FocusDTO | null };
      commitSession(res.session);
    } catch {
      // Silent — the next visibility/tick reconcile will retry.
    }
  }, [commitSession]);

  const startFocusSession = useCallback(
    async (input: { mode: string; seconds: number; habitId: number | null; taskId: number | null }) => {
      const safeMode = (
        input.mode === "short_break" || input.mode === "long_break" ? input.mode : "focus"
      ) as FocusDTO["mode"];
      const now = Date.now();
      // Optimistic single-tap feedback; the server upsert is authoritative.
      const optimistic: FocusDTO = {
        id: -now,
        mode: safeMode,
        seconds: input.seconds,
        completed: false,
        habitId: input.habitId,
        taskId: input.taskId,
        day: today,
        startedAt: new Date(now).toISOString(),
        endsAt: new Date(now + input.seconds * 1000).toISOString(),
        remainingSeconds: null,
      };
      commitSession(optimistic);
      try {
        const res = (await api("/api/focus/session", "POST", {
          action: "start",
          mode: input.mode,
          seconds: input.seconds,
          habitId: input.habitId,
          taskId: input.taskId,
        })) as { session: FocusDTO | null };
        commitSession(res.session);
      } catch (err) {
        // The server did not create anything; reconcile with it.
        void refreshFocusSession();
        toast.push((err as Error).message, "error");
      }
    },
    [commitSession, refreshFocusSession, today, toast],
  );

  const sessionAction = useCallback(
    async (action: "pause" | "resume" | "complete" | "reset" | "skip") => {
      try {
        const res = (await api("/api/focus/session", "POST", { action })) as {
          session: FocusDTO | null;
          progress?: { progress: number; points: number } | null;
        };
        commitSession(res.session, res.progress);
      } catch (err) {
        void refreshFocusSession();
        toast.push((err as Error).message, "error");
      }
    },
    [commitSession, refreshFocusSession, toast],
  );

  const pauseFocusSession = useCallback(() => sessionAction("pause"), [sessionAction]);
  const resumeFocusSession = useCallback(() => sessionAction("resume"), [sessionAction]);
  const completeFocusSession = useCallback(() => sessionAction("complete"), [sessionAction]);
  const discardFocusSession = useCallback(() => sessionAction("reset"), [sessionAction]);

  const saveSettings = useCallback(
    async (patch: Partial<SettingsDTO>) => {
      const previous = settings;
      setSettings((prev) => ({ ...prev, ...patch }));
      // Recompute "today" the moment the effective timezone changes so the
      // server round-trip never leaves the local calendar date stale.
      if (patch.timezone) setToday(todayInZone(patch.timezone));
      try {
        await api("/api/settings", "PATCH", patch);
      } catch (err) {
        // Restore the previous settings so state never drifts from the DB.
        setSettings(previous);
        if (patch.timezone) setToday(todayInZone(previous.timezone));
        toast.push((err as Error).message, "error");
      }
    },
    [settings, toast],
  );

  const setTheme = useCallback(
    (theme: ThemeId, custom?: CustomThemeInput) => {
      const el = document.documentElement;
      el.removeAttribute("style");
      el.setAttribute("data-theme", theme);
      if (theme === "custom" && custom) {
        const map = cssVarMap(buildCustomTokens(custom));
        for (const [k, v] of Object.entries(map)) el.style.setProperty(k, v);
      }
      localStorage.setItem(
        "tenpoint.theme",
        JSON.stringify({ theme, custom: custom ?? null }),
      );
    },
    [],
  );

  const value = useMemo<WorkspaceValue>(
    () => ({
      habits,
      archivedHabits,
      /** Every habit (active + archived) — feeds scoring so archived history keeps resolving. */
      allHabits: [...habits, ...archivedHabits],
      logs,
      occurrences,
      taskProgress,
      tasks,
      events,
      focus,
      settings,
      today,
      timezone: settings.timezone,
      busy,
      setHabitCount,
      toggleOccurrence,
      occurrenceFor,
      cycleHabit,
      countFor,
      isDone,
      createHabit,
      updateHabit,
      deleteHabit,
      moveHabit,
      createTask,
      updateTask,
      setTaskProgress,
      taskProgressFor,
      deleteTask,
      createEvent,
      updateEvent,
      deleteEvent,
      logFocus,
      focusSession,
      startFocusSession,
      pauseFocusSession,
      resumeFocusSession,
      completeFocusSession,
      discardFocusSession,
      refreshFocusSession,
      saveSettings,
      setTheme,
      MAX_HABITS,
      positiveWeight: habits
        .filter((h) => h.enabled && h.kind === "positive")
        .reduce((acc, h) => acc + h.pointValue, 0),
    }),
    [
      habits, archivedHabits, logs, occurrences, taskProgress, tasks, events, focus, settings, today, busy,
      setTaskProgress,
      setHabitCount, toggleOccurrence, occurrenceFor, cycleHabit, countFor, isDone, taskProgressFor,
      createHabit, updateHabit, deleteHabit, moveHabit, createTask, updateTask,
      deleteTask, createEvent, updateEvent, deleteEvent, logFocus, saveSettings, setTheme,
      focusSession, startFocusSession, pauseFocusSession, resumeFocusSession,
      completeFocusSession, discardFocusSession, refreshFocusSession,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
