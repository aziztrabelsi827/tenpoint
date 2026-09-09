"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog, EmptyState, Modal, ProgressBar, Segmented, Stat, useToast } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { formatShort, weekdayOf } from "@/lib/dates";
import { formatPercent, formatPoints, ratio } from "@/lib/format";
import {
  completionRatio,
  formatMinutes,
  formatTaskProgressOverTarget,
  formatTaskTarget,
  parseMinutes,
  ratioFor,
  sanitizeMaxPoints,
  taskTarget,
} from "@/lib/tasks";
import { taskContributionFor, taskProgressFor } from "@/lib/stats";
import {
  TASK_MEASURE_TYPES,
  type TaskDTO,
  type TaskMeasureType,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";

type Filter = "today" | "upcoming" | "all" | "completed" | "overdue";

/** Editor payload: task configuration plus progress for an explicit day. */
export type TaskSubmitPayload = Partial<Omit<TaskDTO, "createdAt" | "completedAt">> & {
  progress?: number;
  progressDay?: string | null;
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_STYLE: Record<TaskStatus, { color: string; bg: string }> = {
  todo: { color: "var(--fg-muted)", bg: "var(--bg-subtle)" },
  in_progress: { color: "var(--primary)", bg: "color-mix(in srgb, var(--primary) 12%, var(--card))" },
  completed: { color: "var(--positive)", bg: "color-mix(in srgb, var(--positive) 12%, var(--card))" },
  archived: { color: "var(--fg-subtle)", bg: "var(--bg-subtle)" },
};

const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Low", medium: "Medium", high: "High" };
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "var(--fg-subtle)",
  medium: "var(--warn)",
  high: "var(--danger)",
};

const CATEGORIES = ["General", "Work", "Personal", "Health", "Learning", "Home", "Finance"];

export function TasksView() {
  const {
    tasks, habits, taskProgress, today,
    createTask, updateTask, setTaskProgress, deleteTask,
  } = useWorkspace();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>("today");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (filter === "today")
      list = list.filter((t) => t.day === today || (!t.day && taskProgressFor(taskProgress, t.id, today) > 0));
    if (filter === "upcoming") list = list.filter((t) => t.status !== "completed" && (!t.day || t.day > today));
    if (filter === "overdue") list = list.filter((t) => t.status !== "completed" && t.day && t.day < today);
    if (filter === "completed") list = list.filter((t) => t.status === "completed");
    if (filter === "all") list = list.filter((t) => t.status !== "completed" && t.status !== "archived");
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => {
      const rank: Record<TaskStatus, number> = { in_progress: 0, todo: 1, completed: 2, archived: 3 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      const pRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
      if (pRank[a.priority] !== pRank[b.priority]) return pRank[a.priority] - pRank[b.priority];
      return (a.day ?? "9999").localeCompare(b.day ?? "9999");
    });
  }, [tasks, taskProgress, filter, priorityFilter, query, today]);

  const todayTasks = tasks.filter(
    (t) => t.day === today || (!t.day && taskProgressFor(taskProgress, t.id, today) > 0),
  );
  const overdue = tasks.filter((t) => t.status !== "completed" && t.day && t.day < today).length;
  const completedAll = tasks.filter((t) => t.status === "completed").length;
  const openAll = tasks.filter((t) => t.status !== "completed" && t.status !== "archived").length;
  const todayEarned = todayTasks.reduce(
    (a, t) => a + taskContributionFor(t, t.id, taskProgress, today, today),
    0,
  );
  const todayAvailable = todayTasks.reduce((a, t) => a + t.maxPoints, 0);

  function cycleStatus(task: TaskDTO) {
    const next: TaskStatus =
      task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "completed" : "todo";
    void updateTask(task.id, { status: next });
    if (next === "completed") toast.push("Task completed ✓");
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Tasks</p>
          <h1 className="mt-1 text-3xl font-bold">Measurable work</h1>
          <p className="mt-1.5 max-w-2xl text-sm" style={{ color: "var(--fg-muted)" }}>
            Every task carries a <strong>fixed maximum reward</strong>. Progress only decides how much of that
            existing value you have earned — time, quantity, count or plain completion.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          + New task
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Task points today"
          value={`+${formatPoints(todayEarned)}`}
          sub={`of ${formatPoints(todayAvailable)} available reward`}
          accent="var(--primary)"
        />
        <Stat
          label="Today's tasks"
          value={todayTasks.length === 0 ? "—" : `${todayTasks.filter((t) => t.status === "completed").length}/${todayTasks.length}`}
          sub={todayTasks.length === 0 ? "Nothing scheduled" : `${todayTasks.filter((t) => t.status !== "completed").length} still open`}
          accent="var(--accent)"
        />
        <Stat label="Open tasks" value={openAll} sub={`${completedAll} completed all time`} accent="var(--fg)" />
        <Stat
          label="Overdue"
          value={overdue}
          sub={overdue === 0 ? "Nothing overdue 👌" : "Reschedule or close these"}
          accent={overdue === 0 ? "var(--positive)" : "var(--danger)"}
        />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b p-4" style={{ borderColor: "var(--line)" }}>
          <Segmented
            ariaLabel="Filter tasks"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "today", label: "Today" },
              { value: "upcoming", label: "Upcoming" },
              { value: "overdue", label: "Overdue" },
              { value: "all", label: "All open" },
              { value: "completed", label: "Completed" },
            ]}
          />
          <Segmented
            ariaLabel="Filter by priority"
            size="sm"
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={[
              { value: "all", label: "Any priority" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
          />
          <div className="ml-auto w-full sm:w-56">
            <label htmlFor="task-search" className="sr-only">
              Search tasks
            </label>
            <input
              id="task-search"
              className="input"
              placeholder="Search tasks…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon="🗒"
            title="No tasks here"
            message={
              filter === "today"
                ? "Nothing scheduled for today yet. Create a task, give it a target and a maximum reward."
                : "No tasks match this filter. Try another view or create a new task."
            }
            action={
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                + New task
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="grid-table min-w-[1080px]">
              <caption className="sr-only">
                Task list with measurement type, target, progress and earned versus maximum reward
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 46 }}>Done</th>
                  <th scope="col" className="text-left">Task</th>
                  <th scope="col" className="text-left" style={{ width: 96 }}>Measure</th>
                  <th scope="col" className="text-left" style={{ width: 140 }}>Target</th>
                  <th scope="col" className="text-left" style={{ width: 210 }}>Progress</th>
                  <th scope="col" className="text-right" style={{ width: 118 }}>Reward</th>
                  <th scope="col" className="text-left" style={{ width: 96 }}>Status</th>
                  <th scope="col" className="text-left" style={{ width: 90 }}>Priority</th>
                  <th scope="col" className="text-left" style={{ width: 104 }}>Date</th>
                  <th scope="col" className="text-right" style={{ width: 106 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => {
                  const habit = habits.find((h) => h.id === task.habitId);
                  const day = task.day ?? today;
                  const progress = taskProgressFor(taskProgress, task.id, day);
                  const over = completionRatio(task, progress) > 1;
                  // Historical days read their snapshot; today computes live.
                  const earned = taskContributionFor(task, task.id, taskProgress, day, today);
                  const step = task.measureType === "time" ? 15 : 1;
                  return (
                    <tr key={task.id}>
                      <td>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={task.status === "completed"}
                          aria-label={`Mark ${task.title} ${task.status === "completed" ? "incomplete" : "complete"}`}
                          className="check-cell"
                          style={{ ["--cell-color" as string]: "var(--positive)" }}
                          onClick={() => cycleStatus(task)}
                        />
                      </td>
                      <td>
                        <span
                          className="block text-sm font-semibold"
                          style={{
                            textDecoration: task.status === "completed" ? "line-through" : "none",
                            color: task.status === "completed" ? "var(--fg-subtle)" : "var(--fg)",
                          }}
                        >
                          {task.startTime ? (
                            <span className="num mr-1.5" style={{ color: "var(--fg-muted)" }}>
                              {task.startTime}
                            </span>
                          ) : null}
                          {task.title}
                        </span>
                        <span className="block truncate text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                          {task.category}
                          {habit ? ` · ${habit.icon} ${habit.name}` : ""}
                          {task.notes ? ` · ${task.notes}` : ""}
                        </span>
                      </td>
                      <td>
                        <span className="chip">{TASK_MEASURE_TYPES.find((m) => m.id === task.measureType)?.label}</span>
                      </td>
                      <td className="num text-xs font-semibold" style={{ color: "var(--fg-muted)" }}>
                        {formatTaskTarget(task)}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-sm"
                            aria-label={`Remove progress on ${task.title}`}
                            onClick={() =>
                              void setTaskProgress(task.id, day, Math.max(0, progress - step))
                            }
                          >
                            −
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            aria-label={`Add progress on ${task.title}`}
                            onClick={() => void setTaskProgress(task.id, day, progress + step)}
                          >
                            +
                          </button>
                          <div className="min-w-0 flex-1">
                            <ProgressBar
                              value={ratioFor(task, progress) * 100}
                              max={100}
                              label={`${task.title} progress`}
                              height={7}
                              color={over ? "var(--accent)" : "var(--primary)"}
                            />
                            <span
                              className="num block truncate text-[11px]"
                              style={{ color: over ? "var(--accent)" : "var(--fg-subtle)" }}
                            >
                              {formatTaskProgressOverTarget(task, progress)}
                              {over ? ` · ${Math.round(completionRatio(task, progress) * 100)}%` : ""}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="text-right">
                        <span className="num text-sm font-bold" style={{ color: "var(--primary)" }}>
                          +{formatPoints(earned, 2)}
                        </span>
                        <span className="num block text-[10px]" style={{ color: "var(--fg-subtle)" }}>
                          / {formatPoints(task.maxPoints, 2)} pt
                        </span>
                      </td>
                      <td>
                        <span
                          className="chip"
                          style={{
                            background: STATUS_STYLE[task.status].bg,
                            color: STATUS_STYLE[task.status].color,
                            borderColor: "transparent",
                          }}
                        >
                          {STATUS_LABEL[task.status]}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: PRIORITY_COLOR[task.priority] }}>
                          <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY_COLOR[task.priority] }} />
                          {PRIORITY_LABEL[task.priority]}
                        </span>
                      </td>
                      <td>
                        <span
                          className="num text-xs font-semibold"
                          style={{
                            color: task.day && task.day < today && task.status !== "completed" ? "var(--danger)" : "var(--fg-muted)",
                          }}
                        >
                          {task.day ? formatShort(task.day) : "—"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" className="btn btn-sm" onClick={() => setEditing(task)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => setConfirmId(task.id)}
                            aria-label={`Delete ${task.title}`}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-[11px]"
          style={{ borderColor: "var(--line)", color: "var(--fg-subtle)" }}
        >
          <span>
            {filtered.length} {filtered.length === 1 ? "task" : "tasks"} shown ·{" "}
            {formatPoints(
              filtered.reduce(
                (a, t) =>
                  a + taskContributionFor(t, t.id, taskProgress, t.day ?? today, today),
                0,
              ),
            )}{" "}
            of {formatPoints(filtered.reduce((a, t) => a + t.maxPoints, 0))} reward earned
          </span>
          <span>Over-completing shows the real amount but never exceeds the configured reward.</span>
        </div>
      </section>

      <TaskEditor
        key="create"
        open={creating}
        onClose={() => setCreating(false)}
        habits={habits}
        task={null}
        defaultDay={today}
        onSubmit={async (payload) => {
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
            progressDay: payload.day ?? today,
            day: payload.day,
            startTime: payload.startTime,
            endTime: payload.endTime,
            habitId: payload.habitId,
          });
          toast.push("Task created");
        }}
      />
      <TaskEditor
        key={`edit-${editing?.id ?? "none"}`}
        open={editing !== null}
        onClose={() => setEditing(null)}
        habits={habits}
        task={editing}
        defaultDay={today}
        onSubmit={async (payload) => {
          if (!editing) return;
          await updateTask(editing.id, payload);
          toast.push("Task updated");
        }}
      />
      <ConfirmDialog
        open={confirmId !== null}
        title="Delete this task?"
        message="This removes the task and its progress permanently."
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId !== null) void deleteTask(confirmId);
          setConfirmId(null);
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Task editor                                                      */
/* ---------------------------------------------------------------- */

export function TaskEditor({
  open,
  onClose,
  habits,
  task,
  defaultDay,
  defaultStartTime,
  defaultEndTime,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  habits: { id: number; name: string; icon: string }[];
  task: TaskDTO | null;
  defaultDay: string;
  /** Prefill the start/end time for a NEW task (used by the calendar slot flow). */
  defaultStartTime?: string;
  defaultEndTime?: string;
  onSubmit: (payload: TaskSubmitPayload) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [category, setCategory] = useState("General");
  const [measureType, setMeasureType] = useState<TaskMeasureType>("time");
  const [targetValue, setTargetValue] = useState("120");
  const [unit, setUnit] = useState("");
  const [maxPoints, setMaxPoints] = useState("1");
  const [progress, setProgress] = useState("0");
  const [progressDay, setProgressDay] = useState(defaultDay);
  const workspace = useWorkspace();
  const [day, setDay] = useState(defaultDay);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [habitId, setHabitId] = useState("");
  const [error, setError] = useState("");

  const [syncKey, setSyncKey] = useState("");
  const currentKey = task
    ? `t${task.id}`
    : `n${defaultDay}-${defaultStartTime ?? ""}-${defaultEndTime ?? ""}`;
  if (open && currentKey !== syncKey) {
    setSyncKey(currentKey);
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setStatus(task?.status ?? "todo");
    setPriority(task?.priority ?? "medium");
    setCategory(task?.category ?? "General");
    setMeasureType(task?.measureType ?? "time");
    setTargetValue(String(task?.measureType === "time" ? task.targetValue : (task?.targetValue ?? 20)));
    setUnit(task?.unit ?? "");
    setMaxPoints(String(task?.maxPoints ?? 1));
    setProgress(
      String(task ? taskProgressFor(workspace.taskProgress, task.id, task?.day ?? defaultDay) : 0),
    );
    setProgressDay(task?.day ?? defaultDay);
    setDay(task?.day ?? defaultDay);
    setStartTime(task?.startTime ?? defaultStartTime ?? "");
    setEndTime(task?.endTime ?? defaultEndTime ?? "");
    setHabitId(task?.habitId ? String(task.habitId) : "");
    setError("");
  }
  if (!open && syncKey !== "") setSyncKey("");

  const isTime = measureType === "time";
  const isCompletion = measureType === "completion";
  const targetNum = Math.max(0.000001, Number(targetValue) || 1);
  const progressNum = Math.max(0, Number(progress) || 0);
  void progressDay;
  const reward = sanitizeMaxPoints(maxPoints) ?? 0;
  const earnedNow = Math.min(1, progressNum / targetNum) * reward;

  async function submit() {
    if (!title.trim()) {
      setError("Task needs a title.");
      return;
    }
    if (sanitizeMaxPoints(maxPoints) === null) {
      setError("Maximum reward must be between 0 and 10.");
      return;
    }
    if (!isCompletion && !(Number(targetValue) > 0)) {
      setError("Target must be a positive number.");
      return;
    }
    const targetForType = isCompletion ? 1 : Number(targetValue);
    const progressForType = isCompletion
      ? status === "completed"
        ? 1
        : Number(progress) > 0
          ? 1
          : 0
      : isTime
        ? parseMinutes(progress) ?? Math.max(0, Number(progress) || 0)
        : Math.max(0, Number(progress) || 0);

    await onSubmit({
      title: title.trim(),
      notes,
      status,
      priority,
      category,
      measureType,
      targetValue: targetForType,
      unit: isTime || isCompletion ? "" : unit.trim(),
      maxPoints: sanitizeMaxPoints(maxPoints) ?? 0.5,
      progress: progressForType,
      progressDay: day || null,
      day: day || null,
      startTime: startTime || null,
      endTime: endTime || null,
      habitId: habitId ? Number(habitId) : null,
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? "Edit task" : "New task"}
      description="Choose how progress is measured and set a fixed maximum reward — progress never raises that maximum."
      width="40rem"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()}>
            {task ? "Save task" : "Create task"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="field-label" htmlFor="task-title">
            Title
          </label>
          <input
            id="task-title"
            className="input"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Study mathematics"
          />
        </div>

        <div>
          <span className="field-label">How is progress measured?</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {TASK_MEASURE_TYPES.map((m) => {
              const active = measureType === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMeasureType(m.id);
                    setTargetValue(m.id === "time" ? "120" : m.id === "completion" ? "1" : "20");
                    setProgress("0");
                    setMaxPoints(m.id === "completion" ? "0.5" : "1");
                  }}
                  aria-pressed={active}
                  className="p-2.5 text-left"
                  style={{
                    borderRadius: "var(--radius-sm)",
                    border: `1.5px solid ${active ? "var(--primary)" : "var(--line)"}`,
                    background: active ? "color-mix(in srgb, var(--primary) 9%, var(--card))" : "var(--card)",
                  }}
                >
                  <span className="block text-sm font-bold" style={{ color: active ? "var(--primary)" : "var(--fg)" }}>
                    {m.label}
                  </span>
                  <span className="block text-[11px]" style={{ color: "var(--fg-muted)" }}>
                    {m.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="field-label" htmlFor="task-target">
              {isTime ? "Target (minutes)" : isCompletion ? "Target" : "Target"}
            </label>
            <input
              id="task-target"
              className="input num"
              type="number"
              step={isTime ? 5 : 1}
              min={1}
              value={isCompletion ? "1" : targetValue}
              disabled={isCompletion}
              onChange={(e) => setTargetValue(e.target.value)}
            />
            {isTime ? (
              <p className="mt-1 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                = {formatMinutes(Number(targetValue) || 0)}
              </p>
            ) : null}
          </div>
          <div>
            <label className="field-label" htmlFor="task-unit">
              Unit{" "}
              {isTime || isCompletion ? (
                <span style={{ color: "var(--fg-subtle)" }}>(n/a)</span>
              ) : null}
            </label>
            <input
              id="task-unit"
              className="input"
              value={isTime || isCompletion ? "" : unit}
              disabled={isTime || isCompletion}
              maxLength={20}
              placeholder={measureType === "count" ? "reps" : "pages"}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="task-max-points">
              Maximum reward (pts)
            </label>
            <input
              id="task-max-points"
              className="input num"
              type="number"
              step="0.25"
              min="0"
              max="10"
              inputMode="decimal"
              value={maxPoints}
              onChange={(e) => setMaxPoints(e.target.value)}
            />
            <p className="mt-1 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
              Fixed — never grows with progress
            </p>
          </div>
        </div>

        <div className="surface p-3">
          <p className="eyebrow">How this scores</p>
          <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
            {isCompletion ? (
              <>
                All or nothing: <strong style={{ color: "var(--primary)" }}>+{formatPoints(reward)}</strong> when
                done, otherwise 0.
              </>
            ) : (
              <>
                <strong style={{ color: "var(--fg)" }}>
                  {isTime ? formatMinutes(targetNum) : `${formatPoints(targetNum, 2)} ${unit || "units"}`}
                </strong>{" "}
                earns the full <strong style={{ color: "var(--primary)" }}>+{formatPoints(reward)}</strong>. Half
                way earns +{formatPoints(reward / 2, 2)}. Over-completing shows the real amount but still credits
                only +{formatPoints(reward)}.
              </>
            )}
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="task-progress">
            {isTime ? "Progress so far (e.g. 1h 20m or 80)" : isCompletion ? "Progress" : `Progress (${unit || "units"})`}
          </label>
          <input
            id="task-progress"
            className="input num"
            value={isCompletion ? (progressNum > 0 || status === "completed" ? "1" : "0") : progress}
            disabled={isCompletion}
            placeholder={isTime ? "1h 20m" : "0"}
            onChange={(e) => setProgress(e.target.value)}
          />
          {!isCompletion ? (
            <p className="mt-1 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
              {isTime ? formatMinutes(parseMinutes(progress) ?? 0) : `${formatPoints(progressNum, 2)} ${unit || "units"}`} of{" "}
              {isTime ? formatMinutes(targetNum) : formatPoints(targetNum, 2)} ·{" "}
              {formatPercent(ratio(Math.min(1, progressNum / targetNum), 1))} · +
              {formatPoints(earnedNow, 2)} / {formatPoints(reward, 2)} pt
            </p>
          ) : null}
        </div>

        <div>
          <label className="field-label" htmlFor="task-notes">
            Notes
          </label>
          <textarea
            id="task-notes"
            className="input"
            rows={2}
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Context, links, next actions…"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="field-label" htmlFor="task-status">
              Status
            </label>
            <select id="task-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="task-priority">
              Priority
            </label>
            <select id="task-priority" className="input" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="task-day">
              Date
            </label>
            <input id="task-day" type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="task-category">
              Category
            </label>
            <select id="task-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="task-start">
              Start time
            </label>
            <input id="task-start" type="time" step={900} className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="task-end">
              End time
            </label>
            <input id="task-end" type="time" step={900} className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="task-habit">
            Link to habit <span style={{ color: "var(--fg-subtle)" }}>(optional)</span>
          </label>
          <select id="task-habit" className="input" value={habitId} onChange={(e) => setHabitId(e.target.value)}>
            <option value="">No habit</option>
            {habits.map((h) => (
              <option key={h.id} value={h.id}>
                {h.icon} {h.name}
              </option>
            ))}
          </select>
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

export { formatTaskProgressOverTarget, taskTarget };
