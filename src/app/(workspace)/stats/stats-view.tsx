"use client";

import { useMemo, useState } from "react";
import { BarChart, CompareBars, Heatmap, LineChart, buildWeeks } from "@/components/charts";
import { EmptyState, ProgressBar, SectionHeader, Segmented, Stat } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { addDays, formatDuration, formatShort, monthLabel, rangeKeys, weekdayOf } from "@/lib/dates";
import { formatPercent, formatPoints, formatRating, ratingColor, ratio } from "@/lib/format";
import {
  configuredPositiveWeight,
  focusTotals,
  habitComparison,
  monthlyBuckets,
  overallStats,
  ratingSeries,
  scoreDay,
  weeklyBuckets,
  type ScoringContext,
} from "@/lib/stats";
import { ratioFor } from "@/lib/tasks";
import { taskContributionFor, taskProgressFor } from "@/lib/stats";

type RangeId = "7" | "30" | "90" | "180" | "365" | "540";

const RANGES: { value: RangeId; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "3 months" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year" },
  { value: "540", label: "All time" },
];

export function StatsView() {
  const { habits, logs, tasks, focus, taskProgress, today } = useWorkspace();
  const [range, setRange] = useState<RangeId>("30");

  const ctx: ScoringContext = useMemo(
    () => ({ habits, habitLogs: logs, tasks, taskProgress, today }),
    [habits, logs, tasks, taskProgress, today],
  );

  // Extracted so the dependency array stays statically checkable.
  const rangeDays = Number(range);
  const keys = useMemo(
    () => rangeKeys(addDays(today, -(rangeDays - 1)), today),
    [rangeDays, today],
  );
  const series = useMemo(() => ratingSeries(ctx, keys), [ctx, keys]);
  const stats = useMemo(() => overallStats(ctx, rangeDays), [ctx, rangeDays]);
  const weekly = useMemo(() => weeklyBuckets(ctx, 16), [ctx]);
  const monthly = useMemo(() => monthlyBuckets(ctx, 12), [ctx]);
  const comparison = useMemo(() => habitComparison(ctx, keys), [ctx, keys]);
  const heatKeys = useMemo(() => rangeKeys(addDays(today, -363), today), [today]);
  const heat = useMemo(
    () => ratingSeries(ctx, heatKeys).map((p) => ({ key: p.key, score: p.rating, total: 10 })),
    [ctx, heatKeys],
  );
  const focusRange = useMemo(() => focusTotals(focus, keys), [focus, keys]);
  const configured = useMemo(
    () => configuredPositiveWeight(habits, today, weekdayOf),
    [habits, today],
  );

  const habitCount = habits.filter((h) => h.enabled).length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const bestHabit = comparison[0];
  const worstHabit = comparison.length > 1 ? comparison[comparison.length - 1] : null;

  const taskRows = useMemo(
    () =>
      tasks
        .map((t) => {
          const days = range === "540" ? Object.keys(taskProgress[String(t.id)] ?? {}) : keys;
          const progress = days.reduce(
            (a, d) => a + taskProgressFor(taskProgress, t.id, d),
            0,
          );
          // Historical days contribute their snapshot; today contributes live.
          const earned = days.reduce(
            (a, d) => a + taskContributionFor(t, t.id, taskProgress, d, today),
            0,
          );
          return { task: t, progress, earned, ratio: ratioFor(t, progress) };
        })
        .filter((r) => r.progress > 0 || (r.task.day && keys.includes(r.task.day)))
        .sort((a, b) => b.ratio - a.ratio),
    [tasks, taskProgress, keys, range, today],
  );

  const negativeHabits = useMemo(() => comparison.filter((c) => c.habit.kind === "negative"), [comparison]);
  const negativeOccurrences = useMemo(
    () => negativeHabits.reduce((a, c) => a + c.occurrences, 0),
    [negativeHabits],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Progress</p>
          <h1 className="mt-1 text-3xl font-bold">Rate my day — history</h1>
          <p className="mt-1.5 max-w-2xl text-sm" style={{ color: "var(--fg-muted)" }}>
            Every day is scored out of 10, so these numbers describe how well you performed rather than how
            much you have accumulated.
          </p>
        </div>
        <Segmented ariaLabel="Select statistics range" value={range} onChange={setRange} options={RANGES} size="sm" />
      </header>

      {habitCount === 0 ? (
        <div className="card">
          <EmptyState
            icon="📊"
            title="No analytics yet"
            message="Add a habit and record an occurrence — your first rating unlocks every chart on this page."
          />
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-labelledby="overall">
        <h2 id="overall" className="sr-only">
          Overall statistics
        </h2>
        <Stat label="Average daily rating" value={`${formatRating(stats.averageRating)}/10`} sub={`Over ${stats.daysRated} rated days`} accent={ratingColor(stats.averageRating)} />
        <Stat label="Best day" value={stats.bestDay ? `${formatRating(stats.bestDay.rating)}/10` : "—"} sub={stats.bestDay ? formatShort(stats.bestDay.key) : "No data"} accent="var(--positive)" />
        <Stat label="Lowest day" value={stats.lowestDay ? `${formatRating(stats.lowestDay.rating)}/10` : "—"} sub={stats.lowestDay ? formatShort(stats.lowestDay.key) : "No data"} accent="var(--danger)" />
        <Stat label="Days rated" value={stats.daysRated} sub={`${stats.perfectDays} perfect 10/10 days`} accent="var(--primary)" />
        <Stat
          label="Task points today"
          value={`+${formatPoints(stats.todayTasks)}`}
          sub={`of ${formatPoints(stats.todayAvailable)} total available`}
          accent="var(--accent)"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="7-day average" value={`${formatRating(stats.sevenDayAverage)}/10`} accent="var(--primary)" />
        <Stat label="30-day average" value={`${formatRating(stats.thirtyDayAverage)}/10`} accent="var(--accent)" />
        <Stat label="Current streak" value={`${stats.currentStreak} days`} sub="Consecutive days rated above 0" accent="var(--warn)" />
        <Stat label="Longest streak" value={`${stats.longestStreak} days`} accent="var(--fg)" />
        <Stat
          label="Penalties in range"
          value={formatPoints(stats.totalPenalties)}
          sub={`${formatPoints(configured)} positive weight configured`}
          accent="var(--danger)"
        />
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Daily rating</p>
            <h2 className="text-lg font-semibold">Rating over time</h2>
          </div>
          <span className="chip">
            Average {formatRating(series.filter((s) => s.rated).reduce((a, s) => a + s.rating, 0) / Math.max(1, series.filter((s) => s.rated).length))}/10 in this range
          </span>
        </div>
        <LineChart data={series.map((p) => ({ key: p.key, score: p.rating, total: 10 }))} height={240} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card min-w-0 p-5">
          <p className="eyebrow">Weekly average</p>
          <h2 className="mb-3 text-lg font-semibold">Average rating per week (16 weeks)</h2>
          <BarChart data={weekly} height={210} unit="/10" />
        </div>
        <div className="card min-w-0 p-5">
          <p className="eyebrow">Monthly average</p>
          <h2 className="mb-3 text-lg font-semibold">Average rating per month (12 months)</h2>
          <BarChart data={monthly} height={210} unit="/10" />
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Yearly heatmap</p>
            <h2 className="text-lg font-semibold">The last 52 weeks</h2>
          </div>
          <span className="chip">{stats.perfectDays} perfect days</span>
        </div>
        <Heatmap weeks={buildWeeks(heat)} cellSize={13} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <p className="eyebrow">Habit consistency</p>
          <h2 className="mb-4 text-lg font-semibold">Target completion by habit</h2>
          <CompareBars
            rows={comparison.map((c) => ({
              label: c.habit.name,
              icon: c.habit.icon,
              value: c.habit.kind === "negative" ? c.occurrences : c.rate,
              color: c.habit.color,
              sub:
                c.habit.kind === "negative"
                  ? `${c.occurrences} occurrences · ${formatPoints(c.occurrences * c.habit.pointValue)} penalty`
                  : `${c.occurrences}/${c.target} occurrences · ${c.rate}% of target`,
            }))}
          />
        </div>
        <div className="flex flex-col gap-4">
          <div className="card p-5">
            <p className="eyebrow">Highlights</p>
            <h2 className="mb-3 text-lg font-semibold">What stands out</h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li className="surface p-3">
                <span className="eyebrow">Most consistent</span>
                <p className="font-semibold">
                  {bestHabit ? `${bestHabit.habit.icon} ${bestHabit.habit.name} — ${bestHabit.rate}%` : "—"}
                </p>
              </li>
              <li className="surface p-3">
                <span className="eyebrow">Needs attention</span>
                <p className="font-semibold">
                  {worstHabit ? `${worstHabit.habit.icon} ${worstHabit.habit.name} — ${worstHabit.rate}%` : "—"}
                </p>
              </li>
              <li className="surface p-3">
                <span className="eyebrow">Focus time in range</span>
                <p className="font-semibold">{formatDuration(focusRange.seconds)}</p>
              </li>
              <li className="surface p-3">
                <span className="eyebrow">Tasks completed</span>
                <p className="font-semibold">{completedTasks}</p>
              </li>
            </ul>
          </div>
          <div className="card p-5">
            <p className="eyebrow">Rating trend</p>
            <h2 className="mb-3 text-lg font-semibold">First half vs second half</h2>
            {(() => {
              const rated = series.filter((s) => s.rated);
              const half = Math.floor(rated.length / 2);
              const first = rated.slice(0, half);
              const second = rated.slice(half);
              const avg = (list: typeof rated) =>
                list.length === 0 ? 0 : list.reduce((a, s) => a + s.rating, 0) / list.length;
              const a = avg(first);
              const b = avg(second);
              const delta = b - a;
              return (
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span style={{ color: "var(--fg-muted)" }}>First half</span>
                      <span className="num font-bold">{formatRating(a)}/10</span>
                    </div>
                    <ProgressBar value={a} max={10} height={8} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span style={{ color: "var(--fg-muted)" }}>Second half</span>
                      <span className="num font-bold">{formatRating(b)}/10</span>
                    </div>
                    <ProgressBar value={b} max={10} height={8} color="var(--accent)" />
                  </div>
                  <p className="text-sm font-bold" style={{ color: delta >= 0 ? "var(--positive)" : "var(--danger)" }}>
                    {delta >= 0 ? "▲" : "▼"} {formatRating(Math.abs(delta))} {delta >= 0 ? "improvement" : "decline"}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <p className="eyebrow">Task completion</p>
          <h2 className="mb-4 text-lg font-semibold">Reward earned per task</h2>
          {taskRows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
              No tasks in this range.
            </p>
          ) : (
            <CompareBars
              rows={taskRows.map((r) => ({
                label: r.task.title,
                icon:
                  r.task.measureType === "time"
                    ? "⏱"
                    : r.task.measureType === "count"
                      ? "🔢"
                      : r.task.measureType === "quantity"
                        ? "📊"
                        : "✅",
                value: Math.round(r.ratio * 100),
                color: "var(--primary)",
                sub: `+${formatPoints(r.earned, 2)} / ${formatPoints(r.task.maxPoints, 2)} pt`,
              }))}
            />
          )}
        </div>

        <div className="card p-5">
          <p className="eyebrow">Negative behaviour frequency</p>
          <h2 className="mb-4 text-lg font-semibold">What is hurting your days</h2>
          {negativeHabits.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
              No negative habits configured — nothing is pulling your rating down.
            </p>
          ) : (
            <>
              <CompareBars
                rows={negativeHabits.map((c) => ({
                  label: c.habit.name,
                  icon: c.habit.icon,
                  value: Math.min(100, c.occurrences * 10),
                  color: "var(--danger)",
                  sub: `${c.occurrences} occurrences · −${formatPoints(c.occurrences * c.habit.pointValue)} total`,
                }))}
              />
              <p className="mt-3 text-xs" style={{ color: "var(--fg-subtle)" }}>
                {negativeOccurrences} occurrences across {negativeHabits.length} negative{" "}
                {negativeHabits.length === 1 ? "habit" : "habits"} in this range.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="card p-5">
        <SectionHeader eyebrow="Monthly table" title="Month-by-month breakdown" />
        <div className="overflow-x-auto scrollbar-thin">
          <table className="grid-table min-w-[620px]">
            <thead>
              <tr>
                <th scope="col" className="text-left">Month</th>
                <th scope="col" className="text-left">Average rating</th>
                <th scope="col" className="text-left">Days rated</th>
                <th scope="col" className="text-left">Share of 10</th>
                <th scope="col" className="text-left" style={{ minWidth: 180 }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {monthly.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-sm" style={{ color: "var(--fg-muted)" }}>
                    No data yet.
                  </td>
                </tr>
              ) : (
                monthly
                  .slice()
                  .reverse()
                  .map((m) => (
                    <tr key={m.key}>
                      <td className="font-semibold">{monthLabel(m.key)}</td>
                      <td className="num">{formatRating(m.rating)}/10</td>
                      <td className="num" style={{ color: "var(--fg-muted)" }}>{m.days}</td>
                      <td className="num">{formatPercent(ratio(m.rating, 10))}</td>
                      <td>
                        <ProgressBar value={m.rating} max={10} height={7} />
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
