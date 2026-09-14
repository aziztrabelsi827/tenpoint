"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OccurrenceDots, ScheduledOccurrenceDots } from "@/components/habit-grid";
import { ProgressBar } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { formatDuration, formatLong, weekdayOf } from "@/lib/dates";
import { minutesInZone } from "@/lib/timezone";
import { minutesToTime, timeToMinutes } from "@/lib/format";
import {
  formatPoints,
  formatRating,
  formatSigned,
  ratingColor,
  ratingLabel,
  ratingMessage,
} from "@/lib/format";
import {
  configuredPositiveWeight,
  countFor,
  effectiveTargetFor,
  focusTotals,
  habitContributionFor,
  isScheduled,
  overallStats,
  scoreDay,
  taskContributionFor,
  taskProgressFor,
  type ScoringContext,
} from "@/lib/stats";
import {
  completionRatio,
  formatMinutes,
  formatTaskProgressOverTarget,
  ratioFor,
  taskTarget,
} from "@/lib/tasks";

/* ---------------------------------------------------------------- */
/* Row models                                                       */
/* ---------------------------------------------------------------- */

type RowKind = "habit" | "task" | "negative";

type ActivityRow = {
  key: string;
  kind: RowKind;
  id: number;
  name: string;
  icon: string;
  detail: string;
  href: string;
  targetLabel: string;
  control: "dots" | "stepper" | "counter";
  count: number;
  targetCount: number;
  scheduleTimes?: string[];
  progressLabel: string;
  share: number;
  earned: number;
  maximum: number;
  status: "done" | "active" | "todo" | "penalty";
  statusLabel: string;
  color: string;
};

type RemainingItem = {
  key: string;
  label: string;
  points: number;
  href: string;
  icon: string;
  kind: RowKind;
  kindLabel: string;
  actionLabel: string;
  progressNote?: string;
  /** Source row identity, so the inline action can mutate without navigating. */
  id: number;
  target: number;
  count: number;
  control: ActivityRow["control"];
};

/* ================================================================== */
/* DASHBOARD                                                          */
/* ================================================================== */

export function DashboardView({ userName, greeting }: { userName: string; greeting: string }) {
  const {
    habits, allHabits, logs, tasks, events, focus, taskProgress, occurrences, busy,
    setHabitCount, setTaskProgress, today, timezone,
  } = useWorkspace();
  void occurrences;

  const ctx: ScoringContext = useMemo(
    () => ({ habits: allHabits, habitLogs: logs, tasks, taskProgress, today }),
    [allHabits, logs, tasks, taskProgress, today],
  );

  const rating = useMemo(() => scoreDay(ctx, today, weekdayOf), [ctx, today]);
  const stats = useMemo(() => overallStats(ctx, 540), [ctx]);
  const configured = useMemo(
    () => configuredPositiveWeight(habits, today, weekdayOf),
    [habits, today],
  );
  const focusToday = useMemo(() => focusTotals(focus, [today]), [focus, today]);

  /* ---- activity rows ---- */
  const rows = useMemo<ActivityRow[]>(() => {
    const out: ActivityRow[] = [];
    for (const habit of habits) {
      const logEntry = logs[String(habit.id)]?.[today];
      const participated = !!logEntry;
      if (!participated && (!habit.enabled || !isScheduled(habit, today, weekdayOf))) continue;
      const target = Math.max(1, logEntry?.targetCountAtRecord ?? effectiveTargetFor(habit, today, weekdayOf));
      const count = countFor(logs, habit.id, today);
      const earned = habitContributionFor(habit, logs, today, today);
      const negative = habit.kind === "negative";
      const full = count >= target;
      out.push({
        key: `h${habit.id}`,
        kind: negative ? "negative" : "habit",
        id: habit.id, name: habit.name, icon: habit.icon,
        detail: habit.description || (negative ? `Penalty ${formatPoints(habit.pointValue)} per occurrence` : `${formatPoints(habit.pointValue)} pts max`),
        href: `/habits/${habit.slug}`,
        targetLabel: negative ? "—" : `${target} ${target === 1 ? "time" : "times"}`,
        control: negative ? "counter" : "dots",
        scheduleTimes: habit.scheduleTimes, count, targetCount: target,
        progressLabel: negative ? `${count} ${count === 1 ? "occurrence" : "occurrences"}` : `${count} / ${target}`,
        share: negative ? Math.min(1, count / 4) : Math.min(1, count / target),
        earned: Math.round(earned * 100) / 100,
        maximum: negative ? habit.pointValue : habit.pointValue,
        status: negative ? (count > 0 ? "penalty" : "todo") : full ? "done" : count > 0 ? "active" : "todo",
        statusLabel: negative ? (count > 0 ? `${formatSigned(-count * habit.pointValue)}` : "Clean") : full ? "Complete" : count > 0 ? "In progress" : "Not started",
        color: habit.color,
      });
    }
    for (const task of tasks) {
      // Archived tasks are hidden-from-planning (status-archived): they must not
      // surface again on "today" or as a re-claimable inline action.
      if (task.status === "archived") continue;
      if (task.day && task.day !== today) continue;
      const progress = taskProgressFor(taskProgress, task.id, today);
      const target = taskTarget(task);
      const earned = taskContributionFor(task, task.id, taskProgress, today, today);
      const share = ratioFor(task, progress);
      const over = completionRatio(task, progress) > 1;
      const measure = task.measureType === "time" ? "⏱" : task.measureType === "count" ? "🔢" : task.measureType === "quantity" ? "📊" : "✅";
      out.push({
        key: `t${task.id}`, kind: "task", id: task.id, name: task.title,
        icon: measure, detail: task.category + (task.notes ? ` · ${task.notes}` : ""),
        href: "/tasks",
        targetLabel: task.measureType === "completion" ? "Complete" : task.measureType === "time" ? formatMinutes(target) : `${formatPoints(target, 2)} ${task.unit || "units"}`,
        control: task.measureType === "completion" ? "counter" : "stepper",
        count: progress, targetCount: target,
        progressLabel: formatTaskProgressOverTarget(task, progress) + (over ? ` · ${Math.round(completionRatio(task, progress) * 100)}%` : ""),
        share, earned, maximum: task.maxPoints,
        status: task.status === "completed" || share >= 1 ? "done" : progress > 0 || task.status === "in_progress" ? "active" : "todo",
        statusLabel: task.status === "completed" || share >= 1 ? "Complete" : progress > 0 || task.status === "in_progress" ? "In progress" : "Not started",
        color: "var(--primary)",
      });
    }
    const rank: Record<RowKind, number> = { habit: 0, task: 1, negative: 2 };
    return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
  }, [habits, logs, tasks, taskProgress, today]);

  /* ---- remaining ---- */
  const remaining = useMemo<RemainingItem[]>(() => {
    const items: RemainingItem[] = [];
    for (const r of rows) {
      if (r.kind === "negative") {
        if (r.count > 0)
          items.push({
            key: r.key, label: r.name, points: r.earned, href: r.href, icon: r.icon, kind: r.kind,
            kindLabel: "Penalty", actionLabel: "—",
            id: r.id, target: r.targetCount, count: r.count, control: r.control,
          });
        continue;
      }
      const left = Math.round((r.maximum - r.earned) * 100) / 100;
      if (left > 0.005)
        items.push({
          key: r.key, label: r.name, points: left, href: r.href, icon: r.icon, kind: r.kind,
          kindLabel: r.kind === "task" ? "Task" : "Habit",
          actionLabel:
            r.kind === "task"
              ? r.control === "counter"
                ? "Complete"
                : r.count > 0
                  ? "Continue"
                  : "Start"
              : "Complete",
          progressNote: r.kind === "task" && r.count > 0 ? r.progressLabel : undefined,
          id: r.id, target: r.targetCount, count: r.count, control: r.control,
        });
    }
    return items.sort((a, b) => b.points - a.points);
  }, [rows]);

  const stillAvailable = Math.round(remaining.filter((r) => r.points > 0).reduce((a, r) => a + r.points, 0) * 100) / 100;
  const positiveRemaining = remaining.filter((r) => r.points > 0);
  const nextAction = positiveRemaining.length > 0 ? positiveRemaining[0] : null;
  const completedCount = rows.filter((r) => r.kind !== "negative" && r.status === "done").length;
  const totalCount = rows.filter((r) => r.kind !== "negative").length;
  const allDone = positiveRemaining.length === 0 && rows.length > 0;
  const penaltiesToday = rating.penalties;
  const overConfigured = rating.overConfigured;

  /* ---- schedule ---- */
  const schedule = useMemo(() => {
    type SItem = { time: number; timeLabel: string; title: string; kind: string; color: string; href: string };
    const out: SItem[] = [];
    for (const e of events) {
      if (e.day !== today) continue;
      out.push({ time: timeToMinutes(e.startTime) ?? 540, timeLabel: e.startTime, title: e.title, kind: e.kind, color: e.color || "var(--accent)", href: "/calendar" });
    }
    for (const t of tasks) {
      if (t.day !== today || !t.startTime) continue;
      out.push({ time: timeToMinutes(t.startTime) ?? 540, timeLabel: t.startTime, title: t.title, kind: "task", color: "var(--primary)", href: "/tasks" });
    }
    for (const f of focus) {
      if (f.day !== today || f.mode !== "focus" || !f.completed) continue;
      // Prefer the session's REAL local start time; fall back to 08:00 only
      // for legacy records that predate `started_at`.
      let start = 8 * 60;
      if (f.startedAt) {
        const ms = Date.parse(f.startedAt);
        if (!Number.isNaN(ms)) start = minutesInZone(new Date(ms), timezone);
      }
      out.push({ time: start, timeLabel: minutesToTime(start), title: `Focus · ${formatDuration(f.seconds)}`, kind: "focus", color: "#8b5cf6", href: "/timer" });
    }
    return out.sort((a, b) => a.time - b.time);
  }, [events, tasks, focus, today, timezone]);

  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMinutes(minutesInZone(new Date(), timezone));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [timezone]);
  const nextUp = nowMinutes === null ? null : (schedule.find((s) => s.time >= nowMinutes) ?? null);

  /* ---- inline action (Complete/Start) ---- */
  /** Guards against double-taps before React has flushed the `pending` state. */
  const pendingRef = useRef<Set<string>>(new Set());
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const runItemAction = useCallback(
    async (item: RemainingItem) => {
      if (pendingRef.current.has(item.key)) return;
      pendingRef.current.add(item.key);
      setPending((p) => ({ ...p, [item.key]: true }));
      try {
        if (item.kind === "habit") {
          await setHabitCount(item.id, today, item.target);
        } else if (item.control === "counter") {
          await setTaskProgress(item.id, today, item.target);
        } else {
          const step = item.icon === "⏱" ? 15 : item.target >= 50 ? 5 : 1;
          await setTaskProgress(item.id, today, item.count + step);
        }
      } finally {
        pendingRef.current.delete(item.key);
        setPending((p) => {
          const copy = { ...p };
          delete copy[item.key];
          return copy;
        });
      }
    },
    [setHabitCount, setTaskProgress, today],
  );

  const actionPending = (item: RemainingItem) =>
    Boolean(pending[item.key]) ||
    (item.kind === "habit" && Boolean(busy[`log-${item.id}-${today}`]));

  /* ---- header parts ---- */
  const dateParts = formatLong(today).split(", ");
  const weekday = dateParts[0]?.toUpperCase() ?? "";
  const dateRest = dateParts.slice(1).join(", ");
  const firstName = userName.trim().split(" ")[0] ?? "";

  /* ---- contextual sentence ---- */
  const contextLine = allDone
    ? `You've completed everything. ${formatRating(rating.rating)}/10 — ${ratingLabel(rating.rating).toLowerCase()}.`
    : stillAvailable > 0
      ? `You still have ${formatPoints(stillAvailable)} points available today.`
      : "One habit turns this into a better day.";

  return (
    <div className="tp-dashboard">
      {/* ============ TODAY ============ */}
      <header className="tp-dash-header">
        <p className="tp-dash-date">{weekday} · {dateRest}</p>
        <h1 className="tp-dash-greeting">
          {greeting}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="tp-dash-context">{contextLine}</p>
      </header>

      {/* ============ SCORE ============ */}
      <section className="tp-dash-score" aria-label="Today's score">
        <p className="tp-score-kicker">Today&apos;s Score</p>

        <div className="tp-score-head">
          <div className="tp-score-main">
            <span className="tp-score-number" style={{ color: ratingColor(rating.rating) }}>
              {formatRating(rating.rating)}
            </span>
            <span className="tp-score-of">/ 10</span>
          </div>
          <div className="tp-score-side">
            <p className="tp-score-label" style={{ color: ratingColor(rating.rating) }}>
              {ratingLabel(rating.rating)}
            </p>
            <p className="tp-score-message">{ratingMessage(rating.rating)}</p>
          </div>
        </div>

        <div className="tp-score-bar-wrap">
          <ProgressBar
            value={rating.rating}
            max={10}
            label="Daily rating"
            height={10}
            color={ratingColor(rating.rating)}
          />
        </div>

        <div className="tp-score-breakdown">
          <span className="tp-score-bd">
            Habits <strong style={{ color: "var(--positive)" }}>+{formatPoints(rating.habits)}</strong>
          </span>
          <span className="tp-score-bd">
            Tasks <strong style={{ color: "var(--primary)" }}>+{formatPoints(rating.tasks)}</strong>
          </span>
          <span className="tp-score-bd">
            Penalties <strong style={{ color: penaltiesToday > 0 ? "var(--danger)" : "var(--fg-subtle)" }}>
              {formatSigned(-penaltiesToday)}
            </strong>
          </span>
          {stillAvailable > 0 && !allDone && (
            <span className="tp-score-available num">+{formatPoints(stillAvailable)} pts still available</span>
          )}
        </div>

        {overConfigured ? (
          <p className="tp-dash-warn">
            Over-configured: {formatPoints(rating.habitAvailable + rating.taskAvailable)} of reward
            configured. Rating caps at 10.
          </p>
        ) : configured < 9.99 ? (
          <p className="tp-dash-note">
            Your positive habits are worth +{formatPoints(configured)} of the 10 points today —{" "}
            <Link href="/habits" className="tp-dash-note-link">add or raise a habit</Link> to unlock
            the full 10.
          </p>
        ) : null}
      </section>

      {/* ============ IMPROVE + NEXT UP ============ */}
      <div className="tp-dash-grid">
        <section className="tp-dash-improve" aria-label="What will improve your day">
          <p className="tp-dash-section-title">
            {allDone ? "Completed" : "What will improve your day?"}
          </p>

          {rows.length === 0 ? (
            <p className="tp-dash-empty">
              Nothing scheduled today.{" "}
              <Link href="/habits">Add habits</Link> or{" "}
              <Link href="/tasks">create a task</Link>.
            </p>
          ) : allDone ? (
            <div className="tp-dash-done">
              <span className="tp-dash-done-icon" aria-hidden>✓</span>
              <div>
                <p className="tp-dash-done-text">You&apos;ve completed everything important today.</p>
                <p className="tp-dash-done-sub">{formatRating(rating.rating)}/10 — {ratingLabel(rating.rating).toLowerCase()}.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="tp-dash-improve-list">
                {positiveRemaining.slice(0, 5).map((item) => {
                  const pendingAction = actionPending(item);
                  return (
                    <div key={item.label} className="tp-dash-improve-item">
                      <span className="tp-dash-improve-icon" aria-hidden>{item.icon}</span>
                      <div className="tp-dash-improve-info">
                        <Link href={item.href} className="tp-dash-improve-name">{item.label}</Link>
                        <span className="tp-dash-improve-type">{item.kindLabel}</span>
                      </div>
                      <div className="tp-dash-improve-actions">
                        <span className="tp-dash-improve-pts num">+{formatPoints(item.points)}</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            void runItemAction(item);
                          }}
                          disabled={pendingAction}
                          aria-busy={pendingAction}
                        >
                          {pendingAction ? "…" : item.actionLabel}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {positiveRemaining.length > 5 && (
                <p className="tp-dash-more">+{positiveRemaining.length - 5} more</p>
              )}
            </>
          )}
        </section>

        {nextAction && (
          <section className="tp-dash-next" aria-label="Next action">
            <p className="tp-dash-kicker">Next up</p>
            <div className="tp-dash-next-card">
              <div className="tp-dash-next-icon" aria-hidden>{nextAction.icon}</div>
              <div className="tp-dash-next-info">
                <Link href={nextAction.href} className="tp-dash-next-name">{nextAction.label}</Link>
                <p className="tp-dash-next-kind">{nextAction.kindLabel}</p>
                <p className="tp-dash-next-pts num">+{formatPoints(nextAction.points)} possible score</p>
                {nextAction.progressNote && (
                  <p className="tp-dash-next-progress">{nextAction.progressNote}</p>
                )}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  void runItemAction(nextAction);
                }}
                disabled={actionPending(nextAction)}
                aria-busy={actionPending(nextAction)}
              >
                {actionPending(nextAction) ? "…" : nextAction.actionLabel}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* ============ TODAY ============ */}
      {rows.length > 0 && (
        <section className="tp-dash-activities" aria-label="Today's activities">
          <div className="tp-dash-activities-header">
            <p className="tp-dash-section-title">Today</p>
            <p className="tp-dash-activities-meta">
              {completedCount}/{totalCount} done ·{" "}
              <Link href="/habits">Manage habits</Link>
            </p>
          </div>
          <div className="tp-dash-activity-list">
            {rows.map((r) => (
              <ActivityItem key={r.key} row={r} today={today} setHabitCount={setHabitCount} setTaskProgress={setTaskProgress} />
            ))}
          </div>
          {stillAvailable > 0 && !allDone && (
            <div className="tp-dash-available">
              +{formatPoints(stillAvailable)} pts still available
            </div>
          )}
        </section>
      )}

      {/* ============ SCHEDULE ============ */}
      {schedule.length > 0 && (
        <section className="tp-dash-schedule" aria-label="Today's schedule">
          <div className="tp-dash-schedule-header">
            <p className="tp-dash-section-title">Schedule</p>
            <Link href="/calendar" className="tp-dash-schedule-link">Open calendar →</Link>
          </div>
          <div className="tp-dash-schedule-list">
            {nextUp && (
              <p className="tp-dash-schedule-next">
                Next: {nextUp.title} at {nextUp.timeLabel}
              </p>
            )}
            {schedule.map((item, i) => {
              const isNext = nextUp?.time === item.time && nextUp?.title === item.title;
              return (
                <div key={`${item.timeLabel}-${item.title}-${i}`} className="tp-dash-schedule-row">
                  <span className="tp-dash-schedule-time">{item.timeLabel}</span>
                  <Link href={item.href} className="tp-dash-schedule-item">
                    <span className="tp-dash-schedule-title" style={{ color: isNext ? "var(--primary)" : undefined }}>
                      {item.title}
                    </span>
                    <span className="tp-dash-schedule-kind" style={{ color: item.color }}>
                      {item.kind}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ============ SECONDARY METRICS ============ */}
      <footer className="tp-dash-footer">
        <div className="tp-dash-metrics">
          <span className="tp-dash-metric">
            <span aria-hidden>🔥</span> {stats.currentStreak} day streak
          </span>
          <span className="tp-dash-metric">
            <span aria-hidden>📊</span> {formatRating(stats.sevenDayAverage)} 7-day avg
          </span>
          <span className="tp-dash-metric">
            <span aria-hidden>⏱</span> {formatDuration(focusToday.seconds)} focus
          </span>
        </div>
        <Link href="/stats" className="tp-dash-progress-link">See your progress →</Link>
      </footer>
    </div>
  );
}

/* ================================================================== */
/* ACTIVITY ITEM                                                      */
/* ================================================================== */

function ActivityItem({
  row, today, setHabitCount, setTaskProgress,
}: {
  row: ActivityRow;
  today: string;
  setHabitCount: (id: number, day: string, count: number) => void;
  setTaskProgress: (id: number, day: string, progress: number) => void;
}) {
  const isNegative = row.kind === "negative";
  const isTask = row.kind === "task";
  const kindLabel = isNegative ? "Penalty" : isTask ? "Task" : "Habit";

  return (
    <div className={`tp-dash-activity ${isNegative ? "tp-dash-activity--neg" : ""} ${row.status === "done" ? "tp-dash-activity--done" : ""}`}>
      {/* Left: icon + info */}
      <div className="tp-dash-activity-left">
        <span
          className="tp-dash-activity-icon"
          aria-hidden
          style={{
            background: isNegative
              ? "color-mix(in srgb, var(--danger) 12%, var(--card))"
              : isTask
                ? "color-mix(in srgb, var(--primary) 12%, var(--card))"
                : `color-mix(in srgb, ${row.color} 14%, var(--card))`,
          }}
        >
          {row.icon}
        </span>
        <div className="tp-dash-activity-info">
          <Link href={row.href} className="tp-dash-activity-name">
            {row.name}
          </Link>
          <span className="tp-dash-activity-sub">
            <span className="tp-dash-activity-kind" data-kind={row.kind} style={{ color: isNegative ? "var(--danger)" : isTask ? "var(--primary)" : row.color }}>
              {kindLabel}
            </span>
            <span className="tp-dash-activity-detail">{row.detail}</span>
          </span>
        </div>
      </div>

      {/* Center: controls */}
      <div className="tp-dash-activity-controls">
        {row.control === "dots" ? (
          <>
            {row.scheduleTimes && row.scheduleTimes.length > 0 ? (
              <ScheduledOccurrenceDots
                habitId={row.id}
                day={today}
                times={row.scheduleTimes}
                color={row.color}
                count={row.count}
                target={row.targetCount}
              />
            ) : (
              <OccurrenceDots
                count={row.count}
                target={row.targetCount}
                color={row.color}
                size={24}
                onSelect={(n) => void setHabitCount(row.id, today, n)}
              />
            )}
            <span className="num tp-dash-activity-count">
              {row.count}/{row.targetCount}
            </span>
          </>
        ) : row.control === "stepper" ? (
          <>
            <span className="stepper">
              <button type="button" aria-label={`Remove progress on ${row.name}`} disabled={row.count <= 0}
                onClick={() => void setTaskProgress(row.id, today, Math.max(0, row.count - stepFor(row)))}>
                −
              </button>
              <span>{isTask && isTimeRow(row) ? formatMinutes(row.count) : row.count}</span>
              <button type="button" aria-label={`Add progress on ${row.name}`}
                onClick={() => void setTaskProgress(row.id, today, row.count + stepFor(row))}>
                +
              </button>
            </span>
            <div className="tp-dash-activity-stepper-info">
              <ProgressBar value={row.share * 100} max={100} height={4} color={row.color} label={`${row.name} progress`} />
              <span className="num tp-dash-activity-progress-label">{row.progressLabel}</span>
            </div>
          </>
        ) : (
          <>
            <span className="stepper">
              <button type="button" aria-label={isNegative ? `Remove one ${row.name} occurrence` : `Mark ${row.name}`}
                disabled={row.count <= 0}
                onClick={() => void (isNegative ? setHabitCount(row.id, today, row.count - 1) : setTaskProgress(row.id, today, row.count - 1))}>
                −
              </button>
              <span>{isNegative ? `${row.count}×` : row.count >= 1 ? "done" : "—"}</span>
              <button type="button" aria-label={isNegative ? `Record one ${row.name} occurrence` : `Complete ${row.name}`}
                onClick={() => void (isNegative ? setHabitCount(row.id, today, row.count + 1) : setTaskProgress(row.id, today, row.count + 1))}>
                +
              </button>
            </span>
            <span className="num tp-dash-activity-count">{row.progressLabel}</span>
          </>
        )}
      </div>

      {/* Right: earned + status */}
      <div className="tp-dash-activity-right">
        <span className="num tp-dash-activity-earned" style={{ color: isNegative ? "var(--danger)" : row.color }}>
          {isNegative ? formatPoints(row.earned) : `+${formatPoints(row.earned)}`}
        </span>
        <span
          className={
            row.status === "done" ? "pill pill-done"
              : row.status === "active" ? "pill pill-progress"
                : row.status === "penalty" ? "pill pill-penalty"
                  : "pill pill-muted"
          }
        >
          {row.statusLabel}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Helpers                                                          */
/* ---------------------------------------------------------------- */

function isTimeRow(row: ActivityRow): boolean {
  return row.icon === "⏱";
}

function stepFor(row: ActivityRow): number {
  if (isTimeRow(row)) return 15;
  if (row.targetCount >= 50) return 5;
  if (row.targetCount >= 10) return 1;
  return 1;
}