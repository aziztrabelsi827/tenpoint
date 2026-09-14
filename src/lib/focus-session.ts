/**
 * Pure countdown math for the persisted focus-session lifecycle.
 *
 * The invariant this is built around: the server (and any tab) can reconstruct
 * the exact remaining time from two numbers — the ABSOLUTE `endsAt` instant
 * (running) or the frozen `remainingSeconds` (paused) — plus the wall clock.
 * Nothing is ever derived from how many ticks the browser fired, so sleep,
 * backgrounding, and page restores stay exact.
 */

export const MAX_SESSION_SECONDS = 60 * 180;

export function clampPlannedSeconds(seconds: number): number {
  const n = Number.isFinite(seconds) ? Math.round(seconds) : 0;
  return Math.max(1, Math.min(MAX_SESSION_SECONDS, n));
}

/** Whole seconds left before `endsAt`, from the wall clock (`nowMs`). */
export function runningRemainingSeconds(endsAt: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - nowMs) / 1000));
}

/**
 * Freezing a RUNNING session: `ceil((endsAt - now) / 1000)`, clamped to the
 * planned length (defensive — a session can never have more than it was set for).
 * Returns `{ kind: "expired" }` when nothing is left, so callers finalize
 * instead of persisting a 0-second paused row.
 */
export function pauseSeconds(
  endsAt: string,
  nowMs: number,
  plannedSeconds: number,
): { kind: "paused"; seconds: number } | { kind: "expired" } {
  const remaining = Math.min(runningRemainingSeconds(endsAt, nowMs), plannedSeconds);
  if (remaining <= 0) return { kind: "expired" };
  return { kind: "paused", seconds: remaining };
}

/** Resuming a PAUSED session pins a fresh absolute end: now + remainingSeconds. */
export function resumeEndsAt(remainingSeconds: number, nowMs: number): string {
  return new Date(nowMs + remainingSeconds * 1000).toISOString();
}

/** A completed-but-never-paused-to-zero session ends at its planned length. */
export function plannedEnd(plannedSeconds: number, startedAt: string): string {
  return new Date(Date.parse(startedAt) + plannedSeconds * 1000).toISOString();
}