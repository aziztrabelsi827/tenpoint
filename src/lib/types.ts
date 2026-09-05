export type TaskStatus = "todo" | "in_progress" | "completed" | "archived";
export type TaskPriority = "low" | "medium" | "high";
export type HabitKind = "positive" | "negative";

/**
 * How progress on a task is measured. The measurement determines how the
 * target and actual progress are entered and displayed, but the reward maths
 * is identical for all four: (progress / target) x maxPoints, capped.
 */
export type TaskMeasureType = "time" | "quantity" | "count" | "completion";

export const TASK_MEASURE_TYPES: { id: TaskMeasureType; label: string; hint: string }[] = [
  { id: "time", label: "Time", hint: "Hours and minutes — the focus timer can feed it" },
  { id: "quantity", label: "Quantity", hint: "A measurable amount, e.g. pages or km" },
  { id: "count", label: "Count", hint: "A number of repetitions, e.g. push-ups" },
  { id: "completion", label: "Completion", hint: "All or nothing" },
];

/** Upper bound on the fixed reward a single task can add to the daily rating. */
export const TASK_MAX_POINTS = 10;
export const TASK_PROGRESS_LIMIT = 1_000_000;

/** Upper bound on stored habits — a guard against runaway lists, not a product limit. */
export const HABIT_LIMIT = 60;

export const POINT_MIN = 0.1;
export const POINT_MAX = 10;

/** The daily rating is always expressed on a fixed 0–10 scale. */
export const RATING_MAX = 10;

export type HabitDTO = {
  id: number;
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
  kind: HabitKind;
  /**
   * Weight on the daily rating.
   * Positive habit — the maximum contribution when every occurrence is done.
   * Negative habit — the penalty subtracted per recorded occurrence.
   */
  pointValue: number;
  /** Target occurrences per day, e.g. 5 prayers or 3 exercise sessions. */
  targetCount: number;
  days: number[];
  /** "HH:MM" times when this habit is scheduled on the calendar. */
  scheduleTimes: string[];
  sortOrder: number;
  enabled: boolean;
};

export type TaskDTO = {
  id: number;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  /** How progress is measured. */
  measureType: TaskMeasureType;
  /** What the user intends to accomplish, in the task's own unit. CONFIGURATION. */
  targetValue: number;
  /** Free-text unit label for quantity/count tasks. */
  unit: string;
  /** The FIXED maximum reward this task can add to the daily rating. CONFIGURATION. */
  maxPoints: number;
  /** The calendar day this task is scheduled for. */
  day: string | null;
  startTime: string | null;
  endTime: string | null;
  habitId: number | null;
  createdAt: string;
  completedAt: string | null;
};

export type EventDTO = {
  id: number;
  title: string;
  kind: string;
  day: string;
  startTime: string;
  endTime: string;
  notes: string;
  location: string;
  color: string;
};

export type FocusDTO = {
  id: number;
  mode: "focus" | "short_break" | "long_break";
  seconds: number;
  completed: boolean;
  habitId: number | null;
  taskId: number | null;
  day: string;
  /** ISO timestamp of when the session actually started, if known. */
  startedAt: string | null;
};

export type SettingsDTO = {
  theme: string;
  /** IANA timezone — the single source of truth for the user's "today". */
  timezone: string;
  customPrimary: string;
  customAccent: string;
  customBackground: string;
  customCard: string;
  customRadius: number;
  customMode: "light" | "dark";
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLongBreak: number;
};

/** One habit's record on one calendar day. */
export type HabitLogEntry = {
  /** Occurrences completed that day. */
  count: number;
  /**
   * Snapshot of the signed contribution this day made to the daily rating,
   * captured when the day was recorded. Positive habits store a positive
   * number, negative habits a negative one. Historical ratings read this
   * rather than recomputing from current configuration.
   */
  points: number;
  /**
   * Configuration captured when this day was first recorded. NULL on legacy
   * rows created before snapshots existed. Historical display and re-scoring
   * use these instead of the habit's current configuration.
   */
  pointValueAtRecord?: number | null;
  targetCountAtRecord?: number | null;
  kindAtRecord?: HabitKind | null;
};

/** habitId -> day -> record */
export type HabitLogMap = Record<string, Record<string, HabitLogEntry>>;

/** One scheduled occurrence of a habit on a day. */
export type OccurrenceDTO = {
  id: number;
  habitId: number;
  day: string;
  occurrenceIndex: number;
  scheduledTime: string;
  completed: boolean;
};

/**
 * habitId -> day -> occurrenceIndex -> record.
 * Sparse: only days that have occurrence-level data appear here. Days absent
 * from this map fall back to the count-based aggregate habit log.
 */
export type OccurrenceMap = Record<string, Record<string, Record<number, OccurrenceDTO>>>

/** One task's progress on one calendar day. */
export type TaskProgressEntry = {
  progress: number;
  /** Snapshot of the reward earned that day. */
  points: number;
  /**
   * Task configuration captured when this day was first recorded (WRITE-ONCE).
   * NULL on legacy rows. The UI only needs these when displaying what target
   * / reward actually applied to a given day; scoring always uses `points`.
   */
  targetValueAtRecord?: number | null;
  maxPointsAtRecord?: number | null;
  measureTypeAtRecord?: TaskMeasureType | null;
  unitAtRecord?: string | null;
};

/** taskId -> day -> record */
export type TaskProgressMap = Record<string, Record<string, TaskProgressEntry>>;

export type WorkspaceDTO = {
  habits: HabitDTO[];
  logs: HabitLogMap;
  /** Occurrence-level habit records; sparse (only where they exist). */
  occurrences: OccurrenceMap;
  tasks: TaskDTO[];
  taskProgress: TaskProgressMap;
  events: EventDTO[];
  focus: FocusDTO[];
  settings: SettingsDTO;
  /** The user's local calendar date at load time. */
  today: string;
};
