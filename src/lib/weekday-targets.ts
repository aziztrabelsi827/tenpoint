/**
 * Per-weekday habit target overrides.
 *
 * A habit normally has ONE global daily target (`target_count`). A user can
 * instead override the target per weekday, so e.g. "exercise" can demand 3
 * reps on weekdays and rest on any weekday with the usual frequency field.
 *
 * Representation: `(number | null)[]`, ALWAYS length 7, indexed by weekday
 * 0 = Sunday .. 6 = Saturday — the same order as `WEEKDAY_SHORT` and the
 * database's `extract(dow ...)`. A `null` entry means "use the habit's global
 * `targetCount` on that weekday". Values are whole numbers 1..20; 0 is
 * deliberately disallowed — a day the habit does not run is expressed with the
 * `days` frequency field, not a zero target.
 *
 * Persisted on `habits.weekday_targets` as JSON text of length 7.
 */

export const WEEKDAY_TARGET_MIN = 1;
export const WEEKDAY_TARGET_MAX = 20;
export const WEEKDAY_COUNT = 7;

export function emptyWeekdayTargets(): (number | null)[] {
  return Array(WEEKDAY_COUNT).fill(null);
}

/** Validates/clamps one editor value. Blank (NULL/""/NaN) becomes `null`. */
export function cleanWeekdayTarget(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(WEEKDAY_TARGET_MIN, Math.min(WEEKDAY_TARGET_MAX, Math.round(n)));
}

/** Normalises arbitrary input to the canonical length-7 form. */
export function normaliseWeekdayTargets(input: unknown): (number | null)[] {
  const out = emptyWeekdayTargets();
  if (Array.isArray(input)) {
    for (let i = 0; i < WEEKDAY_COUNT && i < input.length; i += 1) {
      out[i] = cleanWeekdayTarget(input[i]);
    }
  }
  return out;
}

/** Reads the persisted JSON text form. */
export function parseWeekdayTargets(raw: string | null | undefined): (number | null)[] {
  if (!raw) return emptyWeekdayTargets();
  try {
    return normaliseWeekdayTargets(JSON.parse(raw));
  } catch {
    return emptyWeekdayTargets();
  }
}

/** Serialises the length-7 form for `habits.weekday_targets`. */
export function serialiseWeekdayTargets(targets: (number | null)[] | undefined): string {
  return JSON.stringify(normaliseWeekdayTargets(targets));
}

/** Effective daily target for every weekday index 0(Sun)..6(Sat). */
export function weekdayEffectiveTargets(
  globalTarget: number,
  weekdayTargets: (number | null)[],
): number[] {
  const base = Math.max(WEEKDAY_TARGET_MIN, Math.round(globalTarget) || WEEKDAY_TARGET_MIN);
  const out: number[] = [];
  for (let wd = 0; wd < WEEKDAY_COUNT; wd += 1) {
    const override = weekdayTargets[wd];
    out.push(
      override !== null && override >= WEEKDAY_TARGET_MIN
        ? Math.min(WEEKDAY_TARGET_MAX, Math.round(override))
        : base,
    );
  }
  return out;
}