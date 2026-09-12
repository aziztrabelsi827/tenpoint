"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, useToast } from "@/components/ui";
import { TaskEditor } from "@/app/(workspace)/tasks/tasks-view";
import { useWorkspace } from "@/components/workspace";
import {
  MONTH_LONG,
  WEEKDAY_MIN,
  WEEKDAY_SHORT,
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  formatDuration,
  formatLong,
  formatMedium,
  formatWeekRange,
  monthLabel,
  rangeKeys,
  startOfMonth,
  startOfWeek,
  weekdayOf,
} from "@/lib/dates";
import { dayKeyInZone, minutesInZone, timezoneLabel } from "@/lib/timezone";
import { formatPoints, formatRating, minutesToTime, timeToMinutes } from "@/lib/format";
import { countFor, isScheduled, taskContributionFor, taskProgressFor } from "@/lib/stats";
import { formatTaskProgressOverTarget } from "@/lib/tasks";
import type { EventDTO, HabitDTO, HabitLogMap, TaskDTO, TaskProgressMap } from "@/lib/types";

type ViewMode = "day" | "week" | "month";

const HOUR_HEIGHT = 56;
const TIME_GUTTER = 60;
const MIN_COL_WIDTH = 96;

/** The calendar grid dominates the viewport; the app shell provides the rest. */
const GRID_HEIGHT = "calc(100vh - 11rem)";
const SNAP = 15;
const DAY_START_HOUR = 0;
const TOTAL_MINUTES = 24 * 60;
/** Movement (px) that turns a pointer press into a scroll/drag gesture. */
const TAP_THRESHOLD = 10;

const EVENT_KINDS = ["event", "work", "personal", "focus", "health"];
const KIND_COLOR: Record<string, string> = {
  event: "var(--primary)",
  work: "var(--accent)",
  personal: "var(--warn)",
  focus: "#8b5cf6",
  health: "var(--positive)",
};
const KIND_FALLBACK = ["#2563eb", "#0ea5a4", "#d97706", "#8b5cf6", "#16a34a", "#db2777"];

type GridItem = {
  key: string;
  source: "event" | "task" | "focus" | "habit";
  id: number;
  title: string;
  day: string;
  start: number;
  end: number;
  color: string;
  kind: string;
  location: string;
  notes: string;
  done?: boolean;
  habitIcon?: string;
  reward?: number;
  rewardMax?: number;
  progressLabel?: string;
  /** Scheduled-habit occurrences */
  habitCount?: number;
  habitTarget?: number;
  habitIndex?: number;
  /** True when occurrence-level data confirms THIS occurrence is complete. */
  habitOccurrenceDone?: boolean;
  /** True when occurrence-level data exists for this day. */
  habitHasOccurrences?: boolean;
  /** True for point-in-time markers (scheduled habits) with no duration. */
  compact?: boolean;
};

type DragState =
  | { mode: "move"; key: string; grabOffset: number; duration: number; originX: number; originY: number; dayIndex: number }
  | { mode: "resize"; key: string; end: number; originY: number }
  | null;

/** A confirmed tap on an empty time slot, anchored to the pointer position. */
type SlotChoice = { day: string; start: string; end: string; x: number; y: number };

/** In-progress press on an empty slot that may become a tap. */
type PendingTap = { x: number; y: number; day: string; eligible: boolean };

export function CalendarView() {
  const {
    habits, logs, occurrences, tasks, events, focus, taskProgress,
    createEvent, updateEvent, deleteEvent, updateTask, setHabitCount, createTask,
    toggleOccurrence: toggleOccurrenceWs,
  } = useWorkspace();
  const toast = useToast();
  // ONE source of truth for "today" — identical to the dashboard and sidebar.
  const { today, timezone } = useWorkspace();

  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState(today);
  const [eventModal, setEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventDTO | null>(null);
  const [draftSlot, setDraftSlot] = useState<{ day: string; start: string; end: string } | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [ghost, setGhost] = useState<{ key: string; day: string; start: number; end: number } | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  const [selected, setSelected] = useState(today);

  /** Which calendar categories are drawn. The sidebar toggles these. */
  const [showEvents, setShowEvents] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [showHabits, setShowHabits] = useState(true);
  const [showFocus, setShowFocus] = useState(true);
  /** Mobile: the left calendar sidebar collapses. */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createMenu, setCreateMenu] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  /** Empty-slot tap target for the creation-type chooser. */
  const [slotChooser, setSlotChooser] = useState<SlotChoice | null>(null);
  /** New-task prefill captured from the chosen slot (otherwise toolbar default). */
  const [draftTask, setDraftTask] = useState<{ day: string; start: string; end: string } | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDTO | null>(null);
  /** Desktop (sm+) anchors the chooser to the slot; mobile renders a bottom sheet. */
  const [isDesktop, setIsDesktop] = useState(false);
  /** Pointer presses on empty slots, keyed by pointerId (never opens in pointerdown). */
  const pendingTapsRef = useRef(new Map<number, PendingTap>());
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  /**
   * Keep the selected day inside the visible period.
   * `cursor` defines the visible period; `selected` is the day the detail panel
   * describes. Navigation must move them together so the panel can never show a
   * date from a previous month (the "stale August 31" bug).
   */
  const selectDay = useCallback((day: string) => {
    setSelected(day);
    setCursor(day);
  }, []);

  /** Moves the visible period and picks a sensible selected day inside it. */
  const movePeriod = useCallback((nextCursor: string) => {
    setCursor(nextCursor);
    setSelected(nextCursor);
  }, []);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const ghostRef = useRef<{ key: string; day: string; start: number; end: number } | null>(null);
  const movedRef = useRef(false);

  // Mirror drag/ghost into refs inside an effect so no ref is touched during render.
  useEffect(() => {
    dragRef.current = drag;
    ghostRef.current = ghost;
  }, [drag, ghost]);

  // The current-time line uses the user's LOCAL clock, not the server's.
  useEffect(() => {
    const tick = () => setNowMinutes(minutesInZone(new Date(), timezone));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [timezone]);

  // If "today" rolls over at local midnight, keep the calendar anchored to it
  // unless the user has deliberately navigated away. Deferred to avoid a
  // synchronous setState inside the effect body.
  useEffect(() => {
    const id = setTimeout(() => {
      setSelected((prev) => (prev === cursor ? today : prev));
    }, 0);
    return () => clearTimeout(id);
  }, [today, cursor]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, 7 * HOUR_HEIGHT - HOUR_HEIGHT);
  }, [view]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!createMenu) return;
    createMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [createMenu]);

  const tzLabel = useMemo(() => timezoneLabel(timezone), [timezone]);

  const weekDays = useMemo(() => rangeKeys(startOfWeek(cursor), endOfWeek(cursor)), [cursor]);
  const monthGrid = useMemo(() => {
    const first = startOfMonth(cursor);
    return rangeKeys(startOfWeek(first), endOfWeek(endOfMonth(first)));
  }, [cursor]);

  const days = useMemo(() => {
    if (view === "day") return [cursor];
    if (view === "week") return weekDays;
    return monthGrid;
  }, [view, cursor, weekDays, monthGrid]);

  /* ---------------- build the time-grid items ---------------- */

  const items = useMemo<GridItem[]>(() => {
    const out: GridItem[] = [];
    const daySet = new Set(days);
    for (const e of events) {
      if (!daySet.has(e.day)) continue;
      const s = timeToMinutes(e.startTime) ?? 540;
      const raw = timeToMinutes(e.endTime) ?? 600;
      const en = raw <= s ? s + 60 : raw;
      out.push({
        key: `e${e.id}`,
        source: "event",
        id: e.id,
        title: e.title,
        day: e.day,
        start: s,
        end: en,
        color: e.color || KIND_COLOR[e.kind] || "var(--primary)",
        kind: e.kind,
        location: e.location,
        notes: e.notes,
      });
    }
    for (const t of tasks) {
      if (!t.day || !daySet.has(t.day)) continue;
      const hasTime = t.startTime && t.endTime;
      if (!hasTime) continue;
      const s = timeToMinutes(t.startTime) ?? 540;
      const raw = timeToMinutes(t.endTime) ?? s + 60;
      const en = raw <= s ? s + 60 : raw;
      const habit = habits.find((h) => h.id === t.habitId);
      out.push({
        key: `t${t.id}`,
        source: "task",
        id: t.id,
        title: t.title,
        day: t.day,
        start: s,
        end: en,
        color: habit?.color ?? (t.status === "completed" ? "var(--positive)" : "var(--primary)"),
        kind: "task",
        location: "",
        notes: t.notes,
        done: t.status === "completed",
        habitIcon: habit?.icon,
        reward: taskContributionFor(t, t.id, taskProgress, t.day ?? today, today),
        rewardMax: t.maxPoints,
        progressLabel: formatTaskProgressOverTarget(
          t,
          taskProgressFor(taskProgress, t.id, t.day ?? today),
        ),
      });
    }
    // Per-day scheduled habits.
    //
    // When occurrence RECORDS exist for a day they are authoritative: each
    // record carries its own historical `scheduledTime`, so a later schedule
    // change never moves when a past occurrence is displayed. Only days with no
    // occurrence records fall back to the habit's current schedule.
    for (const d of days) {
      for (const habit of habits) {
        const dayOccurrences = occurrences[String(habit.id)]?.[d] ?? null;
        const done = countFor(logs, habit.id, d);
        const logEntry = logs[String(habit.id)]?.[d];
        // The recorded target wins over the current configuration.
        const target = Math.max(1, logEntry?.targetCountAtRecord ?? habit.targetCount);

        if (dayOccurrences && Object.keys(dayOccurrences).length > 0) {
          // Occurrence-level records exist: render from the RECORDS.
          for (const occ of Object.values(dayOccurrences)) {
            const start = timeToMinutes(occ.scheduledTime);
            if (start === null) continue;
            out.push({
              key: `h${habit.id}-${d}-${occ.occurrenceIndex}`,
              source: "habit",
              id: habit.id,
              title: habit.name,
              day: d,
              start,
              end: start,
              color: habit.color,
              kind: "habit",
              location: "",
              notes: habit.description,
              habitIcon: habit.icon,
              habitCount: done,
              habitTarget: target,
              habitIndex: occ.occurrenceIndex,
              habitOccurrenceDone: occ.completed,
              habitHasOccurrences: true,
              compact: true,
            });
          }
          continue;
        }

        // No occurrence records: use the habit's CURRENT schedule. A recorded log
        // means the habit participated that day even if it is now disabled.
        const participated = !!logEntry;
        if (!habit.enabled && !participated) continue;
        if (!habit.scheduleTimes || habit.scheduleTimes.length === 0) continue;
        if (!isScheduled(habit, d, weekdayOf) && !participated) continue;

        habit.scheduleTimes.forEach((time, idx) => {
          const start = timeToMinutes(time);
          if (start === null) return;
          out.push({
            key: `h${habit.id}-${d}-${idx}`,
            source: "habit",
            id: habit.id,
            title: habit.name,
            day: d,
            // A scheduled occurrence marks a POINT IN TIME ("Prayer at 13:00"),
            // not a duration. `compact` renders it as a slim marker instead of a
            // block, so no arbitrary duration is ever invented.
            start,
            end: start,
            color: habit.color,
            kind: "habit",
            location: "",
            notes: habit.description,
            habitIcon: habit.icon,
            habitCount: done,
            habitTarget: target,
            habitIndex: idx,
            habitOccurrenceDone: undefined,
            habitHasOccurrences: false,
            compact: true,
          });
        });
      }
    }

    for (const f of focus) {
      if (f.mode !== "focus" || !f.completed) continue;

      // `startedAt` is an instant. Derive BOTH the local day and the local start
      // time from it so a session that straddles local midnight lands on the
      // correct calendar date instead of trusting a possibly-stale `day` column.
      if (!f.startedAt) continue;
      const startedMs = Date.parse(f.startedAt);
      if (Number.isNaN(startedMs)) continue;

      const startedInstant = new Date(startedMs);
      const localDay = dayKeyInZone(startedInstant, timezone);
      const start = minutesInZone(startedInstant, timezone);

      // Only draw the block if the locally-derived day is actually visible.
      if (!daySet.has(localDay)) continue;

      // End time from the real duration. A session that crosses local midnight is
      // CLAMPED to the end of its own day so it is never drawn spilling into the
      // next column — the day attribution stays with the day it started on.
      const rawEnd = start + Math.round(f.seconds / 60);
      const end = Math.min(TOTAL_MINUTES, rawEnd);
      if (start >= TOTAL_MINUTES) continue;
      const linkedTask = tasks.find((t) => t.id === f.taskId);
      out.push({
        key: `f${f.id}`,
        source: "focus",
        id: f.id,
        title: linkedTask ? `Focus · ${linkedTask.title}` : `Focus · ${formatDuration(f.seconds)}`,
        day: localDay,
        start,
        end,
        color: "#8b5cf6",
        kind: "focus",
        location: "",
        notes: "",
      });
    }
    return out;
  }, [days, events, tasks, focus, habits, logs, occurrences, taskProgress, today, timezone]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, GridItem[]>();
    for (const it of items) {
      const list = map.get(it.day) ?? [];
      list.push(it);
      map.set(it.day, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start - b.start);
    return map;
  }, [items]);

  const scheduledHabits = useCallback(
    (day: string) => habits.filter((h) => h.enabled && isScheduled(h, day, weekdayOf)),
    [habits],
  );

  /** Category filter driven by the sidebar toggles. */
  const visibleItem = useCallback(
    (item: GridItem) => {
      if (item.source === "event") return showEvents;
      if (item.source === "task") return showTasks;
      if (item.source === "habit") return showHabits;
      if (item.source === "focus") return showFocus;
      return true;
    },
    [showEvents, showTasks, showHabits, showFocus],
  );

  /** Toggles one scheduled habit occurrence (occurrence-level data). */
  const toggleOccurrence = useCallback(
    (item: GridItem) => {
      const idx = item.habitIndex ?? 0;
      const time = minutesToTime(item.start);
      const next = item.habitOccurrenceDone ? false : true;
      void toggleOccurrenceWs(item.id, item.day, idx, time, next);
    },
    [toggleOccurrenceWs],
  );

  /** Opens an item: events/tasks edit, focus sessions are read-only. */
  const openItem = useCallback(
    (item: GridItem) => {
      if (item.source === "event") {
        const ev = events.find((x) => x.id === item.id);
        if (ev) {
          setEditingEvent(ev);
          setDraftSlot(null);
          setEventModal(true);
        }
        return;
      }
      // Clicking a task block opens its editor; completion is a separate control
      // inside the editor, so a calendar click never silently toggles status.
      if (item.source === "task") {
        const t = tasks.find((x) => x.id === item.id);
        if (t) {
          setDraftTask(null);
          setEditingTask(t);
          setTaskModal(true);
        }
      }
    },
    [events, tasks],
  );

  /* ---------------- drag & resize ---------------- */

  const commit = useCallback(
    (key: string, day: string, start: number, end: number) => {
      const item = items.find((i) => i.key === key);
      if (!item) return;
      const startTime = minutesToTime(start);
      const endTime = minutesToTime(Math.max(start + SNAP, end));
      if (item.source === "event") {
        void updateEvent(item.id, { day, startTime, endTime });
      } else if (item.source === "task") {
        void updateTask(item.id, { day, startTime, endTime });
      }
      toast.push(`${item.title} → ${startTime}–${endTime}`);
    },
    [items, updateEvent, updateTask, toast],
  );

  useEffect(() => {
    if (!drag) return;

    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const grid = gridRef.current;
      if (!grid) return;
      const dx = d.mode === "move" ? e.clientX - d.originX : 0;
      if (Math.abs(dx) > 3 || Math.abs(e.clientY - d.originY) > 3) {
        movedRef.current = true;
      }
      const rect = grid.getBoundingClientRect();
      const dyMinutes = ((e.clientY - d.originY) / HOUR_HEIGHT) * 60;

      if (d.mode === "move") {
        const colWidth = Math.max(40, (rect.width - TIME_GUTTER) / Math.max(1, days.length));
        const dayShift = Math.round((e.clientX - d.originX) / colWidth);
        const baseIndex = Math.max(0, Math.min(days.length - 1, d.dayIndex));
        const idx = Math.max(0, Math.min(days.length - 1, baseIndex + dayShift));
        const nextStart = clampMin(snap(d.grabOffset + dyMinutes));
        setGhost({
          key: d.key,
          day: days[idx],
          start: nextStart,
          end: clampMin(nextStart + d.duration),
        });
      } else {
        setGhost({
          key: d.key,
          day: "",
          start: 0,
          end: clampMin(snap(d.end + dyMinutes)),
        });
      }
    }

    function onUp() {
      const d = dragRef.current;
      const g = ghostRef.current;
      const moved = movedRef.current;
      if (d && g && moved) {
        if (d.mode === "move") {
          commit(d.key, g.day, g.start, g.end);
        } else {
          const item = items.find((i) => i.key === d.key);
          if (item && g.end > item.start + SNAP) commit(d.key, item.day, item.start, g.end);
        }
      }
      setGhost(null);
      setDrag(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, days, commit, items]);

  function beginMove(e: React.PointerEvent, item: GridItem) {
    if (item.source === "focus") return;
    e.stopPropagation();
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const colWidth = Math.max(40, (rect.width - TIME_GUTTER) / Math.max(1, days.length));
    const x = e.clientX - rect.left - TIME_GUTTER;
    const colIndex = Math.max(0, Math.min(days.length - 1, Math.floor(x / colWidth)));
    setDrag({
      mode: "move",
      key: item.key,
      grabOffset: item.start,
      duration: item.end - item.start,
      originX: e.clientX,
      originY: e.clientY,
      dayIndex: colIndex,
    });
    setGhost({ key: item.key, day: item.day, start: item.start, end: item.end });
  }

  function beginResize(e: React.PointerEvent, item: GridItem) {
    if (item.source === "focus") return;
    e.stopPropagation();
    movedRef.current = false;
    setDrag({ mode: "resize", key: item.key, end: item.end, originY: e.clientY });
    setGhost({ key: item.key, day: "", start: 0, end: item.end });
  }

  /** Records an empty-slot press. Nothing is opened from pointerdown/touchstart. */
  function onSlotPointerDown(e: React.PointerEvent, day: string) {
    if (e.target !== e.currentTarget) return;
    // Cancel the browser's compatibility mouse/click pair that follows a touch
    // tap, so it cannot immediately hit any UI we render in response.
    if (e.pointerType === "touch" || e.pointerType === "pen") e.preventDefault();
    pendingTapsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, day, eligible: true });
  }

  // Turns a still press into the creation-type chooser only when the pointer
  // never moved past the tap threshold. A touch scroll fires pointercancel (or
  // large pointermovements), so scrolling over the grid never opens the UI.
  useEffect(() => {
    function onSlotPointerMove(e: PointerEvent) {
      const t = pendingTapsRef.current.get(e.pointerId);
      if (!t) return;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_THRESHOLD) t.eligible = false;
    }
    function onSlotPointerUp(e: PointerEvent) {
      const t = pendingTapsRef.current.get(e.pointerId);
      pendingTapsRef.current.delete(e.pointerId);
      if (!t || !t.eligible) return;
      const grid = gridRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      const minutes = clampMin(snap(((t.y - rect.top) / HOUR_HEIGHT) * 60 + DAY_START_HOUR * 60));
      setSlotChooser({
        day: t.day,
        start: minutesToTime(minutes),
        end: minutesToTime(minutes + 60),
        x: e.clientX,
        y: e.clientY,
      });
    }
    function onSlotPointerCancel(e: PointerEvent) {
      pendingTapsRef.current.delete(e.pointerId);
    }
    window.addEventListener("pointermove", onSlotPointerMove);
    window.addEventListener("pointerup", onSlotPointerUp);
    window.addEventListener("pointercancel", onSlotPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onSlotPointerMove);
      window.removeEventListener("pointerup", onSlotPointerUp);
      window.removeEventListener("pointercancel", onSlotPointerCancel);
    };
  }, []);

  function closeSlotChooser() {
    setSlotChooser(null);
  }

  function chooseTaskFromSlot() {
    const s = slotChooser;
    if (!s) return;
    closeSlotChooser();
    setEditingTask(null);
    setDraftTask({ day: s.day, start: s.start, end: s.end });
    setTaskModal(true);
  }

  function chooseEventFromSlot() {
    const s = slotChooser;
    if (!s) return;
    closeSlotChooser();
    setDraftSlot({ day: s.day, start: s.start, end: s.end });
    setEditingEvent(null);
    setEventModal(true);
  }

  /** Moves focus between the toolbar Create-menu items. */
  function nudgeMenuFocus(delta: number) {
    const el = createMenuRef.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[(idx + delta + items.length) % items.length];
    next?.focus();
  }

  function shift(dir: -1 | 1) {
    const next =
      view === "month"
        ? addMonths(cursor, dir)
        : view === "week"
          ? addDays(cursor, dir * 7)
          : addDays(cursor, dir);
    movePeriod(next);
  }

  /** "Today" resets both the visible period and the selected day. */
  function goToday() {
    movePeriod(today);
  }

  const heading =
    view === "month"
      ? monthLabel(cursor)
      : view === "week"
        ? formatWeekRange(days[0], days[days.length - 1])
        : formatLong(cursor);

  const scoringCtx = useMemo(
    () => ({ habits, habitLogs: logs, tasks, taskProgress, today }),
    [habits, logs, tasks, taskProgress, today],
  );

  return (
    <div className="flex flex-col gap-0">
      {/* ============ CALENDAR TOOLBAR ============ */}
      <header
        className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b py-3 pr-1"
        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
      >
        <button
          type="button"
          className="btn btn-sm lg:hidden"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Hide calendar sidebar" : "Show calendar sidebar"}
          aria-expanded={sidebarOpen}
        >
          ☰
        </button>

        <div className="flex items-center gap-1.5">
          <button type="button" className="btn btn-sm" onClick={goToday}>
            Today
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => shift(-1)}
            aria-label="Previous period"
          >
            ←
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => shift(1)}
            aria-label="Next period"
          >
            →
          </button>
        </div>

        {/* Current period title */}
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold md:text-xl" style={{ letterSpacing: "var(--tracking)" }}>
          {heading}
        </h1>

        {/* View selector */}
        <div className="surface inline-flex gap-0.5 p-0.5" style={{ background: "var(--bg-subtle)" }} role="tablist" aria-label="Calendar view">
          {(["day", "week", "month"] as const).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(v)}
                className="px-3 py-1.5 text-sm font-semibold transition-colors"
                style={{
                  borderRadius: "var(--radius-sm)",
                  background: active ? "var(--card)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                  border: active ? "1px solid var(--line-strong)" : "1px solid transparent",
                  boxShadow: active ? "var(--shadow-sm)" : "none",
                }}
              >
                {v === "day" ? "Day" : v === "week" ? "Week" : "Month"}
              </button>
            );
          })}
        </div>

        {/* Create */}
        <div className="relative">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setCreateMenu((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={createMenu}
          >
            + Create
          </button>
          {createMenu ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCreateMenu(false)} aria-hidden />
              <div
                ref={createMenuRef}
                role="menu"
                aria-label="Create new calendar entry"
                className="absolute right-0 z-50 mt-1 w-56 overflow-hidden"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "var(--shadow)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setCreateMenu(false);
                  } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                    e.preventDefault();
                    nudgeMenuFocus(1);
                  } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    nudgeMenuFocus(-1);
                  }
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-3 text-left transition-colors hover:bg-[var(--bg-subtle)]"
                  onClick={() => {
                    setCreateMenu(false);
                    setDraftSlot({ day: selected, start: "09:00", end: "10:00" });
                    setEditingEvent(null);
                    setEventModal(true);
                  }}
                >
                  <span className="block text-sm font-semibold">Create event</span>
                  <span className="block text-[11px]" style={{ color: "var(--fg-muted)" }}>
                    Block out non-scoring time
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full border-t px-3 py-3 text-left transition-colors hover:bg-[var(--bg-subtle)]"
                  style={{ borderColor: "var(--line)" }}
                  onClick={() => {
                    setCreateMenu(false);
                    setEditingTask(null);
                    setTaskModal(true);
                  }}
                >
                  <span className="block text-sm font-semibold">Create task</span>
                  <span className="block text-[11px]" style={{ color: "var(--fg-muted)" }}>
                    Track a task with its own reward
                  </span>
                </button>
              </div>
            </>
          ) : null}
        </div>
      </header>

      {/* ============ CALENDAR WORKSPACE ============ */}
      <div className="flex gap-4 pt-4">
        {/* ---------- LEFT CALENDAR SIDEBAR ---------- */}
        <aside
          className={`${sidebarOpen ? "block" : "hidden"} w-60 shrink-0 lg:block`}
          aria-label="Calendar sidebar"
        >
          <div className="flex flex-col gap-5">

            {/* Mini month calendar */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold">{monthLabel(cursor)}</p>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => movePeriod(startOfMonth(addMonths(cursor, -1)))}
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => movePeriod(startOfMonth(addMonths(cursor, 1)))}
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>
              </div>
              <MiniMonth
                month={startOfMonth(cursor)}
                today={today}
                selected={selected}
                onSelect={selectDay}
              />
            </div>

            {/* Calendar categories */}
            <div>
              <p className="eyebrow mb-2">Calendars</p>
              <ul className="flex flex-col gap-1.5">
                {(
                  [
                    { id: "events", label: "Events", color: "var(--primary)", on: showEvents, set: setShowEvents },
                    { id: "tasks", label: "Tasks", color: "var(--positive)", on: showTasks, set: setShowTasks },
                    { id: "habits", label: "Habits", color: "var(--warn)", on: showHabits, set: setShowHabits },
                    { id: "focus", label: "Focus", color: "#8b5cf6", on: showFocus, set: setShowFocus },
                  ] as const
                ).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => c.set(!c.on)}
                      role="checkbox"
                      aria-checked={c.on}
                      className="flex w-full items-center gap-2.5 px-1 py-1 text-left text-sm font-semibold transition-opacity"
                      style={{ opacity: c.on ? 1 : 0.45 }}
                    >
                      <span
                        className="grid h-4 w-4 shrink-0 place-items-center text-[10px] font-black"
                        style={{
                          borderRadius: 4,
                          background: c.on ? c.color : "transparent",
                          border: `1.5px solid ${c.color}`,
                          color: "#fff",
                        }}
                        aria-hidden
                      >
                        {c.on ? "✓" : ""}
                      </span>
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        {/* ---------- MAIN CALENDAR ---------- */}
        <section
          className={`ws-band min-w-0 overflow-hidden ${sidebarOpen ? "hidden lg:block" : "block"}`}
          aria-label="Calendar"
          style={{ flex: 1 }}
        >
          {view === "month" ? (
            <MonthGrid
              days={monthGrid}
              cursorMonth={startOfMonth(cursor)}
              today={today}
              isVisible={visibleItem}
              itemsByDay={itemsByDay}
              onSelect={(d) => {
                // Selecting a day in month view stays inside that month.
                setSelected(d);
                if (startOfMonth(d) !== startOfMonth(cursor)) setCursor(d);
              }}
              onOpenDay={(d) => {
                setView("day");
                selectDay(d);
              }}
            />
          ) : (
            <div className="flex flex-col" style={{ height: GRID_HEIGHT }}>
              {/* Sticky day headers */}
              <div
                className="sticky top-0 z-20 grid border-b"
                style={{
                  borderColor: "var(--line)",
                  background: "var(--card)",
                  gridTemplateColumns: `${TIME_GUTTER}px repeat(${days.length}, minmax(0, 1fr))`,
                }}
              >
                <div
                  className="border-r py-2 pr-2 text-right text-[10px] font-bold"
                  style={{ borderColor: "var(--line)", color: "var(--fg-subtle)" }}
                  title={timezone}
                >
                  {tzLabel}
                </div>
                {days.map((d) => {
                  const isToday = d === today;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => selectDay(d)}
                      className="border-r py-1.5 text-center transition-colors last:border-r-0"
                      style={{
                        borderColor: "var(--grid-line)",
                        background: isToday ? "var(--card-alt)" : "transparent",
                      }}
                    >
                      <span
                        className="block text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: isToday ? "var(--primary)" : "var(--fg-subtle)" }}
                      >
                        {WEEKDAY_SHORT[weekdayOf(d)]}
                      </span>
                      <span
                        className="num mt-0.5 inline-grid h-6 min-w-6 place-items-center px-1 text-sm font-bold"
                        style={{
                          background: isToday ? "var(--primary)" : "transparent",
                          color: isToday ? "var(--primary-fg)" : "var(--fg)",
                          borderRadius: 999,
                        }}
                      >
                        {d.slice(8, 10)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* All-day lane: habits */}
              {showHabits ? (
                <div
                  className="hidden border-b lg:grid"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--card-alt)",
                    gridTemplateColumns: `${TIME_GUTTER}px repeat(${days.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div
                    className="py-2 pr-2 text-right text-[10px] font-bold"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    Habits
                  </div>
                  {days.map((d) => {
                    const list = scheduledHabits(d);
                    const met = list.filter(
                      (h) => countFor(logs, h.id, d) >= Math.max(1, h.targetCount),
                    ).length;
                    return (
                      <div key={d} className="border-r p-1.5 last:border-r-0" style={{ borderColor: "var(--grid-line)" }}>
                        <p
                          className="mb-1 text-center text-[10px] font-bold"
                          style={{ color: met === list.length && list.length > 0 ? "var(--positive)" : "var(--fg-subtle)" }}
                        >
                          {met}/{list.length}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {list.map((h) => {
                            const count = countFor(logs, h.id, d);
                            const target = Math.max(1, h.targetCount);
                            const full = count >= target;
                            return (
                              <button
                                key={h.id}
                                type="button"
                                onClick={() => void setHabitCount(h.id, d, count >= target ? 0 : count + 1)}
                                title={`${h.name} — ${count}/${target} · click to advance`}
                                aria-label={`${h.name} on ${d}: ${count} of ${target}`}
                                className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold transition-transform hover:scale-105"
                                style={{
                                  background: full
                                    ? h.color
                                    : count > 0
                                      ? `color-mix(in srgb, ${h.color} 22%, var(--card))`
                                      : `color-mix(in srgb, ${h.color} 8%, var(--card))`,
                                  color: full ? "#fff" : h.color,
                                  border: `1px solid ${full ? h.color : `color-mix(in srgb, ${h.color} 30%, var(--card))`}`,
                                  borderRadius: "calc(var(--radius-sm) * 0.6)",
                                }}
                              >
                                <span aria-hidden>{h.icon}</span>
                                <span className="num">
                                  {target === 1 ? (count > 0 ? "✓" : "") : `${count}/${target}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Scrollable hourly grid */}
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto scrollbar-thin">
                <div style={{ minWidth: TIME_GUTTER + days.length * MIN_COL_WIDTH }}>
                  <div
                    ref={gridRef}
                    className="relative grid"
                    style={{
                      gridTemplateColumns: `${TIME_GUTTER}px repeat(${days.length}, minmax(0, 1fr))`,
                      height: (TOTAL_MINUTES / 60) * HOUR_HEIGHT,
                    }}
                  >
                    {/* hour gutter */}
                    {Array.from({ length: 24 }, (_, h) => (
                      <div
                        key={h}
                        className="relative border-r border-b"
                        style={{
                          gridColumn: "1",
                          gridRow: `${h + 1} / span 1`,
                          borderColor: "var(--grid-line)",
                          height: HOUR_HEIGHT,
                        }}
                      >
                        <span
                          className="num absolute right-1.5 top-0 -translate-y-1/2 text-[10px] font-semibold"
                          style={{ color: "var(--fg-subtle)" }}
                        >
                          {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                        </span>
                      </div>
                    ))}

                    {/* day columns */}
                    {days.map((d) => (
                      <div
                        key={d}
                        className="relative border-r last:border-r-0"
                        style={{
                          gridColumn: String(days.indexOf(d) + 2),
                          gridRow: "1 / span 24",
                          borderColor: "var(--grid-line)",
                          background:
                            d === today
                              ? "color-mix(in srgb, var(--primary) 3%, var(--card))"
                              : "transparent",
                        }}
                        onPointerDown={(e) => onSlotPointerDown(e, d)}
                      >
                        {/* hour lines */}
                        {Array.from({ length: 24 }, (_, h) => (
                          <div
                            key={h}
                            className="pointer-events-none absolute left-0 right-0"
                            style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT, borderBottom: "1px solid var(--grid-line)" }}
                          />
                        ))}
                        {/* half-hour lines */}
                        {Array.from({ length: 24 }, (_, h) => (
                          <div
                            key={`half-${h}`}
                            className="pointer-events-none absolute left-0 right-0"
                            style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2, borderBottom: "1px dashed var(--grid-line)" }}
                          />
                        ))}

                        {/* current-time indicator */}
                        {d === today && nowMinutes !== null ? (
                          <div
                            className="pointer-events-none absolute left-0 right-0 z-20"
                            style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                            aria-hidden
                          >
                            <div style={{ height: 2, background: "var(--danger)" }} />
                            <span
                              className="num absolute -top-2.5 left-0 rounded px-1 text-[10px] font-bold"
                              style={{ background: "var(--danger)", color: "#fff" }}
                            >
                              {minutesToTime(nowMinutes)}
                            </span>
                          </div>
                        ) : null}

                        {/* events / tasks / focus */}
                        <TimeColumn
                          items={(itemsByDay.get(d) ?? []).filter(visibleItem)}
                          ghost={ghost && ghost.day === d ? ghost : null}
                          movedRef={movedRef}
                          onBeginMove={beginMove}
                          onBeginResize={beginResize}
                          onOpenEvent={openItem}
                          onToggleOccurrence={toggleOccurrence}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <TaskEditor
        key={`cal-task-${taskModal}-${editingTask?.id ?? draftTask?.day ?? "x"}-${draftTask?.start ?? "x"}`}
        open={taskModal}
        onClose={() => {
          setTaskModal(false);
          setEditingTask(null);
          setDraftTask(null);
        }}
        habits={habits}
        task={editingTask}
        defaultDay={editingTask?.day ?? draftTask?.day ?? selected}
        defaultStartTime={editingTask?.startTime ?? draftTask?.start}
        defaultEndTime={editingTask?.endTime ?? draftTask?.end}
        onSubmit={async (payload) => {
          if (editingTask) {
            await updateTask(editingTask.id, payload as Partial<TaskDTO>);
            toast.push("Task updated");
            return;
          }
          await createTask({
            title: payload.title ?? "",
            notes: payload.notes,
            status: payload.status,
            priority: payload.priority,
            category: payload.category,
            measureType: payload.measureType,
            targetValue: payload.targetValue,
            unit: payload.unit,
            maxPoints: payload.maxPoints,
            progress: payload.progress,
            progressDay: payload.day ?? selected,
            day: payload.day ?? selected,
            startTime: payload.startTime,
            endTime: payload.endTime,
            habitId: payload.habitId,
          });
          toast.push("Task added to your calendar");
        }}
      />

      <EventEditorModal
        key={editingEvent ? `edit-${editingEvent.id}` : `new-${draftSlot?.day ?? "x"}-${draftSlot?.start ?? "x"}`}
        open={eventModal}
        onClose={() => {
          setEventModal(false);
          setEditingEvent(null);
          setDraftSlot(null);
        }}
        event={editingEvent}
        day={editingEvent?.day ?? draftSlot?.day ?? selected}
        startTime={editingEvent?.startTime ?? draftSlot?.start ?? "09:00"}
        endTime={editingEvent?.endTime ?? draftSlot?.end ?? "10:00"}
        onSubmit={async (payload) => {
          if (editingEvent) {
            await updateEvent(editingEvent.id, payload);
            toast.push("Event updated");
          } else {
            await createEvent({
              title: payload.title ?? "",
              kind: payload.kind,
              day: payload.day ?? selected,
              startTime: payload.startTime,
              endTime: payload.endTime,
              notes: payload.notes,
              location: payload.location,
              color: payload.color,
            });
            toast.push("Event added to your calendar");
          }
        }}
        onDelete={
          editingEvent
            ? () => {
                void deleteEvent(editingEvent.id);
                toast.push("Event deleted");
                setEventModal(false);
                setEditingEvent(null);
                setDraftSlot(null);
              }
            : undefined
        }
      />

      {slotChooser ? (
        <SlotCreateMenu
          slot={slotChooser}
          isDesktop={isDesktop}
          onTask={chooseTaskFromSlot}
          onEvent={chooseEventFromSlot}
          onClose={closeSlotChooser}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Slot creation-type chooser                                       */
/* ---------------------------------------------------------------- */

function SlotCreateMenu({
  slot,
  isDesktop,
  onTask,
  onEvent,
  onClose,
}: {
  slot: { day: string; start: string; end: string; x: number; y: number };
  isDesktop: boolean;
  onTask: () => void;
  onEvent: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuWidth = 256;
  const menuHeight = 232;
  const openedAtRef = useRef<number>(0);

  useEffect(() => {
    openedAtRef.current = performance.now();
  }, []);

  // A tap opens this menu; some browsers then dispatch a compatibility mouse
  // click a few hundred ms later. Ignore backdrop clicks in that window so the
  // menu does not close itself immediately after being opened by a touch tap.
  function backdropClick() {
    if (performance.now() - openedAtRef.current > 400) onClose();
  }

  // Focus the first choice and return focus to the previous element on dismiss.
  useEffect(() => {
    const returnTo = document.activeElement;
    requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
      first?.focus();
    });
    return () => {
      if (returnTo instanceof HTMLElement && document.contains(returnTo)) returnTo.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function nudge(delta: number) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[(idx + delta + items.length) % items.length];
    next?.focus();
  }

  const desktopStyle = {
    width: menuWidth,
    left: Math.max(8, Math.min(slot.x + 8, window.innerWidth - menuWidth - 16)),
    top: Math.max(8, Math.min(slot.y + 8, window.innerHeight - menuHeight - 16)),
  };

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Dismissal backdrop; native scroll still works over it. */}
      <div className="absolute inset-0" onClick={backdropClick} aria-hidden />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Create a new calendar entry"
        className="absolute"
        style={isDesktop ? desktopStyle : { left: 12, right: 12, bottom: 12 }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowRight") {
            e.preventDefault();
            nudge(1);
          } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
            e.preventDefault();
            nudge(-1);
          } else if (e.key === "Home") {
            e.preventDefault();
            menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
          }
        }}
      >
        <div
          className="overflow-hidden"
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: "calc(var(--radius-sm) * 1.2)",
            boxShadow: "var(--shadow)",
          }}
        >
          <p
            className="border-b px-3 py-2 text-[11px] font-bold uppercase tracking-wider"
            style={{ borderColor: "var(--line)", color: "var(--fg-subtle)" }}
          >
            {formatMedium(slot.day)} · {slot.start}
          </p>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--bg-subtle)]"
            onClick={onTask}
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center text-base"
              style={{ background: "color-mix(in srgb, var(--positive) 14%, var(--card))", borderRadius: "var(--radius-sm)" }}
              aria-hidden
            >
              ✓
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">Create task</span>
              <span className="block text-[11px]" style={{ color: "var(--fg-muted)" }}>
                Track progress from this slot
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 border-t px-3 py-3 text-left transition-colors hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: "var(--line)" }}
            onClick={onEvent}
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center text-base"
              style={{ background: "color-mix(in srgb, var(--primary) 14%, var(--card))", borderRadius: "var(--radius-sm)" }}
              aria-hidden
            >
              🗓
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">Create event</span>
              <span className="block text-[11px]" style={{ color: "var(--fg-muted)" }}>
                Add non-scoring calendar time
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full border-t px-3 py-3 text-left text-sm font-semibold transition-colors hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: "var(--line)", color: "var(--fg-muted)" }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Time column with positioned events                               */
/* ---------------------------------------------------------------- */

function TimeColumn({
  items,
  ghost,
  movedRef,
  onBeginMove,
  onBeginResize,
  onOpenEvent,
  onToggleOccurrence,
}: {
  items: GridItem[];
  ghost: { key: string; start: number; end: number } | null;
  movedRef: { current: boolean };
  onBeginMove: (e: React.PointerEvent, item: GridItem) => void;
  onBeginResize: (e: React.PointerEvent, item: GridItem) => void;
  onOpenEvent: (item: GridItem) => void;
  onToggleOccurrence: (item: GridItem) => void;
}) {
  // Point-in-time markers (scheduled habits) render as slim pills rather than
  // duration blocks, so no arbitrary duration is invented.
  const markers = items.filter((i) => i.compact);
  const blocks = items.filter((i) => !i.compact);

  const laid = clusterLayout(blocks);
  return (
    <>
      {/* Compact habit markers */}
      {markers.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => {
            if (movedRef.current) {
              movedRef.current = false;
              return;
            }
            // Habits toggle their own occurrence; other sources open normally.
            if (item.source === "habit") {
              onToggleOccurrence(item);
              return;
            }
            onOpenEvent(item);
          }}
          title={`${item.title} · ${minutesToTime(item.start)} · ${
            item.habitHasOccurrences
              ? item.habitOccurrenceDone
                ? "completed"
                : "not completed"
              : `${item.habitCount}/${item.habitTarget} completed today`
          }`}
          aria-label={`${item.title} at ${minutesToTime(item.start)}${
            item.habitHasOccurrences
              ? item.habitOccurrenceDone
                ? ", completed"
                : ", not completed"
              : `, ${item.habitCount} of ${item.habitTarget} completed today`
          }`}
          className="absolute z-10 flex items-center gap-1 overflow-hidden px-1.5 text-left transition-transform hover:scale-[1.02]"
          style={{
            top: (item.start / 60) * HOUR_HEIGHT - 1,
            height: 18,
            left: 2,
            right: 2,
            width: "auto",
            minWidth: 0,
            maxWidth: "100%",
            /**
             * Occurrence-level truth when records exist: this exact occurrence is
             * either completed or not. Otherwise fall back to the count-based
             * aggregate, which cannot identify an individual occurrence.
             */
            background: item.habitHasOccurrences
              ? item.habitOccurrenceDone
                ? item.color
                : `color-mix(in srgb, ${item.color} 10%, var(--card))`
              : (item.habitCount ?? 0) >= (item.habitTarget ?? 1)
                ? item.color
                : (item.habitCount ?? 0) > 0
                  ? `color-mix(in srgb, ${item.color} 26%, var(--card))`
                  : `color-mix(in srgb, ${item.color} 12%, var(--card))`,
            borderLeft: `3px solid ${item.color}`,
            border: `1px solid color-mix(in srgb, ${item.color} 35%, var(--card))`,
            borderLeftWidth: 3,
            borderLeftColor: item.color,
            borderRadius: 999,
            cursor: "pointer",
          }}
        >
          <span aria-hidden className="shrink-0 text-[10px] leading-none">
            {item.habitIcon}
          </span>
          <span
            className="num shrink-0 text-[10px] font-bold leading-none"
            style={{ color: item.color }}
          >
            {minutesToTime(item.start)}
          </span>
          <span
            className="truncate text-[10px] font-semibold leading-none"
            style={{
              color: item.habitHasOccurrences
                ? item.habitOccurrenceDone
                  ? "#fff"
                  : "var(--fg)"
                : (item.habitCount ?? 0) >= (item.habitTarget ?? 1)
                  ? "#fff"
                  : "var(--fg)",
              textDecoration: item.habitHasOccurrences
                ? item.habitOccurrenceDone
                  ? "line-through"
                  : "none"
                : (item.habitCount ?? 0) >= (item.habitTarget ?? 1)
                  ? "line-through"
                  : "none",
            }}
          >
            {item.title}
          </span>
        </button>
      ))}

      {/* Duration blocks: events, tasks, focus */}
      {laid.map(({ item, col, span }) => {
        const isGhost = ghost?.key === item.key;
        const start = isGhost && ghost ? ghost.start : item.start;
        const end = isGhost && ghost ? ghost.end : item.end;
        const width = 100 / span;
        const short = end - start <= 45;
        return (
          <div
            key={item.key}
            role="button"
            tabIndex={0}
            onPointerDown={(e) => onBeginMove(e, item)}
            onClick={() => {
              if (movedRef.current) {
                movedRef.current = false;
                return;
              }
              onOpenEvent(item);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenEvent(item);
              }
            }}
            className="absolute z-10 cursor-grab touch-none overflow-hidden px-1 py-1 text-left select-none"
            style={{
              top: (start / 60) * HOUR_HEIGHT,
              height: Math.max(20, ((end - start) / 60) * HOUR_HEIGHT - 2),
              left: `calc(${col * width}% + 2px)`,
              width: `calc(${width}% - 4px)`,
              background: `color-mix(in srgb, ${item.color} 16%, var(--card))`,
              borderLeft: `3px solid ${item.color}`,
              border: `1px solid color-mix(in srgb, ${item.color} 35%, var(--card))`,
              borderLeftWidth: 3,
              borderLeftColor: item.color,
              borderRadius: "calc(var(--radius-sm) * 0.7)",
              opacity: isGhost ? 0.55 : 1,
              cursor: item.source === "focus" ? "default" : "grab",
              boxShadow: "var(--shadow-sm)",
            }}
            title={`${item.title} · ${minutesToTime(start)}–${minutesToTime(end)}${
              item.source === "task" && item.reward !== undefined
                ? ` · ${item.progressLabel ?? ""} · ${formatPoints(item.reward ?? 0, 2)}/${formatPoints(item.rewardMax ?? 0, 2)} pt`
                : ""
            }`}
          >
            {/* Title row with a source glyph */}
            <p
              className="flex items-center gap-1 truncate text-[11px] font-bold leading-tight"
              style={{
                color: "var(--fg)",
                textDecoration: item.done ? "line-through" : "none",
              }}
            >
              <span aria-hidden className="shrink-0 opacity-70">
                {item.source === "task"
                  ? "✓"
                  : item.source === "focus"
                    ? "◔"
                    : item.source === "habit"
                      ? item.habitIcon ?? "•"
                      : "🗓"}
              </span>
              <span className="truncate">{item.title}</span>
            </p>

            {short ? null : (
              <>
                <p className="num truncate text-[10px] leading-tight" style={{ color: "var(--fg-muted)" }}>
                  {minutesToTime(start)}–{minutesToTime(end)}
                </p>
                {item.source === "task" && item.progressLabel ? (
                  <p
                    className="num truncate text-[10px] leading-tight"
                    style={{ color: "var(--fg-subtle)" }}
                    title={`Progress ${item.progressLabel} · fixed reward ${formatPoints(item.rewardMax ?? 0, 2)} pt`}
                  >
                    {item.progressLabel}
                  </p>
                ) : null}
                {item.location ? (
                  <p className="truncate text-[10px] leading-tight" style={{ color: "var(--fg-subtle)" }}>
                    📍 {item.location}
                  </p>
                ) : null}
              </>
            )}
            {item.source !== "focus" ? (
              <span
                aria-hidden="true"
                title={`Drag to resize ${item.title}`}
                onPointerDown={(e) => onBeginResize(e, item)}
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize touch-none"
                style={{
                  background: `color-mix(in srgb, ${item.color} 45%, transparent)`,
                  borderRadius: "0 0 calc(var(--radius-sm) * 0.7) calc(var(--radius-sm) * 0.7)",
                }}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function clusterLayout(items: GridItem[]): { item: GridItem; col: number; span: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const res: { item: GridItem; col: number; span: number }[] = [];
  let cluster: GridItem[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const cols: GridItem[][] = [];
    const placed: { item: GridItem; col: number }[] = [];
    for (const it of cluster) {
      let c = 0;
      while (c < cols.length && cols[c][cols[c].length - 1].end > it.start) c += 1;
      if (!cols[c]) cols[c] = [];
      cols[c].push(it);
      placed.push({ item: it, col: c });
    }
    for (const p of placed) res.push({ item: p.item, col: p.col, span: cols.length });
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of sorted) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return res;
}

function clampMin(v: number): number {
  return Math.max(0, Math.min(TOTAL_MINUTES - SNAP, v));
}
function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

/* ---------------------------------------------------------------- */
/* Month grid                                                       */
/* ---------------------------------------------------------------- */

function MonthGrid({
  days,
  cursorMonth,
  itemsByDay,
  today,
  isVisible,
  onSelect,
  onOpenDay,
}: {
  days: string[];
  cursorMonth: string;
  itemsByDay: Map<string, GridItem[]>;
  today: string;
  isVisible: (item: GridItem) => boolean;
  onSelect: (day: string) => void;
  onOpenDay: (day: string) => void;
}) {
  return (
    <div className="overflow-auto scrollbar-thin" style={{ height: GRID_HEIGHT }}>
      <div
        className="grid grid-cols-7 border-b"
        style={{ borderColor: "var(--line)", background: "var(--card-alt)" }}
      >
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--fg-subtle)" }}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const all = itemsByDay.get(day) ?? [];
          const list = all.filter(isVisible);
          const inMonth = startOfMonth(day) === cursorMonth;
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              onDoubleClick={() => onOpenDay(day)}
              className="flex min-h-[104px] cursor-pointer flex-col gap-1 border-b border-r p-1.5 text-left transition-colors last:border-r-0"
              style={{
                borderColor: "var(--grid-line)",
                background: isToday ? "color-mix(in srgb, var(--primary) 6%, var(--card))" : "var(--card)",
                opacity: inMonth ? 1 : 0.4,
              }}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className="num grid h-5 min-w-5 place-items-center px-1 text-xs font-bold"
                  style={{
                    color: isToday ? "var(--primary-fg)" : "var(--fg-muted)",
                    background: isToday ? "var(--primary)" : "transparent",
                    borderRadius: 999,
                  }}
                >
                  {day.slice(8, 10)}
                </span>

              </div>
              {list.slice(0, 3).map((it) => (
                <span
                  key={it.key}
                  className="flex items-center gap-1 truncate px-1 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: `color-mix(in srgb, ${it.color} 14%, var(--card))`,
                    color: it.color,
                    borderRadius: 4,
                  }}
                >
                  <span aria-hidden className="shrink-0 opacity-70">
                    {it.source === "task"
                      ? "✓"
                      : it.source === "focus"
                        ? "◔"
                        : it.source === "habit"
                          ? it.habitIcon ?? "•"
                          : "🗓"}
                  </span>
                  <span
                    className="truncate"
                    style={{
                      textDecoration:
                        it.done || (it.habitCount ?? 0) >= (it.habitTarget ?? 1) ? "line-through" : "none",
                    }}
                  >
                    {it.title}
                  </span>
                </span>
              ))}
              {list.length > 3 ? (
                <span className="px-1 text-[10px]" style={{ color: "var(--fg-subtle)" }}>
                  +{list.length - 3} more
                </span>
              ) : null}

            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Event editor                                                     */
/* ---------------------------------------------------------------- */

export function EventEditorModal({
  open,
  onClose,
  event,
  day,
  startTime,
  endTime,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  event: EventDTO | null;
  day: string;
  startTime: string;
  endTime: string;
  onSubmit: (payload: Partial<EventDTO>) => Promise<void>;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("event");
  const [dayState, setDayState] = useState(day);
  const [start, setStart] = useState(startTime);
  const [end, setEnd] = useState(endTime);
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState("");

  const [syncKey, setSyncKey] = useState("");
  const currentKey = event ? `e${event.id}` : `n${day}-${startTime}`;
  if (open && currentKey !== syncKey) {
    setSyncKey(currentKey);
    setTitle(event?.title ?? "");
    setKind(event?.kind ?? "event");
    setDayState(event?.day ?? day);
    setStart(event?.startTime ?? startTime);
    setEnd(event?.endTime ?? endTime);
    setNotes(event?.notes ?? "");
    setLocation(event?.location ?? "");
    setColor(event?.color ?? "");
    setError("");
  }
  if (!open && syncKey !== "") setSyncKey("");

  async function submit() {
    if (!title.trim()) {
      setError("Event needs a title.");
      return;
    }
    const s = timeToMinutes(start) ?? 540;
    let e = timeToMinutes(end) ?? 600;
    if (e <= s) e = s + 60;
    await onSubmit({
      title: title.trim(),
      kind,
      day: dayState,
      startTime: minutesToTime(s),
      endTime: minutesToTime(e),
      notes,
      location,
      color,
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? "Edit event" : "New event"}
      description={`Scheduled for ${formatMedium(dayState)}. Drag the block to move it, or its bottom edge to resize.`}
      width="34rem"
      footer={
        <>
          {onDelete ? (
            <button type="button" className="btn btn-danger mr-auto" onClick={onDelete}>
              Delete
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()}>
            {event ? "Save event" : "Add event"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="field-label" htmlFor="event-title">
            Title
          </label>
          <input
            id="event-title"
            className="input"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Deep work — study block"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="field-label" htmlFor="event-day">
              Date
            </label>
            <input
              id="event-day"
              type="date"
              className="input"
              value={dayState}
              onChange={(e) => setDayState(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="event-start">
              Start
            </label>
            <input id="event-start" type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} step={900} />
          </div>
          <div>
            <label className="field-label" htmlFor="event-end">
              End
            </label>
            <input id="event-end" type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} step={900} />
          </div>
          <div>
            <label className="field-label" htmlFor="event-kind">
              Type
            </label>
            <select id="event-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="event-location">
            Location <span style={{ color: "var(--fg-subtle)" }}>(optional)</span>
          </label>
          <input
            id="event-location"
            className="input"
            value={location}
            maxLength={200}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Studio, or a video call link"
          />
        </div>
        <div>
          <span className="field-label">Colour</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setColor("")}
              aria-pressed={color === ""}
              className="btn btn-sm"
              style={{ background: color === "" ? "var(--primary)" : "var(--card)", color: color === "" ? "var(--primary-fg)" : "var(--fg-muted)" }}
            >
              Auto
            </button>
            {KIND_FALLBACK.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Use colour ${c}`}
                aria-pressed={color === c}
                className="h-8 w-8 transition-transform hover:scale-110"
                style={{ background: c, borderRadius: "var(--radius-sm)", outline: color === c ? "2px solid var(--fg)" : "none", outlineOffset: 2 }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="event-notes">
            Description
          </label>
          <textarea id="event-notes" className="input" rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error ? (
          <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}


/* ---------------------------------------------------------------- */
/* Mini month calendar (left sidebar)                               */
/* ---------------------------------------------------------------- */

function MiniMonth({
  month,
  today,
  selected,
  onSelect,
}: {
  /** First day of the month to display. */
  month: string;
  today: string;
  selected: string;
  onSelect: (day: string) => void;
}) {
  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    const all = rangeKeys(start, end);
    const out: string[][] = [];
    for (let i = 0; i < all.length; i += 7) out.push(all.slice(i, i + 7));
    return out;
  }, [month]);

  const label = month.slice(0, 7);

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAY_MIN.map((d, i) => (
          <span key={i} className="text-[10px] font-bold" style={{ color: "var(--fg-subtle)" }}>
            {d}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-0.5">
            {week.map((day) => {
              const inMonth = day.slice(0, 7) === label;
              const isToday = day === today;
              const isSelected = day === selected;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onSelect(day)}
                  aria-label={formatMedium(day)}
                  aria-current={isToday ? "date" : undefined}
                  className="num grid h-7 place-items-center text-xs font-semibold transition-colors"
                  style={{
                    borderRadius: 999,
                    opacity: inMonth ? 1 : 0.3,
                    background: isToday
                      ? "var(--primary)"
                      : isSelected
                        ? "var(--bg-subtle)"
                        : "transparent",
                    color: isToday
                      ? "var(--primary-fg)"
                      : isSelected
                        ? "var(--fg)"
                        : "var(--fg-muted)",
                    border: isSelected && !isToday ? "1px solid var(--line-strong)" : "1px solid transparent",
                  }}
                >
                  {day.slice(8, 10)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export { MONTH_LONG, formatDuration };
