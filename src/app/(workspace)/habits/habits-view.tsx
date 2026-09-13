"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HabitGrid } from "@/components/habit-grid";
import { EmptyState, ProgressBar, SectionHeader, Segmented } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { addDays, rangeKeys, startOfWeek, weekdayOf } from "@/lib/dates";
import { formatPoints, formatRating } from "@/lib/format";
import { configuredPositiveWeight, habitStats } from "@/lib/stats";

export function HabitsView() {
  const { habits, logs, MAX_HABITS, today } = useWorkspace();
  const [range, setRange] = useState<"7" | "30" | "90" | "all">("30");

  const weekDays = useMemo(() => {
    const base = startOfWeek(today);
    return rangeKeys(base, addDays(base, 6));
  }, [today]);

  // Pure calendar-key arithmetic — no Date.parse / toISOString.
  const windowKeys = useMemo(() => {
    if (range === "all") return null;
    return rangeKeys(addDays(today, -(Number(range) - 1)), today);
  }, [range, today]);

  const rows = useMemo(
    () =>
      habits.map((habit) => {
        const allTime = habitStats(habit, logs, today);
        const scoped = windowKeys ? habitStats(habit, logs, today, windowKeys[0]) : allTime;
        return { habit, allTime, scoped };
      }),
    [habits, logs, today, windowKeys],
  );

  const used = habits.length;
  const positiveWeight = configuredPositiveWeight(habits, today, weekdayOf);
  const positives = habits.filter((h) => h.enabled && h.kind === "positive");
  const negatives = habits.filter((h) => h.enabled && h.kind === "negative");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Habit system</p>
          <h1 className="mt-1 text-3xl font-bold">Rate my day</h1>
          <p className="mt-1.5 max-w-2xl text-sm" style={{ color: "var(--fg-muted)" }}>
            Positive habits add to the day&apos;s rating, negative habits subtract from it. Every habit carries
            its own weight and daily target — the rating itself is always out of 10.
          </p>
        </div>
        <div className="surface flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3">
          <div className="min-w-0">
            <p className="eyebrow">Habits</p>
            <p className="num text-xl font-bold">
              {used}
              <span style={{ color: "var(--fg-subtle)" }}>/{MAX_HABITS}</span>
            </p>
          </div>
          <div className="min-w-0">
            <p className="eyebrow">Positive weight</p>
            <p className="num text-xl font-bold" style={{ color: Math.abs(positiveWeight - 10) > 0.01 ? "var(--warn)" : "var(--positive)" }}>
              {formatPoints(positiveWeight)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="eyebrow">Penalties</p>
            <p className="num text-xl font-bold" style={{ color: negatives.length > 0 ? "var(--danger)" : "var(--fg-subtle)" }}>
              {negatives.length}
            </p>
          </div>
        </div>
      </header>

      {Math.abs(positiveWeight - 10) > 0.01 && positives.length > 0 ? (
        <div
          className="px-4 py-3 text-sm"
          style={{
            background: "color-mix(in srgb, var(--warn) 10%, var(--card))",
            border: "1px solid color-mix(in srgb, var(--warn) 30%, var(--card))",
            borderRadius: "var(--radius-sm)",
            color: "var(--fg)",
          }}
        >
          Your positive weights total <strong>{formatPoints(positiveWeight)}</strong>. Adjust them to total{" "}
          <strong>10</strong> so that completing everything gives a perfect 10/10. The rating is capped at 10
          either way, so exceeding it just means some effort goes unused.
        </div>
      ) : null}

      <section aria-labelledby="manage">
        <SectionHeader
          eyebrow="Spreadsheet"
          title="Manage &amp; record this week"
          hint="Every column is a day; every cell holds the number of occurrences completed. Reorder with the arrows, pause with ⏸, delete with ✕."
        />
        <HabitGrid weekKeys={weekDays} manage />
      </section>

      <section aria-labelledby="breakdown">
        <SectionHeader
          eyebrow="Per-habit detail"
          title="Habit breakdown"
          hint="Streaks, consistency and target completion for every habit."
          action={
            <Segmented
              ariaLabel="Select habit statistics range"
              size="sm"
              value={range}
              onChange={setRange}
              options={[
                { value: "7", label: "7d" },
                { value: "30", label: "30d" },
                { value: "90", label: "90d" },
                { value: "all", label: "All time" },
              ]}
            />
          }
        />
        {rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="🎯"
              title="No habits configured"
              message="Add a positive habit with a weight and a daily target — or a negative habit with a penalty — to start rating your day out of 10."
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ habit, allTime, scoped }) => (
              <article
                key={habit.id}
                className="card flex w-full min-w-0 max-w-full flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5"
                style={{ borderTop: `3px solid ${habit.color}` }}
              >
                <div className="flex w-full min-w-0 items-start gap-3">
                  <span
                    aria-hidden
                    className="grid h-10 w-10 shrink-0 place-items-center text-lg"
                    style={{
                      background: `color-mix(in srgb, ${habit.color} 16%, var(--card))`,
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    {habit.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/habits/${habit.slug}`} className="block break-words text-base font-semibold hover:underline">
                      {habit.name}
                    </Link>
                    <p
                      className="break-words text-[11px] font-semibold uppercase leading-snug"
                      style={{ color: habit.kind === "negative" ? "var(--danger)" : "var(--fg-subtle)" }}
                    >
                      {habit.kind === "negative" ? "− penalty" : "＋ positive"}
                      {" · "}
                      {habit.kind === "negative"
                        ? `${formatPoints(habit.pointValue)} each`
                        : `${formatPoints(habit.pointValue)} max · ${habit.targetCount}×/day`}
                      {habit.enabled ? "" : " · paused"}
                    </p>
                  </div>
                  {!habit.enabled ? <span className="chip">paused</span> : null}
                </div>
                {habit.description ? (
                  <p className="line-clamp-2 text-xs" style={{ color: "var(--fg-muted)" }}>
                    {habit.description}
                  </p>
                ) : null}
                <dl className="grid w-full min-w-0 grid-cols-3 gap-2 text-center">
                  <div className="surface min-w-0 px-1 py-2">
                    <dt className="eyebrow">Streak</dt>
                    <dd className="num text-base font-bold">{scoped.currentStreak}d</dd>
                  </div>
                  <div className="surface min-w-0 px-1 py-2">
                    <dt className="eyebrow">Best</dt>
                    <dd className="num text-base font-bold">{allTime.longestStreak}d</dd>
                  </div>
                  <div className="surface min-w-0 px-1 py-2">
                    <dt className="eyebrow">{habit.kind === "negative" ? "Occurrences" : "Target met"}</dt>
                    <dd className="num text-base font-bold break-words">
                      {habit.kind === "negative" ? scoped.totalOccurrences : `${scoped.completionRate}%`}
                    </dd>
                  </div>
                </dl>
                {habit.kind === "positive" ? (
                  <div>
                    <ProgressBar value={scoped.completionRate} max={100} color={habit.color} height={6} label={`${habit.name} target completion`} />
                    <p className="mt-1.5 flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                      <span>
                        {scoped.last30.occurrences}/{scoped.last30.target} this month
                      </span>
                      <span>{allTime.fullDays} perfect days</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                    {scoped.totalOccurrences} occurrences recorded all time ·{" "}
                    {formatPoints(scoped.totalOccurrences * habit.pointValue)} total penalty
                  </p>
                )}
                <Link href={`/habits/${habit.slug}`} className="btn btn-sm self-start max-sm:min-h-11 max-sm:px-4">
                  View analytics →
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <p className="eyebrow">Reference</p>
        <h2 className="mb-3 text-lg font-semibold">How the rating is calculated</h2>
        <ol className="flex flex-col gap-2 text-sm" style={{ color: "var(--fg-muted)" }}>
          <li>
            <strong style={{ color: "var(--fg)" }}>1.</strong> Each positive habit contributes{" "}
            <code className="num">(occurrences ÷ target) × weight</code>, capped at its weight.
          </li>
          <li>
            <strong style={{ color: "var(--fg)" }}>2.</strong> Each negative habit subtracts{" "}
            <code className="num">occurrences × penalty</code>.
          </li>
          <li>
            <strong style={{ color: "var(--fg)" }}>3.</strong> The final rating is{" "}
            <code className="num">clamp(positive − penalties, 0, 10)</code> — never above 10, never below 0.
          </li>
        </ol>
        <p className="mt-3 text-xs" style={{ color: "var(--fg-subtle)" }}>
          Example: Prayer at 2 points and 5 daily prayers is worth 0.4 per prayer, so 4 prayers earn +1.6. One
          phone-overuse occurrence at 0.5 costs −0.5.
        </p>
      </section>
    </div>
  );
}
