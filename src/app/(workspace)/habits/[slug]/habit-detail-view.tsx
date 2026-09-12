"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HabitEditor, OccurrenceDots } from "@/components/habit-grid";
import { BarChart, Heatmap, LineChart, ProgressRing, StreakStrip, buildWeeks } from "@/components/charts";
import { EmptyState, ProgressBar, Segmented, Stat } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { addDays, formatMedium, monthLabel, rangeKeys, weekdayOf } from "@/lib/dates";
import { formatPercent, formatPoints, formatRating, ratio } from "@/lib/format";
import {
  habitContributionFor,
  habitStats,
  isScheduled,
  monthlyBuckets,
  ratingSeries,
  weeklyBuckets,
  type ScoringContext,
} from "@/lib/stats";

type RangeId = "week" | "month" | "year" | "all";

const RANGE_DAYS: Record<RangeId, number> = { week: 7, month: 30, year: 365, all: 540 };

export function HabitDetailView({ slug }: { slug: string }) {
  const { habits, logs, tasks, taskProgress, today, setHabitCount } = useWorkspace();
  const habit = habits.find((h) => h.slug === slug);
  const [range, setRange] = useState<RangeId>("month");
  const [editing, setEditing] = useState(false);

  const dayCounts = useMemo(
    () => (habit ? logs[String(habit.id)] ?? {} : {}),
    [habit, logs],
  );
  const stats = useMemo(
    () => (habit ? habitStats(habit, logs, today) : null),
    [habit, logs, today],
  );

  const ctx: ScoringContext = useMemo(
    () => ({ habits, habitLogs: logs, tasks, taskProgress, today }),
    [habits, logs, tasks, taskProgress, today],
  );

  const rangeKeysList = useMemo(
    () => rangeKeys(addDays(today, -(RANGE_DAYS[range] - 1)), today),
    [range, today],
  );
  const yearKeys = useMemo(() => rangeKeys(addDays(today, -363), today), [today]);
  const streakStrip = useMemo(() => rangeKeys(addDays(today, -27), today), [today]);

  const heatSeries = useMemo(
    () =>
      habit
        ? yearKeys.map((key) => ({
            key,
            score: Math.min(1, (dayCounts[key]?.count ?? 0) / Math.max(1, habit.targetCount)),
            total: 1,
          }))
        : [],
    [habit, yearKeys, dayCounts],
  );

  const weekly = useMemo(
    () =>
      habit
        ? weeklyBuckets(
            { habits: [habit], habitLogs: logs, tasks: [], taskProgress: {}, today },
            range === "week" ? 8 : range === "month" ? 12 : 26,
          )
        : [],
    [habit, logs, range, today],
  );

  const monthly = useMemo(
    () =>
      habit
        ? monthlyBuckets({ habits: [habit], habitLogs: logs, tasks: [], taskProgress: {}, today }, 12)
        : [],
    [habit, logs, today],
  );

  const lineSeries = useMemo(
    () =>
      habit
        ? rangeKeysList.map((key) => ({
            key,
            // Historical days read their stored snapshot.
            score: habitContributionFor(habit, logs, key, today),
            total: habit.kind === "negative" ? Math.max(1, habit.pointValue * 3) : habit.pointValue,
          }))
        : [],
    [habit, logs, rangeKeysList, today],
  );

  const ratingTrend = useMemo(
    () => ratingSeries(ctx, rangeKeysList).map((p) => ({ key: p.key, score: p.rating, total: 10 })),
    [ctx, rangeKeysList],
  );

  // Hooks must run unconditionally — computed before any early return.
  const monthKeys = useMemo(() => {
    const ym = today.slice(0, 7);
    return Object.keys(dayCounts).filter((k) => k.startsWith(ym));
  }, [dayCounts, today]);

  if (!habit || !stats) {
    return (
      <div className="card">
        <EmptyState
          icon="🔍"
          title="Habit not found"
          message="This habit may have been renamed or deleted. Head back to the habits page to see everything you currently track."
          action={
            <Link href="/habits" className="btn btn-primary">
              Back to habits
            </Link>
          }
        />
      </div>
    );
  }

  const todayCount = dayCounts[today]?.count ?? 0;
  const target = Math.max(1, habit.targetCount);
  const todayShare = habit.kind === "negative" ? 0 : Math.min(1, todayCount / target);
  const isNegative = habit.kind === "negative";
  const scheduledToday = isScheduled(habit, today, weekdayOf);

  const monthOccurrences = monthKeys.reduce((a, k) => a + (dayCounts[k]?.count ?? 0), 0);
  const monthTarget = habit.kind === "negative" ? 0 : monthKeys.length * target;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs" style={{ color: "var(--fg-subtle)" }}>
        <Link href="/habits" className="hover:underline">
          Habits
        </Link>
        <span aria-hidden>/</span>
        <span style={{ color: "var(--fg)" }}>{habit.name}</span>
      </nav>

      <header
        className="card flex flex-wrap items-center justify-between gap-5 p-6"
        style={{ borderTop: `3px solid ${habit.color}` }}
      >
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="grid h-16 w-16 shrink-0 place-items-center text-3xl"
            style={{
              background: `color-mix(in srgb, ${habit.color} 16%, var(--card))`,
              borderRadius: "var(--radius)",
              border: `1px solid color-mix(in srgb, ${habit.color} 30%, var(--card))`,
            }}
          >
            {habit.icon}
          </span>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{habit.name}</h1>
            <p className="mt-1 max-w-xl text-sm" style={{ color: "var(--fg-muted)" }}>
              {habit.description || "No description yet."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className="chip"
                style={{ borderColor: isNegative ? "var(--danger)" : habit.color, color: isNegative ? "var(--danger)" : "var(--fg)" }}
              >
                {isNegative ? "− negative habit" : "＋ positive habit"}
              </span>
              <span className="chip num" style={{ borderColor: habit.color, color: habit.color }}>
                {isNegative
                  ? `${formatPoints(habit.pointValue)} penalty each`
                  : `${formatPoints(habit.pointValue)} max · ${formatPoints(habit.pointValue / target)} per occurrence`}
              </span>
              <span className="chip">
                {habit.days.length === 0 ? "Every day" : `${habit.days.length}× / week`}
              </span>
              {!isNegative ? <span className="chip num">{target}× per day</span> : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ProgressRing
            value={isNegative ? todayCount : todayShare * 100}
            max={isNegative ? Math.max(3, todayCount) : 100}
            label={isNegative ? String(todayCount) : formatPercent(todayShare)}
            sublabel={isNegative ? "occurrences" : "today"}
            size={132}
            thickness={12}
            color={isNegative ? "var(--danger)" : habit.color}
          />
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            Edit habit
          </button>
        </div>
      </header>

      {scheduledToday ? (
        <section className="card p-5" aria-label="Record today">
          <p className="eyebrow">Today</p>
          <h2 className="mb-3 text-lg font-semibold">
            {isNegative ? "Record an occurrence" : `${todayCount} / ${target} completed`}
          </h2>
          {isNegative ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn"
                disabled={todayCount === 0}
                onClick={() => void setHabitCount(habit.id, today, todayCount - 1)}
              >
                − Remove
              </button>
              <span className="num text-2xl font-bold" style={{ color: "var(--danger)" }}>
                {todayCount}
              </span>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void setHabitCount(habit.id, today, todayCount + 1)}
              >
                + Record occurrence
              </button>
              <span className="num text-sm font-bold" style={{ color: "var(--danger)" }}>
                {formatPoints(todayCount * habit.pointValue)} penalty today
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <OccurrenceDots
                count={todayCount}
                target={target}
                color={habit.color}
                onSelect={(n) => void setHabitCount(habit.id, today, n)}
                size={32}
              />
              <span className="num text-sm font-bold" style={{ color: habit.color }}>
                +{formatPoints(habitContributionFor(habit, logs, today, today))} /{" "}
                {formatPoints(habit.pointValue)} toward
                today&apos;s rating
              </span>
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Not scheduled today ({formatMedium(today)}).
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Today"
          value={isNegative ? `${todayCount}×` : `${todayCount}/${target}`}
          sub={isNegative ? "Occurrences today" : formatPercent(todayShare)}
          accent={isNegative ? "var(--danger)" : habit.color}
        />
        <Stat label="Current streak" value={`${stats.currentStreak} days`} accent={habit.color} />
        <Stat label="Longest streak" value={`${stats.longestStreak} days`} accent="var(--warn)" />
        <Stat
          label="Average completion"
          value={isNegative ? `${stats.totalOccurrences}×` : `${stats.completionRate}%`}
          sub={isNegative ? "Occurrences all time" : `${stats.totalOccurrences}/${stats.totalTarget} occurrences`}
          accent="var(--positive)"
        />
        <Stat label="Days target met" value={stats.fullDays} sub="Scheduled days fully completed" accent="var(--primary)" />
        <Stat
          label="This month"
          value={isNegative ? `${monthOccurrences}×` : `${monthOccurrences}/${monthTarget || "—"}`}
          sub={isNegative ? "Occurrences this month" : `out of ${monthTarget} targeted`}
          accent="var(--accent)"
        />
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Yearly heatmap</p>
            <h2 className="text-lg font-semibold">Every day this year</h2>
          </div>
          <Segmented
            ariaLabel="Select analysis range"
            value={range}
            onChange={setRange}
            options={[
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
              { value: "year", label: "Year" },
              { value: "all", label: "All time" },
            ]}
          />
        </div>
        <Heatmap weeks={buildWeeks(heatSeries)} color={habit.color} cellSize={12} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card min-w-0 p-5">
          <p className="eyebrow">Contribution over time</p>
          <h2 className="mb-3 text-lg font-semibold">
            {range === "week" ? "This week" : range === "month" ? "Last 30 days" : range === "year" ? "Last 365 days" : "All time"}
          </h2>
          <LineChart data={lineSeries} color={habit.color} height={200} />
        </div>
        <div className="card min-w-0 p-5">
          <p className="eyebrow">Overall daily rating</p>
          <h2 className="mb-3 text-lg font-semibold">How your days rated</h2>
          <LineChart data={ratingTrend} height={200} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card min-w-0 p-5 lg:col-span-2">
          <p className="eyebrow">Weekly occurrences</p>
          <h2 className="mb-3 text-lg font-semibold">Occurrences per week</h2>
          <BarChart
            data={weekly.map((w) => ({ ...w, score: w.rating, total: Math.max(1, target * 7) }))}
            color={habit.color}
            unit="×"
            height={200}
          />
        </div>
        <div className="card min-w-0 p-5">
          <p className="eyebrow">Streak visualization</p>
          <h2 className="mb-3 text-lg font-semibold">Last 28 days</h2>
          <StreakStrip
            keys={streakStrip}
            done={new Set(streakStrip.filter((k) => (dayCounts[k]?.count ?? 0) >= target))}
            color={habit.color}
          />
          <dl className="mt-4 grid grid-cols-2 gap-2">
            <div className="surface p-3">
              <dt className="eyebrow">Last 7 days</dt>
              <dd className="num text-lg font-bold">
                {stats.last7.occurrences}
                <span style={{ color: "var(--fg-subtle)" }}>/{stats.last7.target || "—"}</span>
              </dd>
            </div>
            <div className="surface p-3">
              <dt className="eyebrow">Last 30 days</dt>
              <dd className="num text-lg font-bold">
                {stats.last30.occurrences}
                <span style={{ color: "var(--fg-subtle)" }}>/{stats.last30.target || "—"}</span>
              </dd>
            </div>
          </dl>
          {!isNegative ? (
            <div className="mt-4">
              <p className="eyebrow mb-1.5">Target completion</p>
              <ProgressBar value={stats.completionRate} max={100} color={habit.color} height={10} label="Target completion" />
            </div>
          ) : null}
        </div>
      </section>

      <section className="card p-5">
        <p className="eyebrow">Monthly log</p>
        <h2 className="mb-3 text-lg font-semibold">Month-by-month history</h2>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="grid-table min-w-[560px]">
            <thead>
              <tr>
                <th scope="col" className="text-left">Month</th>
                <th scope="col" className="text-left">Occurrences</th>
                <th scope="col" className="text-left">Targeted</th>
                <th scope="col" className="text-left">Rate</th>
                <th scope="col" className="text-left" style={{ minWidth: 150 }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {monthly.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-sm" style={{ color: "var(--fg-muted)" }}>
                    No history yet — record an occurrence to start building data.
                  </td>
                </tr>
              ) : (
                monthly
                  .slice()
                  .reverse()
                  .map((m) => {
                    return (
                      <tr key={m.key}>
                        <td className="font-semibold">{monthLabel(m.key)}</td>
                        <td className="num">{m.rating}</td>
                        <td className="num" style={{ color: "var(--fg-muted)" }}>{m.days} days</td>
                        <td className="num">{formatPercent(ratio(m.rating, 10))}</td>
                        <td>
                          <ProgressBar value={m.rating} max={10} color={habit.color} height={7} />
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <HabitEditor open={editing} onClose={() => setEditing(false)} habit={habit} />
    </div>
  );
}

export { formatRating };
