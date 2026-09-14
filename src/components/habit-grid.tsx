"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfirmDialog, Modal, useToast } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { WEEKDAY_MIN, WEEKDAY_SHORT, formatShort, weekdayOf } from "@/lib/dates";
import {
  formatPercent,
  formatPoints,
  formatRating,
  formatSigned,
  ratio,
  sanitizePointValue,
} from "@/lib/format";
import {
  countFor,
  habitContributionFor,
  habitKindFor,
  isScheduled,
  perOccurrenceValue,
  scoreDay,
} from "@/lib/stats";
import { effectiveTargetFor } from "@/lib/scoring";
import { WEEKDAY_TARGET_MAX, WEEKDAY_TARGET_MIN, emptyWeekdayTargets, normaliseWeekdayTargets } from "@/lib/weekday-targets";
import type { HabitDTO, HabitKind } from "@/lib/types";

export const ICON_CHOICES = [
  "🏃", "📖", "🧘", "🎓", "💧", "😴", "🕌", "💻", "✍️", "🚶",
  "🥗", "🏋️", "🎸", "🎨", "🧹", "💰", "🌱", "☀️", "📵", "🧠",
  "🙏", "🚭", "🍎", "🦷", "☎️", "🐕", "🚴", "⏰", "📝", "🎯",
];

export const COLOR_CHOICES = [
  "#2563eb", "#0ea5a4", "#16a34a", "#65a30d", "#d97706",
  "#dc2626", "#db2777", "#8b5cf6", "#0891b2", "#475569",
];

export const NEGATIVE_COLOR_CHOICES = [
  "#dc2626", "#b91c1c", "#db2777", "#9333ea", "#ea580c", "#475569",
];

export const WEIGHT_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3, 5];

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FREQ_PRESETS: { label: string; days: number[] }[] = [
  { label: "Every day", days: [] },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [0, 6] },
];

/* ---------------------------------------------------------------- */
/* Occurrence dots — the core input control                         */
/* ---------------------------------------------------------------- */

export function OccurrenceDots({
  count,
  target,
  color,
  onSelect,
  size = 26,
  maxDots = 12,
}: {
  count: number;
  target: number;
  color: string;
  onSelect: (next: number) => void;
  size?: number;
  maxDots?: number;
}) {
  const t = Math.max(1, target);

  if (t > maxDots) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn btn-sm"
          aria-label="Remove one occurrence"
          onClick={() => onSelect(Math.max(0, count - 1))}
        >
          −
        </button>
        <span className="num text-sm font-bold" style={{ color }}>
          {count}
          <span style={{ color: "var(--fg-subtle)" }}>/{t}</span>
        </span>
        <button
          type="button"
          className="btn btn-sm"
          aria-label="Add one occurrence"
          onClick={() => onSelect(Math.min(t, count + 1))}
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`${count} of ${t} occurrences completed`}>
      {Array.from({ length: t }, (_, i) => {
        const filled = i < count;
        return (
          <button
            key={i}
            type="button"
            role="checkbox"
            aria-checked={filled}
            aria-label={`Occurrence ${i + 1} of ${t}${filled ? " — completed" : ""}`}
            onClick={() => onSelect(i + 1 === count ? i : i + 1)}
            className="transition-transform duration-150 hover:scale-115"
            style={{
              width: size,
              height: size,
              borderRadius: 999,
              border: `1.5px solid ${filled ? color : "var(--line-strong)"}`,
              background: filled ? color : "transparent",
              color: filled ? "#fff" : "transparent",
              fontSize: size * 0.5,
              fontWeight: 800,
              lineHeight: 1,
              display: "grid",
              placeItems: "center",
            }}
          >
            {filled ? "✓" : ""}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Occurrence-level dots for SCHEDULED habits                        */
/*                                                                     */
/* Each dot represents one real scheduled time. Clicking it toggles    */
/* THAT occurrence, so the system knows exactly which repetition was   */
/* completed — unlike the count-based aggregate above.                 */
/* ---------------------------------------------------------------- */

export function ScheduledOccurrenceDots({
  habitId,
  day,
  times,
  color,
  count,
  target,
}: {
  habitId: number;
  day: string;
  times: string[];
  color: string;
  count: number;
  target: number;
}) {
  const { occurrences, toggleOccurrence } = useWorkspace();
  const dayOccurrences = occurrences[String(habitId)]?.[day] ?? null;

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label={`${times.length} scheduled occurrences, ${count} of ${target} completed`}
    >
      {times.map((time, idx) => {
        const occ = dayOccurrences?.[idx] ?? null;
        // Occurrence-level truth when a record exists; otherwise fall back to the
        // count-based aggregate, which cannot identify an individual occurrence.
        const done = occ ? occ.completed : idx < count && count >= target ? true : false;
        return (
          <button
            key={idx}
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={`${time}${done ? " — completed" : ""}`}
            title={`${time}${occ ? (done ? " — completed" : " — not completed") : ""}`}
            onClick={() => void toggleOccurrence(habitId, day, idx, time, !done)}
            className="num transition-transform duration-150 hover:scale-110"
            style={{
              width: 30,
              height: 26,
              borderRadius: 999,
              border: `1.5px solid ${done ? color : "var(--line-strong)"}`,
              background: done ? color : "transparent",
              color: done ? "#fff" : "var(--fg-muted)",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {time}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Spreadsheet grid                                                 */
/* ---------------------------------------------------------------- */

export function HabitGrid({
  weekKeys,
  manage = false,
}: {
  weekKeys: string[];
  manage?: boolean;
}) {
  const {
    habits, allHabits, logs, cycleHabit, setHabitCount, updateHabit, deleteHabit, moveHabit,
    MAX_HABITS, today, taskProgress, tasks,
  } = useWorkspace();
  const toast = useToast();
  const [editing, setEditing] = useState<HabitDTO | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = habits;
  const target = confirmId !== null ? habits.find((h) => h.id === confirmId) : null;
  const enabledCount = habits.filter((h) => h.enabled).length;

  const positiveWeight = habits
    .filter((h) => h.enabled && h.kind === "positive")
    .reduce((acc, h) => acc + h.pointValue, 0);

  if (rows.length === 0) {
    return (
      <>
        <div className="card p-8 text-center">
          <p className="text-lg font-semibold">No habits yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--fg-muted)" }}>
            Add positive habits that build your rating and negative habits that pull it down. Give each one a
            weight and a daily target — the day is always rated out of 10.
          </p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => setCreating(true)}>
            + Add your first habit
          </button>
        </div>
        <HabitEditor open={creating} onClose={() => setCreating(false)} habit={null} />
      </>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="grid-table min-w-[880px]">
          <caption className="sr-only">
            Weekly habit spreadsheet. Each column is a day; the value in a cell is how many occurrences of that
            habit were completed. Click a cell to advance the count.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="text-left" style={{ minWidth: 200 }}>
                Habit
              </th>
              <th scope="col" className="text-center" style={{ minWidth: 84 }}>
                Weight
              </th>
              {weekKeys.map((key) => {
                const isToday = key === today;
                return (
                  <th key={key} scope="col" className="text-center" style={{ minWidth: 62 }}>
                    <span className="block">{WEEKDAY_SHORT[weekdayOf(key)].slice(0, 2)}</span>
                    <span
                      className="num block text-[10px] font-normal"
                      style={{ color: isToday ? "var(--primary)" : "var(--fg-subtle)" }}
                    >
                      {formatShort(key).split(" ")[1]}
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="text-center" style={{ minWidth: 86 }}>
                Week
              </th>
              {manage ? (
                <th scope="col" className="text-right" style={{ minWidth: 132 }}>
                  Manage
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((habit, index) => {
              // Days the habit participated in: recorded days always count, even
              // if the habit has since been disabled or its schedule changed.
              const scheduled = weekKeys.filter(
                (k) => !!logs[String(habit.id)]?.[k] || isScheduled(habit, k, weekdayOf),
              );
              let weekContribution = 0;
              let weekTarget = 0;
              for (const k of scheduled) {
                const e = logs[String(habit.id)]?.[k];
                // Historical days read their stored snapshot.
                weekContribution += habitContributionFor(habit, logs, k, today);
                weekTarget += habitKindFor(habit, logs, k, today) === "negative"
                  ? 0
                  : Math.max(1, e?.targetCountAtRecord ?? effectiveTargetFor(habit, k, weekdayOf));
              }
              return (
                <tr key={habit.id} className={habit.enabled ? "" : "opacity-45"}>
                  <td>
                    <Link
                      href={`/habits/${habit.slug}`}
                      className="group flex items-center gap-2.5 py-0.5"
                      title={habit.description || `Open ${habit.name} analytics`}
                    >
                      <span
                        aria-hidden
                        className="grid h-7 w-7 shrink-0 place-items-center text-sm"
                        style={{
                          background: `color-mix(in srgb, ${habit.color} 16%, var(--card))`,
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        {habit.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold group-hover:underline">
                          {habit.name}
                        </span>
                        <span
                          className="block text-[11px] font-semibold uppercase"
                          style={{ color: habit.kind === "negative" ? "var(--danger)" : "var(--fg-subtle)" }}
                        >
                          {habit.kind === "negative" ? "− penalty" : "＋ positive"}
                          {habit.targetCount > 1 ? ` · ${habit.targetCount}×/day` : ""}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-center">
                    <span
                      className="num text-sm font-bold"
                      style={{ color: habit.kind === "negative" ? "var(--danger)" : habit.color }}
                      title={
                        habit.kind === "negative"
                          ? `${formatPoints(habit.pointValue)} penalty per occurrence`
                          : `Up to ${formatPoints(habit.pointValue)} toward the daily rating (${formatPoints(perOccurrenceValue(habit))} each)`
                      }
                    >
                      {habit.kind === "negative" ? "−" : "+"}
                      {formatPoints(habit.pointValue)}
                    </span>
                  </td>
                  {weekKeys.map((key) => {
                    const logEntry = logs[String(habit.id)]?.[key];
                    // A recorded log means the habit participated, regardless of
                    // the habit's current enabled state or weekday schedule.
                    const scheduledToday = !!logEntry || isScheduled(habit, key, weekdayOf);
                    const count = countFor(logs, habit.id, key);
                    const t = effectiveTargetFor(habit, key, weekdayOf);
                    const full = count >= t;
                    return (
                      <td key={key} className="text-center">
                        {scheduledToday ? (
                          <button
                            type="button"
                            onClick={() => cycleHabit(habit.id, key)}
                            aria-label={`${habit.name} on ${key}: ${count} of ${t} — click to advance`}
                            title={`${count}/${t} · ${formatSigned(
                              habitContributionFor(habit, logs, key, today),
                            )}`}
                            className="num mx-auto grid h-8 w-8 place-items-center text-xs font-bold transition-transform hover:scale-110"
                            style={{
                              borderRadius: "var(--radius-sm)",
                              border: `1px solid ${count > 0 ? habit.color : "var(--line-strong)"}`,
                              background:
                                count === 0
                                  ? "transparent"
                                  : full
                                    ? habit.color
                                    : `color-mix(in srgb, ${habit.color} 18%, var(--card))`,
                              color: full ? "#fff" : habit.color,
                            }}
                          >
                            {t === 1 ? (count > 0 ? "✓" : "") : count}
                          </button>
                        ) : (
                          <span
                            className="mx-auto block h-8 w-8 border border-dashed"
                            style={{ borderRadius: "var(--radius-sm)", borderColor: "var(--line)", opacity: 0.4 }}
                            aria-label="Not scheduled"
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="text-center">
                    <span className="num text-sm font-bold" title="Contribution this week">
                      {formatSigned(weekContribution)}
                    </span>
                    {habit.kind === "positive" ? (
                      <span className="num block text-[10px]" style={{ color: "var(--fg-subtle)" }}>
                        of {weekTarget}×
                      </span>
                    ) : null}
                  </td>
                  {manage ? (
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`Move ${habit.name} up`}
                          disabled={index === 0}
                          onClick={() => void moveHabit(habit.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`Move ${habit.name} down`}
                          disabled={index === rows.length - 1}
                          onClick={() => void moveHabit(habit.id, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={habit.enabled ? `Pause ${habit.name}` : `Resume ${habit.name}`}
                          onClick={() => {
                            void updateHabit(habit.id, { enabled: !habit.enabled });
                            toast.push(habit.enabled ? `“${habit.name}” paused` : `“${habit.name}” re-enabled`, "info");
                          }}
                        >
                          {habit.enabled ? "⏸" : "▶"}
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(habit)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => setConfirmId(habit.id)}
                          aria-label={`Delete ${habit.name}`}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="text-sm font-semibold" style={{ color: "var(--fg-muted)" }}>
                Daily rating
              </td>
              <td className="num text-center text-sm font-bold" title="Positive weight configured for today">
                {formatPoints(positiveWeight)}
              </td>
              {weekKeys.map((key) => {
                const day = scoreDay(
                  { habits: allHabits, habitLogs: logs, tasks, taskProgress, today },
                  key,
                  weekdayOf,
                );
                const rating = day.rating;
                return (
                  <td key={key} className="text-center">
                    <span
                      className="num text-sm font-bold"
                      title={`${formatPoints(day.habits)} habits + ${formatPoints(day.tasks)} tasks − ${formatPoints(day.penalties)} penalties`}
                      style={{ color: rating >= 9.95 ? "var(--positive)" : "var(--fg-muted)" }}
                    >
                      {formatRating(rating)}
                    </span>
                  </td>
                );
              })}
              <td className="text-center">
                {(() => {
                  // Shared scoring model — identical to the dashboard and calendar.
                  let sum = 0;
                  let days = 0;
                  for (const key of weekKeys) {
                    const sc = scoreDay(
                      { habits: allHabits, habitLogs: logs, tasks, taskProgress, today },
                      key,
                      weekdayOf,
                    );
                    if (sc.habitRows.some((r) => r.count > 0) || sc.tasks > 0) {
                      sum += sc.rating;
                      days += 1;
                    }
                  }
                  return (
                    <span className="num text-sm font-bold" title="Average rating this week">
                      {days === 0 ? "—" : formatRating(Math.round((sum / days) * 10) / 10)}
                      <span style={{ color: "var(--fg-subtle)" }}> /10</span>
                    </span>
                  );
                })()}
              </td>
              {manage ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-[11px]"
        style={{ borderColor: "var(--line)", color: "var(--fg-subtle)" }}
      >
        <span>
          {enabledCount} active {enabledCount === 1 ? "habit" : "habits"} · {habits.length}/{MAX_HABITS} slots ·
          positive weights total {formatPoints(positiveWeight)}
          {positiveWeight > 10
            ? ` — over-configured: the rating caps at 10 so ${formatPoints(positiveWeight - 10)} can never be used`
            : Math.abs(positiveWeight - 10) > 0.01
              ? " — aim for 10 so a full day is 10/10"
              : " — a full day is 10/10"}
        </span>
        {manage ? (
          <button type="button" className="btn btn-sm" onClick={() => setCreating(true)}>
            + Add habit
          </button>
        ) : null}
      </div>

      <HabitEditor open={creating} onClose={() => setCreating(false)} habit={null} />
      <HabitEditor open={editing !== null} onClose={() => setEditing(null)} habit={editing} />
      <ConfirmDialog
        open={confirmId !== null}
        title={`Delete “${target?.name ?? "habit"}”?`}
        message={target?.archivedAt
          ? "This habit is already archived and hidden from your workspace."
          : "If it has recorded history, it will be archived (removed from everyday lists) so your past ratings stay accurate. If it has no history, it is deleted permanently."}
        confirmLabel="Delete"
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId !== null) void deleteHabit(confirmId);
          setConfirmId(null);
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Habit editor modal                                               */
/* ---------------------------------------------------------------- */

export function HabitEditor({
  open,
  onClose,
  habit,
}: {
  open: boolean;
  habit: HabitDTO | null;
  onClose: () => void;
}) {
  const { createHabit, updateHabit, habits } = useWorkspace();
  const toast = useToast();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [color, setColor] = useState(COLOR_CHOICES[0]);
  const [description, setDescription] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>([]);
  const [kind, setKind] = useState<HabitKind>("positive");
  const [pointValue, setPointValue] = useState("2");
  const [targetCount, setTargetCount] = useState("1");
  const [weekdayTargets, setWeekdayTargets] = useState<(number | null)[]>(emptyWeekdayTargets());
  const [error, setError] = useState("");

  const initial = useMemo(
    () =>
      habit
        ? {
            name: habit.name,
            icon: habit.icon,
            color: habit.color,
            description: habit.description,
            days: habit.days,
            scheduleTimes: habit.scheduleTimes,
            kind: habit.kind,
            pointValue: String(habit.pointValue),
            targetCount: String(habit.targetCount),
            weekdayTargets: normaliseWeekdayTargets(habit.weekdayTargets),
          }
        : null,
    [habit],
  );

  const [syncKey, setSyncKey] = useState("");
  const currentKey = habit ? `${habit.id}` : "new";
  if (open && currentKey !== syncKey) {
    setSyncKey(currentKey);
    setName(initial?.name ?? "");
    setIcon(initial?.icon ?? "🎯");
    setColor(initial?.color ?? COLOR_CHOICES[0]);
    setDescription(initial?.description ?? "");
    setDays(initial?.days ?? []);
    setScheduleTimes(initial?.scheduleTimes ?? []);
    setKind(initial?.kind ?? "positive");
    setPointValue(initial?.pointValue ?? "2");
    setTargetCount(initial?.targetCount ?? "1");
    setWeekdayTargets(initial?.weekdayTargets ?? emptyWeekdayTargets());
    setError("");
  }
  if (!open && syncKey !== "") setSyncKey("");

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  const weight = sanitizePointValue(pointValue) ?? 0;
  const target = Math.max(1, Math.round(Number(targetCount) || 1));
  const positiveTotal = habits
    .filter((h) => h.enabled && h.kind === "positive" && h.id !== habit?.id)
    .reduce((acc, h) => acc + h.pointValue, 0);

  async function submit() {
    if (name.trim().length === 0) {
      setError("Give your habit a name.");
      return;
    }
    const w = sanitizePointValue(pointValue);
    if (w === null) {
      setError("Weight must be between 0.1 and 10 — decimals like 0.5 or 1.5 are fine.");
      return;
    }
    const payload = {
      name: name.trim(),
      icon,
      color,
      description,
      kind,
      pointValue: w,
      targetCount: kind === "negative" ? 1 : target,
      weekdayTargets: kind === "negative" ? undefined : normaliseWeekdayTargets(weekdayTargets),
      days: [...days].sort((a, b) => a - b),
      scheduleTimes: [...scheduleTimes].sort(),
    };
    if (habit) {
      await updateHabit(habit.id, payload);
      toast.push("Habit updated");
    } else {
      const ok = await createHabit(payload);
      if (!ok) return;
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={habit ? "Edit habit" : "New habit"}
      description={
        habit
          ? "Change its type, weight, daily target or schedule — ratings recalculate instantly."
          : "Positive habits add to the day's rating, negative habits subtract from it. Both support a daily target."
      }
      width="38rem"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()}>
            {habit ? "Save changes" : "Create habit"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Type */}
        <div>
          <span className="field-label">Type</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "positive", label: "Positive", hint: "Adds to the rating", color: "var(--positive)" },
                { id: "negative", label: "Negative", hint: "Subtracts from the rating", color: "var(--danger)" },
              ] as const
            ).map((opt) => {
              const active = kind === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setKind(opt.id);
                    setColor(opt.id === "negative" ? NEGATIVE_COLOR_CHOICES[0] : COLOR_CHOICES[0]);
                    setPointValue(opt.id === "negative" ? "0.5" : "2");
                  }}
                  aria-pressed={active}
                  className="p-3 text-left"
                  style={{
                    borderRadius: "var(--radius-sm)",
                    border: `1.5px solid ${active ? opt.color : "var(--line)"}`,
                    background: active ? `color-mix(in srgb, ${opt.color} 10%, var(--card))` : "var(--card)",
                  }}
                >
                  <span className="block text-sm font-bold" style={{ color: active ? opt.color : "var(--fg)" }}>
                    {opt.id === "positive" ? "＋" : "−"} {opt.label}
                  </span>
                  <span className="block text-[11px]" style={{ color: "var(--fg-muted)" }}>
                    {opt.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="habit-name">
            Habit name
          </label>
          <input
            id="habit-name"
            className="input"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "positive" ? "e.g. Prayer" : "e.g. Phone overuse"}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="habit-weight">
              {kind === "positive" ? "Maximum contribution (points)" : "Penalty per occurrence (points)"}
            </label>
            <input
              id="habit-weight"
              className="input num"
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              inputMode="decimal"
              value={pointValue}
              onChange={(e) => setPointValue(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="habit-target">
              {kind === "positive" ? "Target repetitions per day" : "Occurrences are unlimited"}
            </label>
            <input
              id="habit-target"
              className="input num"
              type="number"
              step="1"
              min="1"
              max="20"
              value={kind === "negative" ? "—" : targetCount}
              disabled={kind === "negative"}
              onChange={(e) => setTargetCount(e.target.value)}
            />
          </div>
        </div>

        <div className="surface p-3">
          <p className="eyebrow">How this scores</p>
          {kind === "positive" ? (
            <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
              {target} {target === 1 ? "occurrence" : "occurrences"} at {formatPoints(weight)} points ={" "}
              <strong style={{ color: "var(--positive)" }}>{formatPoints(weight / target)}</strong> each. Half
              done earns {formatPoints((weight / target) * Math.ceil(target / 2))}. All {target} done earns the
              full <strong style={{ color: "var(--positive)" }}>+{formatPoints(weight)}</strong>.
            </p>
          ) : (
            <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
              Each recorded occurrence costs{" "}
              <strong style={{ color: "var(--danger)" }}>−{formatPoints(weight)}</strong>. Three occurrences
              cost <strong style={{ color: "var(--danger)" }}>−{formatPoints(weight * 3)}</strong>. Penalties
              are subtracted from the positive total, then the rating is clamped between 0 and 10.
            </p>
          )}
          {kind === "positive" ? (
            <p className="mt-2 text-xs" style={{ color: "var(--fg-subtle)" }}>
              Positive weights across all habits currently total {formatPoints(positiveTotal + weight)}.
              {Math.abs(positiveTotal + weight - 10) > 0.01
                ? ` Add ${formatPoints(Math.max(0, 10 - positiveTotal - weight))} more elsewhere (or reduce) to make a perfect day exactly 10/10.`
                : " A perfect day is exactly 10/10."}
            </p>
          ) : null}
        </div>

        <div>
          <span className="field-label">Quick weights</span>
          <div className="flex flex-wrap gap-1.5">
            {WEIGHT_PRESETS.map((p) => {
              const active = Number(pointValue) === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPointValue(String(p))}
                  aria-pressed={active}
                  className="btn btn-sm num"
                  style={{
                    background: active ? "var(--primary)" : "var(--card)",
                    color: active ? "var(--primary-fg)" : "var(--fg-muted)",
                    borderColor: active ? "var(--primary)" : "var(--line)",
                  }}
                >
                  {kind === "negative" ? "−" : "+"}
                  {formatPoints(p)}
                </button>
              );
            })}
          </div>
        </div>

        {kind === "positive" ? (
          <div>
            <span className="field-label">Quick targets</span>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 5, 6, 8, 10].map((t) => {
                const active = Number(targetCount) === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTargetCount(String(t))}
                    aria-pressed={active}
                    className="btn btn-sm num"
                    style={{
                      background: active ? "var(--primary)" : "var(--card)",
                      color: active ? "var(--primary-fg)" : "var(--fg-muted)",
                      borderColor: active ? "var(--primary)" : "var(--line)",
                    }}
                  >
                    {t}× / day
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {kind === "positive" ? (
          <div>
            <span className="field-label">
              Per-weekday targets <span style={{ color: "var(--fg-subtle)" }}>(optional)</span>
            </span>
            <p className="mb-2 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
              Override the daily target for specific weekdays. Blank uses the{" "}
              {targetCount}×/day global target on that day.
            </p>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_LABELS.map((label, idx) => (
                <div key={label} className="flex flex-col gap-1">
                  <span
                    className="text-center text-[10px] font-semibold uppercase"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    {label.slice(0, 2)}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={WEEKDAY_TARGET_MIN}
                    max={WEEKDAY_TARGET_MAX}
                    placeholder={String(target)}
                    aria-label={`Target on ${label}`}
                    className="input num"
                    style={{ padding: "0.25rem 0", textAlign: "center" }}
                    value={weekdayTargets[idx] ?? ""}
                    onChange={(e) =>
                      setWeekdayTargets((prev) => {
                        const v = e.target.value;
                        const n = v === "" ? null : Math.max(WEEKDAY_TARGET_MIN, Math.min(WEEKDAY_TARGET_MAX, Math.round(Number(v) || 0)));
                        const next = [...prev];
                        next[idx] = n;
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <label className="field-label" htmlFor="habit-desc">
            Description <span style={{ color: "var(--fg-subtle)" }}>(optional)</span>
          </label>
          <input
            id="habit-desc"
            className="input"
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What counts as one occurrence?"
          />
        </div>

        <div>
          <span className="field-label">Icon</span>
          <div className="flex max-h-[92px] flex-wrap gap-1.5 overflow-y-auto scrollbar-thin">
            {ICON_CHOICES.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                aria-pressed={icon === i}
                className="grid h-9 w-9 place-items-center text-base transition-transform hover:scale-110"
                style={{
                  background: icon === i ? "var(--primary)" : "var(--bg-subtle)",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${icon === i ? "var(--primary)" : "var(--line)"}`,
                }}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">{kind === "negative" ? "Penalty colour" : "Accent colour"}</span>
          <div className="flex flex-wrap gap-1.5">
            {(kind === "negative" ? NEGATIVE_COLOR_CHOICES : COLOR_CHOICES).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Use colour ${c}`}
                aria-pressed={color === c}
                className="h-8 w-8 transition-transform hover:scale-110"
                style={{
                  background: c,
                  borderRadius: "var(--radius-sm)",
                  outline: color === c ? "2px solid var(--fg)" : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Frequency</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {FREQ_PRESETS.map((p) => {
              const active =
                p.days.length === 0
                  ? days.length === 0
                  : p.days.length === days.length && p.days.every((d) => days.includes(d));
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setDays(p.days)}
                  aria-pressed={active}
                  className="btn btn-sm"
                  style={{
                    background: active ? "var(--primary)" : "var(--card)",
                    color: active ? "var(--primary-fg)" : "var(--fg-muted)",
                    borderColor: active ? "var(--primary)" : "var(--line)",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, idx) => {
              const active = days.includes(idx);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  aria-pressed={active}
                  className="btn btn-sm"
                  style={{
                    background: active ? "var(--primary)" : "var(--card)",
                    color: active ? "var(--primary-fg)" : "var(--fg-muted)",
                    borderColor: active ? "var(--primary)" : "var(--line)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
            {days.length === 0
              ? "Scheduled every day."
              : `Custom schedule — ${days.length} ${days.length === 1 ? "day" : "days"} per week. Other days are skipped.`}
          </p>
        </div>

        <div>
          <span className="field-label">
            Calendar times <span style={{ color: "var(--fg-subtle)" }}>(optional)</span>
          </span>
          <p className="mb-2 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
            Add times to place this habit on the calendar as scheduled blocks. Leave empty to track it without
            calendar blocks.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {scheduleTimes.map((t, i) => (
              <span key={i} className="chip num">
                {t}
                <button
                  type="button"
                  onClick={() => setScheduleTimes((prev) => prev.filter((x) => x !== t))}
                  aria-label={`Remove ${t}`}
                  style={{ color: "var(--danger)", fontWeight: 800 }}
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              type="time"
              step={900}
              className="input"
              style={{ width: "7.5rem" }}
              aria-label="Add a calendar time"
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setScheduleTimes((prev) => (prev.includes(v) ? prev : [...prev, v].sort()));
                e.target.value = "";
              }}
            />
          </div>
          {scheduleTimes.length > 0 ? (
            <p className="mt-1.5 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
              {scheduleTimes.length} calendar {scheduleTimes.length === 1 ? "block" : "blocks"} per day.
            </p>
          ) : null}
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

export { formatPoints, formatPercent, formatRating, formatSigned, ratio };
