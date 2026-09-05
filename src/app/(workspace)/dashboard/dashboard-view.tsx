"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { OccurrenceDots, ScheduledOccurrenceDots } from "@/components/habit-grid";
import { ProgressBar } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { formatDuration, formatLong, weekdayOf } from "@/lib/dates";
import { minutesInZone } from "@/lib/timezone";
import { minutesToTime, timeToMinutes } from "@/lib/format";
import {
  formatPercent,
  formatPoints,
  formatRating,
  ratingColor,
  ratingLabel,
  ratingMessage,
} from "@/lib/format";
import {
  configuredPositiveWeight,
  countFor,
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
  contribution,
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
  /** What the user is aiming for, e.g. "3 times" or "2 hours". */
  targetLabel: string;
  /** Interactive control rendered in the Progress column. */
  control: "dots" | "stepper" | "counter";
  count: number;
  targetCount: number;
  scheduleTimes?: string[];
  progressLabel: string;
  /** 0–1 share used for the inline progress bar. */
  share: number;
  earned: number;
  maximum: number;
  status: "done" | "active" | "todo" | "penalty";
  statusLabel: string;
  color: string;
};

export function DashboardView({ userName, greeting }: { userName: string; greeting: string }) {
  const {
    habits, logs, tasks, events, focus, taskProgress, occurrences,
    setHabitCount, setTaskProgress, today, timezone,
  } = useWorkspace();
  void occurrences;

  /** The single scoring context — identical to the one used everywhere else. */
  const ctx: ScoringContext = useMemo(
    () => ({ habits, habitLogs: logs, tasks, taskProgress, today }),
    [habits, logs, tasks, taskProgress, today],
  );

  const rating = useMemo(() => scoreDay(ctx, today, weekdayOf), [ctx, today]);
  const stats = useMemo(() => overallStats(ctx, 540), [ctx]);
  const configured = useMemo(
    () => configuredPositiveWeight(habits, today, weekdayOf),
    [habits, today],
  );

  const focusToday = useMemo(() => focusTotals(focus, [today]), [focus, today]);

  /* ---------------- build the single activity table ---------------- */

  const rows = useMemo<ActivityRow[]>(() => {
    const out: ActivityRow[] = [];

    for (const habit of habits) {
      // A recorded log means the habit participated today even if it has since
      // been disabled or its weekday schedule changed.
      const logEntry = logs[String(habit.id)]?.[today];
      const participated = !!logEntry;
      if (!participated && (!habit.enabled || !isScheduled(habit, today, weekdayOf))) continue;

      // The recorded target wins over the current configuration.
      const target = Math.max(1, logEntry?.targetCountAtRecord ?? habit.targetCount);
      const count = countFor(logs, habit.id, today);
      // Recorded activity keeps its snapshot; unrecorded uses current config.
      const earned = habitContributionFor(habit, logs, today, today);
      const negative = habit.kind === "negative";
      const full = count >= target;

      out.push({
        key: `h${habit.id}`,
        kind: negative ? "negative" : "habit",
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        detail:
          habit.description ||
          (negative ? `Penalty ${formatPoints(habit.pointValue)} per occurrence` : `${formatPoints(habit.pointValue)} pts max`),
        href: `/habits/${habit.slug}`,
        targetLabel: negative ? "—" : `${target} ${target === 1 ? "time" : "times"}`,
        control: negative ? "counter" : "dots",
        scheduleTimes: habit.scheduleTimes,
        count,
        targetCount: target,
        progressLabel: negative
          ? `${count} ${count === 1 ? "occurrence" : "occurrences"}`
          : `${count} / ${target}`,
        share: negative ? Math.min(1, count / 4) : Math.min(1, count / target),
        earned: Math.round(earned * 100) / 100,
        maximum: negative ? habit.pointValue : habit.pointValue,
        status: negative
          ? count > 0
            ? "penalty"
            : "todo"
          : full
            ? "done"
            : count > 0
              ? "active"
              : "todo",
        statusLabel: negative
          ? count > 0
            ? `−${formatPoints(count * habit.pointValue)}`
            : "Clean"
          : full
            ? "Complete"
            : count > 0
              ? "In progress"
              : "Not started",
        color: habit.color,
      });
    }

    for (const task of tasks) {
      if (task.day && task.day !== today) continue;
      const progress = taskProgressFor(taskProgress, task.id, today);
      const target = taskTarget(task);
      // Recorded progress keeps its snapshot; unrecorded uses current config.
      const earned = taskContributionFor(task, task.id, taskProgress, today, today);
      const share = ratioFor(task, progress);
      const over = completionRatio(task, progress) > 1;
      const measure =
        task.measureType === "time"
          ? "⏱"
          : task.measureType === "count"
            ? "🔢"
            : task.measureType === "quantity"
              ? "📊"
              : "✅";

      out.push({
        key: `t${task.id}`,
        kind: "task",
        id: task.id,
        name: task.title,
        icon: measure,
        detail: task.category + (task.notes ? ` · ${task.notes}` : ""),
        href: "/tasks",
        targetLabel:
          task.measureType === "completion"
            ? "Complete"
            : task.measureType === "time"
              ? formatMinutes(target)
              : `${formatPoints(target, 2)} ${task.unit || "units"}`,
        control: task.measureType === "completion" ? "counter" : "stepper",
        count: progress,
        targetCount: target,
        progressLabel:
          formatTaskProgressOverTarget(task, progress) +
          (over ? ` · ${Math.round(completionRatio(task, progress) * 100)}%` : ""),
        share,
        earned,
        maximum: task.maxPoints,
        status:
          task.status === "completed" || share >= 1
            ? "done"
            : progress > 0 || task.status === "in_progress"
              ? "active"
              : "todo",
        statusLabel:
          task.status === "completed" || share >= 1
            ? "Complete"
            : progress > 0 || task.status === "in_progress"
              ? "In progress"
              : "Not started",
        color: "var(--primary)",
      });
    }

    // Positive habits first, then tasks, then negative behaviours.
    const rank: Record<RowKind, number> = { habit: 0, task: 1, negative: 2 };
    return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
  }, [habits, logs, tasks, taskProgress, today]);

  /* ---------------- what is still available today ---------------- */

  const remaining = useMemo(() => {
    const items: { label: string; points: number; href: string }[] = [];
    for (const r of rows) {
      if (r.kind === "negative") {
        if (r.count > 0) items.push({ label: r.name, points: r.earned, href: r.href });
        continue;
      }
      const left = Math.round((r.maximum - r.earned) * 100) / 100;
      if (left > 0.005) items.push({ label: r.name, points: left, href: r.href });
    }
    return items.sort((a, b) => b.points - a.points);
  }, [rows]);

  const stillAvailable = Math.round(remaining.filter((r) => r.points > 0).reduce((a, r) => a + r.points, 0) * 100) / 100;
  const penaltiesToday = rating.penalties;
  const overConfigured = rating.overConfigured;

  /* ---------------- today's schedule ---------------- */

  const schedule = useMemo(() => {
    type Item = { time: number; timeLabel: string; title: string; kind: string; color: string; href: string };
    const out: Item[] = [];

    for (const e of events) {
      if (e.day !== today) continue;
      out.push({
        time: timeToMinutes(e.startTime) ?? 540,
        timeLabel: e.startTime,
        title: e.title,
        kind: e.kind,
        color: e.color || "var(--accent)",
        href: "/calendar",
      });
    }
    for (const t of tasks) {
      if (t.day !== today || !t.startTime) continue;
      out.push({
        time: timeToMinutes(t.startTime) ?? 540,
        timeLabel: t.startTime,
        title: t.title,
        kind: "task",
        color: "var(--primary)",
        href: "/tasks",
      });
    }
    for (const f of focus) {
      if (f.day !== today || f.mode !== "focus" || !f.completed) continue;
      out.push({
        time: 8 * 60,
        timeLabel: minutesToTime(8 * 60),
        title: `Focus · ${formatDuration(f.seconds)}`,
        kind: "focus",
        color: "#8b5cf6",
        href: "/timer",
      });
    }
    return out.sort((a, b) => a.time - b.time);
  }, [events, tasks, focus, today]);

  // Read the clock after mount so server and client render the same markup.
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMinutes(minutesInZone(new Date(), timezone));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [timezone]);
  const nextUp = nowMinutes === null ? null : (schedule.find((s) => s.time >= nowMinutes) ?? null);

  const todayTasks = tasks.filter((t) => !t.day || t.day === today);
  const doneTasks = todayTasks.filter((t) => t.status === "completed").length;

  return (
    <div className="flex flex-col gap-0">
      {/* ============ DATE · GREETING · RATING ============ */}
      <header className="pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.8rem] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--fg-subtle)" }}>
              {formatLong(today)}
            </p>
            <h1 className="mt-1.5 text-[1.75rem] font-bold leading-tight md:text-[2.1rem]">
              {greeting}
              {userName.trim() ? `, ${userName.trim().split(" ")[0]}` : ""}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">🔥 {stats.currentStreak} day streak</span>
            <span className="chip">7d avg {formatRating(stats.sevenDayAverage)}</span>
            <span className="chip">⏱ {formatDuration(focusToday.seconds)}</span>
          </div>
        </div>

        {/* Rating band — one structured surface, not a stack of cards */}
        <div className="ws-band mt-6 flex flex-col gap-6 p-5 md:flex-row md:items-center md:gap-8 md:p-6">
          {/* The number */}
          <div className="flex items-center gap-5">
            <div className="shrink-0">
              <p className="ws-title">Today&apos;s rating</p>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="num text-[3.4rem] font-bold leading-none md:text-[4rem]"
                  style={{ color: ratingColor(rating.rating), letterSpacing: "-0.03em" }}
                >
                  {formatRating(rating.rating)}
                </span>
                <span className="num text-[1.5rem] font-bold leading-none" style={{ color: "var(--fg-subtle)" }}>
                  / 10
                </span>
              </div>
            </div>
            <div
              className="hidden h-16 w-px shrink-0 md:block"
              style={{ background: "var(--line)" }}
              aria-hidden
            />
          </div>

          {/* Verdict + bar */}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold" style={{ color: ratingColor(rating.rating) }}>
              {ratingLabel(rating.rating)}
            </p>
            <p className="mt-0.5 text-sm" style={{ color: "var(--fg-muted)" }}>
              {ratingMessage(rating.rating)}
            </p>
            <div className="mt-3">
              <ProgressBar
                value={rating.rating}
                max={10}
                label="Daily rating"
                height={10}
                color={ratingColor(rating.rating)}
              />
              <div className="mt-1.5 flex justify-between text-[0.7rem]" style={{ color: "var(--fg-subtle)" }}>
                <span>0</span>
                <span>{formatPercent(rating.rating / 10)} of a perfect day</span>
                <span>10</span>
              </div>
            </div>
          </div>

          {/* Compact breakdown */}
          <div className="w-full shrink-0 md:w-56">
            <div className="breakdown-row">
              <span style={{ color: "var(--fg-muted)" }}>Habits</span>
              <span className="num font-bold" style={{ color: "var(--positive)" }}>
                +{formatPoints(rating.habits)}
              </span>
            </div>
            <div className="breakdown-row">
              <span style={{ color: "var(--fg-muted)" }}>Tasks</span>
              <span className="num font-bold" style={{ color: "var(--primary)" }}>
                +{formatPoints(rating.tasks)}
              </span>
            </div>
            <div className="breakdown-row">
              <span style={{ color: "var(--fg-muted)" }}>Penalties</span>
              <span className="num font-bold" style={{ color: penaltiesToday > 0 ? "var(--danger)" : "var(--fg-subtle)" }}>
                −{formatPoints(penaltiesToday)}
              </span>
            </div>
            <div className="breakdown-row" style={{ borderTop: "1px solid var(--line)" }}>
              <span className="font-bold">Final</span>
              <span className="num font-bold" style={{ color: ratingColor(rating.rating) }}>
                {formatRating(rating.rating)} / 10
              </span>
            </div>
            {overConfigured ? (
              <p
                className="mt-2 px-2 py-1.5 text-[0.7rem] font-semibold"
                style={{
                  background: "color-mix(in srgb, var(--warn) 12%, var(--card))",
                  border: "1px solid color-mix(in srgb, var(--warn) 32%, var(--card))",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--fg)",
                }}
                title="Configured rewards exceed the 10-point daily rating"
              >
                Over-configured: {formatPoints(rating.habitAvailable + rating.taskAvailable)} of reward
                configured. The rating caps at 10, so {formatPoints(rating.habitAvailable + rating.taskAvailable - 10)} can
                never be used. Your values are not rescaled.
              </p>
            ) : Math.abs(configured - 10) > 0.01 ? (
              <p className="mt-2 text-[0.7rem]" style={{ color: "var(--fg-subtle)" }}>
                Positive habit weights total {formatPoints(configured)} — aim for 10 so a full day is 10/10.
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {/* ============ TODAY'S WORKSPACE ============ */}
      <section className="ws-section border-t pt-6" aria-labelledby="workspace">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="workspace" className="ws-title">
            Today&apos;s workspace
          </h2>
          <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
            {rows.filter((r) => r.kind !== "negative" && r.status === "done").length} of{" "}
            {rows.filter((r) => r.kind !== "negative").length} activities complete ·{" "}
            <Link href="/habits" className="font-semibold hover:underline">
              Manage habits
            </Link>
          </p>
        </div>

        <div className="ws-band overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="ws-table min-w-[900px]">
              <caption className="sr-only">
                Today&apos;s activities with type, target, interactive progress, earned versus maximum reward and
                status.
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ minWidth: 230 }}>Activity</th>
                  <th scope="col" style={{ width: 90 }}>Type</th>
                  <th scope="col" style={{ width: 104 }}>Target</th>
                  <th scope="col" style={{ minWidth: 260 }}>Progress</th>
                  <th scope="col" className="num" style={{ width: 116 }}>Reward</th>
                  <th scope="col" style={{ width: 122 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center" style={{ color: "var(--fg-muted)" }}>
                      Nothing scheduled today.{" "}
                      <Link href="/habits" className="font-semibold hover:underline">
                        Add habits
                      </Link>{" "}
                      or{" "}
                      <Link href="/tasks" className="font-semibold hover:underline">
                        create a task
                      </Link>
                      .
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.key} className={r.kind === "negative" ? "row-neg" : undefined}>
                      {/* Activity */}
                      <td>
                        <Link href={r.href} className="group flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="grid h-8 w-8 shrink-0 place-items-center text-base"
                            style={{
                              background: `color-mix(in srgb, ${r.color} 14%, var(--card))`,
                              borderRadius: "var(--radius-sm)",
                            }}
                          >
                            {r.icon}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold group-hover:underline">
                              {r.name}
                            </span>
                            <span className="block truncate text-[0.7rem]" style={{ color: "var(--fg-subtle)" }}>
                              {r.detail}
                            </span>
                          </span>
                        </Link>
                      </td>

                      {/* Type */}
                      <td>
                        <span
                          className="pill"
                          style={
                            r.kind === "negative"
                              ? { background: "color-mix(in srgb, var(--danger) 10%, var(--card))", color: "var(--danger)" }
                              : r.kind === "task"
                                ? { background: "color-mix(in srgb, var(--primary) 10%, var(--card))", color: "var(--primary)" }
                                : { background: "color-mix(in srgb, var(--positive) 10%, var(--card))", color: "var(--positive)" }
                          }
                        >
                          {r.kind === "habit" ? "Habit" : r.kind === "task" ? "Task" : "Negative"}
                        </span>
                      </td>

                      {/* Target */}
                      <td className="num text-xs font-semibold" style={{ color: "var(--fg-muted)" }}>
                        {r.targetLabel}
                      </td>

                      {/* Progress — interactive */}
                      <td>
                        {r.control === "dots" ? (
                          <div className="flex flex-wrap items-center gap-3">
                            {r.scheduleTimes && r.scheduleTimes.length > 0 ? (
                              /* Occurrence-level: each dot is a real scheduled time. */
                              <ScheduledOccurrenceDots
                                habitId={r.id}
                                day={today}
                                times={r.scheduleTimes}
                                color={r.color}
                                count={r.count}
                                target={r.targetCount}
                              />
                            ) : (
                              <OccurrenceDots
                                count={r.count}
                                target={r.targetCount}
                                color={r.color}
                                size={24}
                                onSelect={(n) => void setHabitCount(r.id, today, n)}
                              />
                            )}
                            <span className="num text-xs font-bold" style={{ color: "var(--fg-muted)" }}>
                              {r.count} / {r.targetCount}
                            </span>
                          </div>
                        ) : r.control === "stepper" ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="stepper">
                              <button
                                type="button"
                                aria-label={`Remove progress on ${r.name}`}
                                disabled={r.count <= 0}
                                onClick={() =>
                                  void setTaskProgress(r.id, today, Math.max(0, r.count - stepFor(r)))
                                }
                              >
                                −
                              </button>
                              <span>{r.kind === "task" && isTimeRow(r) ? formatMinutes(r.count) : r.count}</span>
                              <button
                                type="button"
                                aria-label={`Add progress on ${r.name}`}
                                onClick={() => void setTaskProgress(r.id, today, r.count + stepFor(r))}
                              >
                                +
                              </button>
                            </span>
                            <div className="min-w-[7rem] flex-1">
                              <ProgressBar value={r.share * 100} max={100} height={6} color={r.color} label={`${r.name} progress`} />
                              <span className="num block truncate text-[0.7rem]" style={{ color: "var(--fg-subtle)" }}>
                                {r.progressLabel}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="stepper">
                              <button
                                type="button"
                                aria-label={r.kind === "negative" ? `Remove one ${r.name} occurrence` : `Mark ${r.name}`}
                                disabled={r.count <= 0}
                                onClick={() =>
                                  void (r.kind === "negative"
                                    ? setHabitCount(r.id, today, r.count - 1)
                                    : setTaskProgress(r.id, today, r.count - 1))
                                }
                              >
                                −
                              </button>
                              <span>
                                {r.kind === "negative"
                                  ? `${r.count}×`
                                  : r.count >= 1
                                    ? "done"
                                    : "—"}
                              </span>
                              <button
                                type="button"
                                aria-label={r.kind === "negative" ? `Record one ${r.name} occurrence` : `Complete ${r.name}`}
                                onClick={() =>
                                  void (r.kind === "negative"
                                    ? setHabitCount(r.id, today, r.count + 1)
                                    : setTaskProgress(r.id, today, r.count + 1))
                                }
                              >
                                +
                              </button>
                            </span>
                            <span className="num text-xs font-bold" style={{ color: "var(--fg-muted)" }}>
                              {r.progressLabel}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Reward */}
                      <td className="num">
                        <span className="text-sm font-bold" style={{ color: r.kind === "negative" ? "var(--danger)" : r.color }}>
                          {r.kind === "negative" ? formatPoints(r.earned) : `+${formatPoints(r.earned)}`}
                        </span>
                        <span className="block text-[0.7rem]" style={{ color: "var(--fg-subtle)" }}>
                          {r.kind === "negative" ? `/ ${formatPoints(r.maximum)} each` : `/ ${formatPoints(r.maximum)}`}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={
                            r.status === "done"
                              ? "pill pill-done"
                              : r.status === "active"
                                ? "pill pill-progress"
                                : r.status === "penalty"
                                  ? "pill pill-penalty"
                                  : "pill pill-muted"
                          }
                        >
                          {r.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* What remains — integrated, not a separate card */}
              {rows.length > 0 ? (
                <tfoot>
                  <tr>
                    <td colSpan={6}>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <span className="font-semibold">
                          {stillAvailable > 0
                            ? `${formatPoints(stillAvailable)} pts still available`
                            : "Everything complete — nothing left to earn today"}
                        </span>
                        {remaining.length > 0 ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            {remaining.slice(0, 8).map((m) => (
                              <Link
                                key={m.label}
                                href={m.href}
                                className="chip"
                                title={m.points > 0 ? `+${formatPoints(m.points)} available` : formatPoints(m.points)}
                              >
                                {m.label}
                                <span className="num" style={{ color: m.points > 0 ? "var(--positive)" : "var(--danger)" }}>
                                  {m.points > 0 ? `+${formatPoints(m.points)}` : formatPoints(m.points)}
                                </span>
                              </Link>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      </section>

      {/* ============ TODAY'S TASKS  ·  TODAY'S SCHEDULE ============ */}
      <div className="grid gap-8 border-t pt-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ---- Tasks ---- */}
        <section aria-labelledby="todays-tasks">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="todays-tasks" className="ws-title">
              Today&apos;s tasks
            </h2>
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
              {todayTasks.length === 0 ? "No tasks" : `${doneTasks} / ${todayTasks.length} done`} ·{" "}
              <Link href="/tasks" className="font-semibold hover:underline">
                All tasks
              </Link>
            </p>
          </div>

          {todayTasks.length === 0 ? (
            <div className="py-8 text-sm" style={{ color: "var(--fg-muted)" }}>
              No tasks scheduled today.{" "}
              <Link href="/tasks" className="font-semibold hover:underline">
                Create one
              </Link>{" "}
              and give it a target and a fixed reward.
            </div>
          ) : (
            <ul>
              {todayTasks.map((t) => {
                const progress = taskProgressFor(taskProgress, t.id, today);
                const earned = taskContributionFor(t, t.id, taskProgress, today, today);
                const share = ratioFor(t, progress);
                const over = completionRatio(t, progress) > 1;
                const icon =
                  t.measureType === "time" ? "⏱" : t.measureType === "count" ? "🔢" : t.measureType === "quantity" ? "📊" : "✅";
                return (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3 last:border-b-0"
                    style={{ borderColor: "var(--grid-line)" }}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={t.status === "completed"}
                      aria-label={`Mark ${t.title} ${t.status === "completed" ? "incomplete" : "complete"}`}
                      className="check-cell shrink-0"
                      style={{ ["--cell-color" as string]: "var(--positive)" }}
                      onClick={() =>
                        void setTaskProgress(
                          t.id,
                          today,
                          t.status === "completed" ? 0 : taskTarget(t),
                        )
                      }
                    />
                    <Link href="/tasks" className="min-w-[9rem] flex-1">
                      <span
                        className="block truncate text-sm font-semibold"
                        style={{
                          textDecoration: t.status === "completed" ? "line-through" : "none",
                          color: t.status === "completed" ? "var(--fg-subtle)" : "var(--fg)",
                        }}
                      >
                        <span aria-hidden className="mr-1.5">
                          {icon}
                        </span>
                        {t.title}
                      </span>
                      <span className="num block truncate text-[0.7rem]" style={{ color: "var(--fg-subtle)" }}>
                        {t.measureType === "completion"
                          ? "All or nothing"
                          : `${formatTaskProgressOverTarget(t, progress)}${over ? ` · ${Math.round(completionRatio(t, progress) * 100)}%` : ""}`}
                      </span>
                    </Link>
                    <span className="w-24 shrink-0">
                      <ProgressBar value={share * 100} max={100} height={6} color="var(--primary)" label={`${t.title} progress`} />
                    </span>
                    <span className="num w-20 shrink-0 text-right text-sm font-bold" style={{ color: "var(--primary)" }}>
                      +{formatPoints(earned)}
                      <span className="block text-[0.7rem] font-semibold" style={{ color: "var(--fg-subtle)" }}>
                        / {formatPoints(t.maxPoints)}
                      </span>
                    </span>
                    {t.startTime ? (
                      <span className="num w-28 shrink-0 text-right text-xs font-semibold" style={{ color: "var(--fg-muted)" }}>
                        {t.startTime}
                        {t.endTime ? `–${t.endTime}` : ""}
                      </span>
                    ) : (
                      <span className="w-28 shrink-0" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---- Schedule preview ---- */}
        <section aria-labelledby="todays-schedule">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="todays-schedule" className="ws-title">
              Today&apos;s schedule
            </h2>
            <Link href="/calendar" className="text-xs font-semibold hover:underline" style={{ color: "var(--primary)" }}>
              Open calendar →
            </Link>
          </div>

          {schedule.length === 0 ? (
            <div className="py-8 text-sm" style={{ color: "var(--fg-muted)" }}>
              Nothing on the calendar today.
            </div>
          ) : (
            <>
              {nextUp ? (
                <p className="mb-2 text-xs font-semibold" style={{ color: "var(--primary)" }}>
                  Next: {nextUp.title} at {nextUp.timeLabel}
                </p>
              ) : null}
              <ul>
                {schedule.map((item, i) => {
                  const isNext = nextUp?.time === item.time && nextUp?.title === item.title;
                  return (
                    <li key={`${item.timeLabel}-${item.title}-${i}`} className="agenda-row">
                      <span className="agenda-time">{item.timeLabel}</span>
                      <Link href={item.href} className="min-w-0 group">
                        <span
                          className="block truncate text-sm font-semibold group-hover:underline"
                          style={{ color: isNext ? "var(--primary)" : "var(--fg)" }}
                        >
                          {item.title}
                        </span>
                        <span className="block truncate text-[0.7rem] uppercase tracking-wide" style={{ color: item.color }}>
                          {item.kind}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[0.7rem]" style={{ color: "var(--fg-subtle)" }}>
                {schedule.length} {schedule.length === 1 ? "item" : "items"} scheduled
              </p>
            </>
          )}
        </section>
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

/** Sensible increment for the inline task stepper. */
function stepFor(row: ActivityRow): number {
  if (isTimeRow(row)) return 15;
  if (row.targetCount >= 50) return 5;
  if (row.targetCount >= 10) return 1;
  return 1;
}
