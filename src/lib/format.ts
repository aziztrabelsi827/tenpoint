import { POINT_MAX, POINT_MIN, RATING_MAX } from "@/lib/types";

/** Renders a point total without trailing zeros: 3.5, 10, 0.5, 77.8 */
export function formatPoints(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(decimals).replace(/0$/, "");
}

/** Renders a 0–10 daily rating: 10, 8.1, 7.5, 0 */
export function formatRating(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  if (rounded <= 0) return "0";
  if (rounded >= RATING_MAX) return String(RATING_MAX);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(1);
}

export function formatSigned(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const rounded = Math.round(value * 100) / 100;
  const text = formatPoints(Math.abs(rounded), 2);
  return `${rounded < 0 ? "−" : "+"}${text}`;
}

/** Percentage with a single decimal only when it is meaningful: 78% / 77.8% */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "0%";
  const pct = ratio * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded}%`;
  return `${rounded.toFixed(1)}%`;
}

export function ratio(score: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(1, score / total));
}

/** Clamps + rounds a habit weight to something safe to store. */
export function sanitizePointValue(input: unknown): number | null {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded < POINT_MIN || rounded > POINT_MAX) return null;
  return rounded;
}

/** Rounds a sum of decimals so 0.1 + 0.2 === 0.3 when compared or displayed. */
export function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(RATING_MAX, Math.round(value * 10) / 10));
}

/** Contextual verdict for a 0–10 daily rating. */
export function ratingLabel(rating: number): string {
  const r = Math.round(rating * 10) / 10;
  if (r >= 9.95) return "Perfect day";
  if (r >= 9) return "Excellent day";
  if (r >= 8) return "Great day";
  if (r >= 7) return "Good day";
  if (r >= 5.5) return "Decent day";
  if (r >= 4) return "Average day";
  if (r >= 2.5) return "Rough day";
  if (r >= 1) return "Tough day";
  return "Difficult day";
}

export function ratingMessage(rating: number): string {
  const r = Math.round(rating * 10) / 10;
  if (r >= 9.95) return "Everything on the list, nothing off it. This is the day you build the streak with.";
  if (r >= 8) return "Strong day. One or two small things left to close out.";
  if (r >= 6.5) return "Solid. Find the single habit that would have moved this up a point.";
  if (r >= 4) return "Halfway. Pick the easiest remaining occurrence and start there.";
  if (r >= 1) return "A start is a start. One occurrence of one habit turns the day around.";
  return "Blank slate. One occurrence of one habit moves the rating off zero.";
}

export function ratingColor(rating: number): string {
  const r = Math.round(rating * 10) / 10;
  if (r >= 9) return "var(--positive)";
  if (r >= 7.5) return "var(--primary)";
  if (r >= 5) return "var(--warn)";
  return "var(--danger)";
}

/** "HH:MM" -> minutes since midnight. Returns null when unparseable. */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
