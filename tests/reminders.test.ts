import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelReminderFor,
  isReminderEligible,
  localWallClockToUtc,
  processDueReminders,
  reminderInstantFor,
  scheduleReminderFor,
  sendPushToUser,
} from "@/lib/reminders";

const webpushMock = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => ({ default: webpushMock }));

type Row = Record<string, unknown>;
type SqError = { code?: string; message: string };

type QueryInfo = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  filters: Array<[string, unknown]>;
  isVals: Array<[string, unknown]>;
  inVals: Array<[string, unknown[]]>;
  payload: Row;
  terminal: "single" | "maybeSingle" | null;
};

type Handler = (info: QueryInfo) => { data?: unknown; error?: SqError | null } | Promise<{ data?: unknown; error?: SqError | null }>;

/** Chainable fake query whose `data`/`error` getters dispatch to a handler
 *  so the queue/processing logic can be exercised without a database. */
class FakeQuery {
  private op: QueryInfo["op"] = "select";
  private filters: Array<[string, unknown]> = [];
  private isVals: Array<[string, unknown]> = [];
  private inVals: Array<[string, unknown[]]> = [];
  private payload: Row = {};
  private terminal: QueryInfo["terminal"] = null;

  constructor(
    private table: string,
    private handler: Handler | undefined,
  ) {}

  select(_cols?: unknown) {
    return this;
  }
  insert(payload: Row) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(k: string, v: unknown) {
    this.filters.push([k, v]);
    return this;
  }
  is(k: string, v: unknown) {
    this.isVals.push([k, v]);
    return this;
  }
  in(k: string, v: unknown[]) {
    this.inVals.push([k, v]);
    return this;
  }
  lte(_k?: unknown, _v?: unknown) {
    return this;
  }
  order(_s?: unknown, _o?: unknown) {
    return this;
  }
  limit(_n?: unknown) {
    return this;
  }
  maybeSingle() {
    this.terminal = "maybeSingle";
    return this;
  }
  single() {
    this.terminal = "single";
    return this;
  }

  get data() {
    return undefined;
  }
  get error() {
    return undefined;
  }

  /** The chain is thenable: `await supabase.from(...)...` resolves to the
   *  handler's { data, error } object, mirroring supabase-js. */
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.resolve().then(onfulfilled as never, onrejected as never);
  }

  private resolve(): Promise<{ data?: unknown; error?: SqError | null }> {
    if (!this.handler) {
      return Promise.resolve({ data: null, error: { code: "UNHANDLED", message: `No handler for ${this.table}` } });
    }
    return Promise.resolve(
      this.handler({
        table: this.table,
        op: this.op,
        filters: this.filters,
        isVals: this.isVals,
        inVals: this.inVals,
        payload: this.payload,
        terminal: this.terminal,
      }),
    );
  }
}

function makeSupabase(handlers: Partial<Record<string, Handler>>) {
  return { from: (table: string) => new FakeQuery(table, handlers[table]) };
}

const VAPID = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "test-public",
  VAPID_PRIVATE_KEY: "test-private",
  VAPID_SUBJECT: "mailto:test@example.com",
};

const NO_HANDLER = (): Handler => () => ({ data: null, error: null });

describe("localWallClockToUtc", () => {
  it("converts wall-clock time to an absolute instant in UTC+1 (Africa/Tunis)", () => {
    const instant = localWallClockToUtc("2026-08-28", "09:00", "Africa/Tunis");
    expect(instant?.toISOString()).toBe("2026-08-28T08:00:00.000Z");
  });

  it("converts for UTC+9 (Asia/Tokyo) and half-hour offsets (Asia/Kolkata)", () => {
    expect(localWallClockToUtc("2026-08-28", "09:00", "Asia/Tokyo")?.toISOString()).toBe("2026-08-28T00:00:00.000Z");
    expect(localWallClockToUtc("2026-08-28", "09:00", "Asia/Kolkata")?.toISOString()).toBe("2026-08-28T03:30:00.000Z");
  });

  it("always matches the instant for Etc/UTC", () => {
    expect(localWallClockToUtc("2026-08-28", "09:00", "Etc/UTC")?.toISOString()).toBe("2026-08-28T09:00:00.000Z");
  });

  it("honours DST offsets (America/New_York)", () => {
    // July: EDT (UTC-4) → 09:00 local is 13:00Z.
    expect(localWallClockToUtc("2026-07-10", "09:00", "America/New_York")?.toISOString()).toBe(
      "2026-07-10T13:00:00.000Z",
    );
    // January: EST (UTC-5) → 09:00 local is 14:00Z.
    expect(localWallClockToUtc("2026-01-10", "09:00", "America/New_York")?.toISOString()).toBe(
      "2026-01-10T14:00:00.000Z",
    );
  });

  it("round-trips the local reading after conversion", () => {
    const start = localWallClockToUtc("2026-10-25", "18:45", "Europe/Berlin");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(start!);
    const byType = new Map(parts.map((p) => [p.type, Number(p.value)]));
    expect(
      [byType.get("year"), byType.get("month"), byType.get("day"), byType.get("hour"), byType.get("minute")],
    ).toEqual([2026, 10, 25, 18, 45]);
  });

  it("maps the DST spring-forward gap forward to the first valid local reading", () => {
    // US DST starts 2026-03-08 02:00 → 03:00. Wall clock 02:30 never occurs,
    // so the instant resolves to the moment the clock reads 03:30 (07:30Z).
    expect(localWallClockToUtc("2026-03-08", "02:30", "America/New_York")?.toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });

  it("resolves ambiguous/invalid wall times to the earlier (date-fns-tz) candidate", () => {
    // US DST ends 2026-11-01 02:00 EDT → 01:00 EST (06:00Z). For the wall time
    // 02:30 the day the transition begins, the probe lands in the EDT hour and
    // the earlier candidate instant (06:30Z = 02:30 EDT) is returned, matching
    // date-fns-tz semantics for ambiguous times on the fall-back boundary.
    expect(localWallClockToUtc("2026-11-01", "02:30", "America/New_York")?.toISOString()).toBe(
      "2026-11-01T06:30:00.000Z",
    );
  });

  it("returns null for malformed input", () => {
    expect(localWallClockToUtc("2026-13-40", "09:00", "Etc/UTC")).toBeNull();
    expect(localWallClockToUtc("2026-02-30", "09:00", "Etc/UTC")).toBeNull();
    expect(localWallClockToUtc("2026-08-28", "25:00", "Etc/UTC")).toBeNull();
    expect(localWallClockToUtc("2026-08-28", "09:00", "Not/A_Real_Zone")).toBeNull();
  });
});

describe("reminderInstantFor & isReminderEligible", () => {
  it("computes the reminder instant as start minus 30 minutes", () => {
    const when = reminderInstantFor("2026-08-28", "09:00", "Africa/Tunis");
    expect(when?.toISOString()).toBe("2026-08-28T07:30:00.000Z");
  });

  it("returns null without a start time or a usable timezone", () => {
    expect(reminderInstantFor("2026-08-28", null, "Africa/Tunis")).toBeNull();
    expect(reminderInstantFor("2026-08-28", "09:00", null)).not.toBeNull();
    expect(reminderInstantFor("2026-08-28", "09:00", "garbage-zone")).toBeNull();
  });

  it("judges task eligibility by status and schedule", () => {
    expect(isReminderEligible("task", { day: "2026-08-28", startTime: "09:00" })).toBe(true);
    expect(isReminderEligible("task", { status: "in_progress", day: "2026-08-28", startTime: "09:00" })).toBe(true);
    expect(isReminderEligible("task", { status: "completed", day: "2026-08-28", startTime: "09:00" })).toBe(false);
    expect(isReminderEligible("task", { status: "archived", day: "2026-08-28", startTime: "09:00" })).toBe(false);
    expect(isReminderEligible("task", { status: "todo", day: null, startTime: "09:00" })).toBe(false);
    expect(isReminderEligible("task", null)).toBe(false);
  });

  it("judges event eligibility by presence of the row", () => {
    expect(isReminderEligible("event", { day: "2026-08-28", startTime: "09:00" })).toBe(true);
    expect(isReminderEligible("event", null)).toBe(false);
  });
});

describe("scheduleReminderFor", () => {
  const userId = "user-1";

  it("does nothing for a schedule whose fire time is already in the past", () => {
    const calls: string[] = [];
    const supabase = makeSupabase({
      scheduled_reminders: () => {
        calls.push("scheduled_reminders");
        return { data: null, error: null };
      },
    });
    return scheduleReminderFor(
      supabase as never,
      userId,
      "task",
      1,
      "Read",
      "2020-01-01",
      "09:00",
      "Etc/UTC",
    ).then(() => {
      expect(calls).toEqual([]);
    });
  });

  it("does nothing when the item has no schedule", () => {
    const supabase = makeSupabase({});
    return scheduleReminderFor(supabase as never, userId, "event", 7, "Standup", null, null, "Etc/UTC").then(
      () => {
        expect(supabase).toBeTruthy();
      },
    );
  });

  it("invalidates the previous pending reminder and inserts a fresh one", () => {
    const updates: Row[] = [];
    const inserts: Row[] = [];
    const supabase = makeSupabase({
      scheduled_reminders: (info) => {
        if (info.op === "update") updates.push(info.payload);
        if (info.op === "insert") inserts.push(info.payload);
        return { data: null, error: null };
      },
    });
    return scheduleReminderFor(
      supabase as never,
      userId,
      "task",
      5,
      "Read",
      "2030-06-15",
      "09:00",
      "Africa/Tunis",
    ).then(() => {
      expect(updates).toHaveLength(1);
      expect(updates[0].sent_at).toBeTruthy();
      expect(inserts).toHaveLength(1);
      expect(inserts[0]).toMatchObject({
        user_id: userId,
        source_type: "task",
        source_id: 5,
        title: "Read",
        reminder_type: "30min_before",
      });
      expect(String(inserts[0].scheduled_for)).toBe("2030-06-15T07:30:00.000Z");
    });
  });

  it("swallows a duplicate-key race on the unique pending index", () => {
    const supabase = makeSupabase({
      scheduled_reminders: (info) =>
        info.op === "insert"
          ? { data: null, error: { code: "23505", message: "duplicate key" } }
          : { data: null, error: null },
    });
    return expect(
      scheduleReminderFor(supabase as never, userId, "task", 5, "Read", "2030-06-15", "09:00", "Africa/Tunis"),
    ).resolves.toBeUndefined();
  });
});

describe("cancelReminderFor", () => {
  it("marks the pending reminder as sent without touching sent rows", () => {
    const calls: Array<{ op: string; filters: Array<[string, unknown]> }> = [];
    const supabase = makeSupabase({
      scheduled_reminders: (info) => {
        calls.push({ op: info.op, filters: info.filters });
        return { data: null, error: null };
      },
    });
    return cancelReminderFor(supabase as never, "user-1", "event", 9).then(() => {
      expect(calls).toEqual([
        {
          op: "update",
          filters: [
            ["user_id", "user-1"],
            ["source_type", "event"],
            ["source_id", 9],
          ],
        },
      ]);
    });
  });
});

describe("sendPushToUser", () => {
  beforeEach(() => {
    Object.entries(VAPID).forEach(([k, v]) => vi.stubEnv(k, v));
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("delivers to every subscription and reports handoffs", async () => {
    const supabase = makeSupabase({
      push_subscriptions: (info) =>
        info.op === "select"
          ? {
              data: [
                { id: 1, endpoint: "https://push.example/e1", p256dh: "k1", auth: "a1" },
                { id: 2, endpoint: "https://push.example/e2", p256dh: "k2", auth: "a2" },
              ],
              error: null,
            }
          : { data: null, error: null },
    });
    webpushMock.sendNotification.mockResolvedValue({});

    const result = await sendPushToUser(
      supabase as never,
      "user-1",
      { title: "TenPoint reminder", body: "Read starts in 30 minutes.", url: "/tasks" },
    );

    expect(result).toEqual({ handled: 2, failures: 0 });
    expect(webpushMock.setVapidDetails).toHaveBeenCalledWith(VAPID.VAPID_SUBJECT, VAPID.NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID.VAPID_PRIVATE_KEY);
    expect(webpushMock.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the user has no subscriptions", async () => {
    const supabase = makeSupabase({
      push_subscriptions: () => ({ data: [], error: null }),
    });
    const result = await sendPushToUser(supabase as never, "user-1", {
      title: "t",
      body: "b",
      url: "/tasks",
    });
    expect(result).toEqual({ handled: 0, failures: 0 });
    expect(webpushMock.sendNotification).not.toHaveBeenCalled();
  });

  it("removes dead endpoints (404/410/403) and still counts the failure", async () => {
    const deleted: Row[] = [];
    const supabase = makeSupabase({
      push_subscriptions: (info) => {
        if (info.op === "select") {
          return {
            data: [
              { id: 11, endpoint: "https://push.example/dead", p256dh: "k", auth: "a" },
              { id: 12, endpoint: "https://push.example/live", p256dh: "k", auth: "a" },
            ],
            error: null,
          };
        }
        if (info.op === "delete") {
          deleted.push({ filters: info.filters, payload: info.payload, inVals: info.inVals });
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
    });
    webpushMock.sendNotification.mockRejectedValue({ statusCode: 410 });

    const result = await sendPushToUser(supabase as never, "user-1", {
      title: "t",
      body: "b",
      url: "/tasks",
    });

    expect(result).toEqual({ handled: 0, failures: 2 });
    expect(deleted).toHaveLength(1);
    expect(deleted[0].inVals).toContainEqual(["id", [11, 12]]);
    expect(deleted[0].filters).toContainEqual(["user_id", "user-1"]);
  });

  it("ignores transient failures (kept subscription)", async () => {
    const supabase = makeSupabase({
      push_subscriptions: () => ({
        data: [{ id: 21, endpoint: "https://push.example/e", p256dh: "k", auth: "a" }],
        error: null,
      }),
    });
    webpushMock.sendNotification.mockRejectedValue({ statusCode: 500 });

    const result = await sendPushToUser(supabase as never, "user-1", {
      title: "t",
      body: "b",
      url: "/tasks",
    });
    expect(result).toEqual({ handled: 0, failures: 1 });
  });

  it("is a no-op when VAPID is not configured", async () => {
    vi.unstubAllEnvs();
    const supabase = makeSupabase({});
    const result = await sendPushToUser(supabase as never, "user-1", {
      title: "t",
      body: "b",
      url: "/tasks",
    });
    expect(result).toEqual({ handled: 0, failures: 0 });
  });
});

describe("processDueReminders", () => {
  beforeEach(() => {
    Object.entries(VAPID).forEach(([k, v]) => vi.stubEnv(k, v));
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function dueRow(overrides: Row = {}) {
    return {
      id: 100,
      user_id: "user-1",
      source_type: "task",
      source_id: 42,
      title: "Read",
      scheduled_for: new Date(Date.now() - 60_000).toISOString(),
      ...overrides,
    };
  }

  it("claims, re-validates and delivers a due task reminder", async () => {
    const claims: Row[] = [];
    const supabase = makeSupabase({
      scheduled_reminders: (info) => {
        if (info.op === "update") claims.push(info.payload);
        return { data: (info.op === "update" ? { id: 100 } : [dueRow()]), error: null };
      },
      tasks: () => ({ data: { status: "todo", day: "2026-08-28", start_time: "09:00" }, error: null }),
      push_subscriptions: () => ({
        data: [{ id: 1, endpoint: "https://push.example/e", p256dh: "k", auth: "a" }],
        error: null,
      }),
    });
    webpushMock.sendNotification.mockResolvedValue({});

    const result = await processDueReminders(supabase as never, { maxProcessed: 10 });

    expect(result).toEqual({ attempted: 1, delivered: 1, skipped: 0 });
    expect(claims).toHaveLength(1);
    expect(claims[0].sent_at).toBeTruthy();
    expect(webpushMock.sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((webpushMock.sendNotification.mock.calls[0][1] as string) ?? "{}");
    expect(payload.title).toBe("TenPoint reminder");
    expect(payload.body).toBe("Read starts in 30 minutes.");
    expect(payload.url).toBe("/tasks");
  });

  it("skips a completed or missing source without sending", async () => {
    const completed = makeSupabase({
      scheduled_reminders: () => ({ data: [dueRow()], error: null }),
      tasks: () => ({ data: { status: "completed", day: "2026-08-28", start_time: "09:00" }, error: null }),
      push_subscriptions: NO_HANDLER(),
    });
    const r1 = await processDueReminders(completed as never, { maxProcessed: 10 });
    expect(r1).toEqual({ attempted: 1, delivered: 0, skipped: 1 });
    expect(webpushMock.sendNotification).not.toHaveBeenCalled();

    const missing = makeSupabase({
      scheduled_reminders: () => ({ data: [dueRow()], error: null }),
      tasks: () => ({ data: null, error: null }),
      push_subscriptions: NO_HANDLER(),
    });
    const r2 = await processDueReminders(missing as never, { maxProcessed: 10 });
    expect(r2).toEqual({ attempted: 1, delivered: 0, skipped: 1 });
  });

  it("never double-sends when a concurrent run already claimed the row", async () => {
    const supabase = makeSupabase({
      scheduled_reminders: (info) =>
        info.op === "update" ? { data: null, error: null } : { data: [dueRow()], error: null },
      push_subscriptions: NO_HANDLER(),
    });
    const result = await processDueReminders(supabase as never, { maxProcessed: 10 });
    expect(result).toEqual({ attempted: 1, delivered: 0, skipped: 1 });
    expect(webpushMock.sendNotification).not.toHaveBeenCalled();
  });

  it("processes nothing when there are no due rows", async () => {
    const supabase = makeSupabase({
      scheduled_reminders: () => ({ data: [], error: null }),
    });
    const result = await processDueReminders(supabase as never);
    expect(result).toEqual({ attempted: 0, delivered: 0, skipped: 0 });
    expect(webpushMock.sendNotification).not.toHaveBeenCalled();
  });

  it("sends to an event source redirected to /calendar", async () => {
    const supabase = makeSupabase({
      scheduled_reminders: () => ({ data: [dueRow({ source_type: "event" })], error: null }),
      calendar_events: () => ({ data: { status: null, day: "2026-08-28", start_time: "09:00" }, error: null }),
      push_subscriptions: () => ({
        data: [{ id: 1, endpoint: "https://push.example/e", p256dh: "k", auth: "a" }],
        error: null,
      }),
    });
    webpushMock.sendNotification.mockResolvedValue({});

    const result = await processDueReminders(supabase as never, { maxProcessed: 10 });
    expect(result).toEqual({ attempted: 1, delivered: 1, skipped: 0 });
    const payload = JSON.parse((webpushMock.sendNotification.mock.calls[0][1] as string) ?? "{}");
    expect(payload.url).toBe("/calendar");
  });
});