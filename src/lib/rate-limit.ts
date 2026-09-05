import "server-only";

type Bucket = { count: number; resetAt: number };

/**
 * Lightweight in-process rate limiter.
 *
 * Protects sensitive endpoints (login, signup, forgot/reset password) from
 * brute force and abuse using a fixed-window counter per key (e.g. IP).
 *
 * NOTE: In-process memory is correct for a single instance / dev. For a
 * horizontally-scaled production deployment this MUST be backed by a shared
 * store (Redis) — see README "Rate limiting". Keep the interface identical so
 * the backing store can be swapped without touching callers.
 */
const WINDOW_MS = 60_000;
const store = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs = WINDOW_MS): boolean {
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Keys for the common sensitive endpoints. */
export function ipKey(headers: Headers, prefix: string): string {
  // Prefer the leftmost entry of X-Forwarded-For, falling back through
  // X-Real-IP to a sentinel. Use `||` (not `??`) so an empty header string
  // still falls through instead of collapsing the key to an empty value.
  const forwarded = headers.get("x-forwarded-for")?.trim() ?? "";
  const first = forwarded.split(",")[0]?.trim() || "";
  const ip = first || headers.get("x-real-ip")?.trim() || "unknown";
  return `${prefix}:${ip}`;
}

// Keep the map from growing unboundedly by evicting expired buckets lazily.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
}, WINDOW_MS).unref?.();
