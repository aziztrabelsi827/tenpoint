import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ipKey, rateLimit } from "@/lib/rate-limit";

/**
 * The rate limiter keeps an in-process fixed-window counter per key. We use
 * fake timers so window expiry is deterministic without sleeping.
 */
describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the configured limit within a window", () => {
    const key = "login:1.2.3.4";
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
  });

  it("rejects requests beyond the configured limit", () => {
    const key = "login:8.8.8.8";
    rateLimit(key, 2, 60_000);
    rateLimit(key, 2, 60_000);
    expect(rateLimit(key, 2, 60_000)).toBe(false);
    expect(rateLimit(key, 2, 60_000)).toBe(false);
  });

  it("resets the counter once the window has elapsed", () => {
    const key = "signup:4.4.4.4";
    rateLimit(key, 1, 60_000);
    expect(rateLimit(key, 1, 60_000)).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(rateLimit(key, 1, 60_000)).toBe(true);
  });

  it("keeps independent counters per key", () => {
    const a = "login:a";
    const b = "login:b";
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000)).toBe(false);
    // A different key is unaffected.
    expect(rateLimit(b, 1, 60_000)).toBe(true);
  });

  it("evicts an expired bucket and starts a fresh window", () => {
    const key = "reset:9.9.9.9";
    rateLimit(key, 1, 1_000);
    vi.advanceTimersByTime(1_001);
    expect(rateLimit(key, 1, 1_000)).toBe(true);
  });
});

describe("ipKey", () => {
  it("uses the first forwarded address when present", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(ipKey(headers, "login")).toBe("login:1.2.3.4");
  });

  it("falls back to x-real-ip otherwise", () => {
    const headers = new Headers({ "x-real-ip": "9.9.9.9" });
    expect(ipKey(headers, "login")).toBe("login:9.9.9.9");
  });

  it("falls back to a sentinel when no IP headers exist", () => {
    const headers = new Headers();
    expect(ipKey(headers, "login")).toBe("login:unknown");
  });
});
