"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Segmented, Stat, useToast } from "@/components/ui";
import { BarChart } from "@/components/charts";
import { useWorkspace } from "@/components/workspace";
import { formatDuration, addDays, rangeKeys, startOfMonth } from "@/lib/dates";
import { formatPoints } from "@/lib/format";
import { focusTotals } from "@/lib/stats";
import { contribution, formatMinutes } from "@/lib/tasks";
import { taskProgressFor } from "@/lib/stats";

type Mode = "focus" | "short_break" | "long_break";

const MODE_META: Record<Mode, { label: string; color: string; hint: string }> = {
  focus: { label: "Focus", color: "var(--primary)", hint: "Deep work block — no tabs, no phone." },
  short_break: { label: "Short break", color: "var(--positive)", hint: "Stand up, stretch, look away from the screen." },
  long_break: { label: "Long break", color: "var(--accent)", hint: "Step away properly — you earned it." },
};

export function TimerView() {
  const { habits, tasks, focus, settings, taskProgress, today, logFocus, saveSettings } =
    useWorkspace();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>("focus");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(settings.focusMinutes * 60);
  const [completedFocus, setCompletedFocus] = useState(0);
  const [habitId, setHabitId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [draft, setDraft] = useState({
    focusMinutes: settings.focusMinutes,
    shortBreakMinutes: settings.shortBreakMinutes,
    longBreakMinutes: settings.longBreakMinutes,
    sessionsBeforeLongBreak: settings.sessionsBeforeLongBreak,
  });

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalFor = useCallback(
    (m: Mode) =>
      m === "focus"
        ? draft.focusMinutes * 60
        : m === "short_break"
          ? draft.shortBreakMinutes * 60
          : draft.longBreakMinutes * 60,
    [draft],
  );

  useEffect(() => {
    if (!running) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) return 0;
        return r - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [running]);

  const finish = useCallback(
    (skipped: boolean) => {
      setRunning(false);
      if (mode === "focus" && !skipped) {
        void logFocus({
          mode: "focus",
          seconds: totalFor("focus"),
          habitId: habitId ? Number(habitId) : null,
          taskId: taskId ? Number(taskId) : null,
          day: today,
        });
        const next = completedFocus + 1;
        setCompletedFocus(next);
        toast.push(`Focus session complete · +${Math.round(totalFor("focus") / 60)}m logged`);
        const isLong = next % Math.max(2, draft.sessionsBeforeLongBreak) === 0;
        const nextMode: Mode = isLong ? "long_break" : "short_break";
        setMode(nextMode);
        setRemaining(totalFor(nextMode));
        return;
      }
      toast.push(mode === "focus" ? "Session skipped" : "Break finished — back to focus", "info");
      setMode("focus");
      setRemaining(totalFor("focus"));
    },
    [mode, totalFor, logFocus, habitId, taskId, today, completedFocus, draft.sessionsBeforeLongBreak, toast],
  );

  // Finish the block when the countdown reaches zero. Deferred so no state is
  // set synchronously inside the effect body.
  useEffect(() => {
    if (remaining !== 0 || !running) return;
    const id = setTimeout(() => finish(false), 0);
    return () => clearTimeout(id);
  }, [remaining, running, finish]);

  const todayFocus = useMemo(() => focusTotals(focus, [today]), [focus, today]);
  const monthKeys = useMemo(() => rangeKeys(startOfMonth(today), today), [today]);
  const monthFocus = useMemo(() => focusTotals(focus, monthKeys), [focus, monthKeys]);
  const allTimeFocus = useMemo(() => focusTotals(focus, focus.map((f) => f.day)), [focus]);
  const weekKeys = useMemo(() => rangeKeys(addDays(today, -6), today), [today]);
  const weekFocus = useMemo(
    () =>
      weekKeys.map((key) => {
        const t = focusTotals(focus, [key]);
        return {
          key,
          label: key.slice(5).replace("-", "/"),
          rating: Math.round(t.seconds / 60),
          total: Math.max(1, draft.focusMinutes),
          days: 1,
        };
      }),
    [weekKeys, focus, draft.focusMinutes],
  );

  const recent = useMemo(
    () => [...focus].filter((f) => f.mode === "focus" && f.completed).sort((a, b) => b.id - a.id).slice(0, 8),
    [focus],
  );

  const total = totalFor(mode);
  const progress = total === 0 ? 0 : (total - remaining) / total;
  const meta = MODE_META[mode];
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const size = 300;
  const r = (size - 20) / 2;
  const c = 2 * Math.PI * r;
  const linkedHabit = habits.find((h) => String(h.id) === habitId);
  const linkedTask = tasks.find((t) => String(t.id) === taskId);

  function changeMode(next: Mode) {
    setRunning(false);
    setMode(next);
    setRemaining(totalFor(next));
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Focus timer</p>
          <h1 className="mt-1 text-3xl font-bold">Pomodoro</h1>
          <p className="mt-1.5 max-w-2xl text-sm" style={{ color: "var(--fg-muted)" }}>
            Work in focused blocks, take deliberate breaks, and attach each session to the task or habit it
            belongs to so your analytics stay honest.
          </p>
        </div>
        <Segmented
          ariaLabel="Timer mode"
          value={mode}
          onChange={changeMode}
          options={[
            { value: "focus", label: "Focus" },
            { value: "short_break", label: "Short break" },
            { value: "long_break", label: "Long break" },
          ]}
        />
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card flex flex-col items-center gap-5 p-6">
          <div className="relative" style={{ width: size, maxWidth: "100%" }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" style={{ maxWidth: "100%" }}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth={16} />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={meta.color}
                strokeWidth={16}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - progress)}
                style={{ transition: "stroke-dashoffset .9s linear" }}
              />
            </svg>
            <div className="absolute inset-0 grid place-content-center text-center">
              <p className="eyebrow">{meta.label}</p>
              <p className="num text-[3.4rem] font-bold leading-none tabular-nums" aria-live="off">
                {clock}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
                {Math.round(total / 60)} minute {mode === "focus" ? "session" : "break"}
              </p>
            </div>
          </div>
          <p className="max-w-md text-center text-sm" style={{ color: "var(--fg-muted)" }}>
            {meta.hint}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={() => setRunning((r) => !r)}>
              {running ? "⏸ Pause" : "▶ Start"}
            </button>
            <button type="button" className="btn" onClick={() => { setRunning(false); setRemaining(total); }}>
              ↺ Reset
            </button>
            <button type="button" className="btn" onClick={() => finish(true)}>
              ⏭ Skip
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-center">
            <span className="chip">Session {completedFocus + 1} today (in view)</span>
            <span className="chip">
              Long break every {draft.sessionsBeforeLongBreak} sessions
            </span>
          </div>

          <div className="w-full max-w-md">
            <p className="eyebrow mb-2">Connect this session</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="input"
                aria-label="Link a habit"
                value={habitId}
                onChange={(e) => setHabitId(e.target.value)}
              >
                <option value="">No habit</option>
                {habits.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.icon} {h.name}
                  </option>
                ))}
              </select>
              <select
                className="input"
                aria-label="Link a task"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
              >
                <option value="">No task</option>
                {tasks
                  .filter((t) => t.status !== "completed")
                  .slice(0, 40)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.measureType === "time" ? "⏱ " : ""}
                      {t.title}
                      {t.measureType === "time"
                      ? ` — ${formatMinutes(taskProgressFor(taskProgress, t.id, today))} / ${formatMinutes(t.targetValue)}`
                      : ""}
                    </option>
                  ))}
              </select>
            </div>
            {linkedHabit || linkedTask ? (
              <div className="mt-2 text-center">
                <p className="text-xs font-semibold" style={{ color: "var(--primary)" }}>
                  Focus session → {linkedHabit ? `${linkedHabit.icon} ${linkedHabit.name}` : ""}
                  {linkedTask ? ` ${linkedTask.title}` : ""}
                </p>
                {linkedTask?.measureType === "time" ? (
                  <p className="num mt-1 text-[11px]" style={{ color: "var(--fg-muted)" }}>
                    {formatMinutes(taskProgressFor(taskProgress, linkedTask.id, today))} /{" "}
                    {formatMinutes(linkedTask.targetValue)} recorded · +
                    {formatPoints(contribution(linkedTask, taskProgressFor(taskProgress, linkedTask.id, today)), 2)} /{" "}
                    {formatPoints(linkedTask.maxPoints, 2)} pt
                    {linkedTask.measureType === "time" ? " — this session adds to it" : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="grid gap-4">
            <Stat label="Today's focus time" value={formatDuration(todayFocus.seconds)} sub={`${todayFocus.sessions} sessions completed`} accent="var(--primary)" />
            <Stat label="This week" value={formatDuration(focusTotals(focus, weekKeys).seconds)} sub={`${focusTotals(focus, weekKeys).sessions} sessions`} accent="var(--accent)" />
            <Stat label="This month" value={formatDuration(monthFocus.seconds)} sub={`${monthFocus.sessions} sessions since ${startOfMonth(today).slice(0, 7)}`} accent="var(--positive)" />
            <Stat label="All time" value={formatDuration(allTimeFocus.seconds)} sub={`${allTimeFocus.sessions} sessions logged`} accent="var(--warn)" />
          </div>

          <div className="card p-5">
            <p className="eyebrow">Timer settings</p>
            <h2 className="mb-3 text-lg font-semibold">Customise durations</h2>
            <div className="flex flex-col gap-3">
              {(
                [
                  ["focusMinutes", "Focus (min)", 1, 180],
                  ["shortBreakMinutes", "Short break (min)", 1, 60],
                  ["longBreakMinutes", "Long break (min)", 1, 90],
                  ["sessionsBeforeLongBreak", "Sessions before long break", 2, 8],
                ] as const
              ).map(([key, label, min, max]) => (
                <div key={key}>
                  <label className="field-label" htmlFor={`set-${key}`}>
                    {label}
                  </label>
                  <input
                    id={`set-${key}`}
                    type="number"
                    min={min}
                    max={max}
                    className="input"
                    value={draft[key]}
                    onChange={(e) => {
                      const v = Math.max(min, Math.min(max, Number(e.target.value) || min));
                      setDraft((d) => ({ ...d, [key]: v }));
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary mt-4 w-full"
              onClick={() => {
                void saveSettings(draft);
                setRunning(false);
                setRemaining(totalFor(mode));
                toast.push("Timer settings saved");
              }}
            >
              Save timer settings
            </button>
          </div>

          <div className="card p-5">
            <p className="eyebrow">Recent sessions</p>
            <h2 className="mb-3 text-lg font-semibold">History</h2>
            {recent.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
                No sessions logged yet. Start your first focus block above.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recent.map((s) => {
                  const habit = habits.find((h) => h.id === s.habitId);
                  return (
                    <li key={s.id} className="surface flex items-center justify-between gap-2 p-2.5">
                      <span className="min-w-0">
                        <span className="num block text-sm font-bold">{formatDuration(s.seconds)}</span>
                        <span className="block text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                          {s.day}
                          {habit ? ` · ${habit.icon} ${habit.name}` : ""}
                        </span>
                      </span>
                      <span className="chip">{s.mode === "focus" ? "focus" : s.mode}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </section>

      <section className="card p-5">
        <p className="eyebrow">Focus minutes</p>
        <h2 className="mb-3 text-lg font-semibold">Last 7 days</h2>
        <BarChart data={weekFocus} height={180} unit="min" />
      </section>
    </div>
  );
}
