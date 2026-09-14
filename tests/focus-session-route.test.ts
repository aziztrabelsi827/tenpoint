import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const ctxMock = vi.hoisted(() => ({ requireUserContext: vi.fn() }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireUserContext: ctxMock.requireUserContext };
});

const progressMock = vi.hoisted(() => ({
  applyFocusToTask: vi.fn<
    (
      supabase: unknown,
      userId: string,
      taskId: number | null,
      mode: string,
      seconds: number,
      day: string,
    ) => Promise<{ progress: number; points: number } | null>
  >(async () => null),
}));
vi.mock("@/lib/focus-progress", () => progressMock);

import { GET, POST } from "@/app/api/focus/session/route";

/* ------------------------------------------------------------------ */
/* Chainable fake Supabase query                                       */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;
type SqError = { code?: string; message: string };
type QueryInfo = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  filters: Array<[string, unknown]>;
  payload: Row;
  terminal: "single" | "maybeSingle" | null;
};
type Handler = (info: QueryInfo) => { data?: unknown; error?: SqError | null };

class FakeQuery {
  private op: QueryInfo["op"] = "select";
  private filters: Array<[string, unknown]> = [];
  private payload: Row = {};
  private terminal: QueryInfo["terminal"] = null;

  constructor(
    private table: string,
    private handler: Handler,
  ) {}

  select() {
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
  order() {
    return this;
  }
  limit() {
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

  then<T1 = unknown, T2 = never>(
    onfulfilled?: (value: unknown) => T1 | PromiseLike<T1>,
    onrejected?: (reason: unknown) => T2 | PromiseLike<T2>,
  ): Promise<T1 | T2> {
    return this.resolve().then(onfulfilled as never, onrejected as never);
  }

  private resolve(): Promise<{ data?: unknown; error?: SqError | null }> {
    return Promise.resolve(
      this.handler({
        table: this.table,
        op: this.op,
        filters: this.filters,
        payload: this.payload,
        terminal: this.terminal,
      }),
    );
  }
}

/** In-memory focus_sessions store respecting the app's single-active-row rule. */
function makeSupabase() {
  const focusRows: Row[] = [];
  let nextId = 1;

  const handler: Handler = ({ table, op, filters, payload, terminal }) => {
    if (table === "user_settings") {
      return { data: { timezone: "Etc/UTC" }, error: null };
    }
    // Ownership check used by resolveLinks: the queried id resolves to a task
    // the user owns (mirror of the real habits/tasks access pattern).
    if (table === "tasks" || table === "habits") {
      const id = filters.find(([k]) => k === "id")?.[1];
      return {
        data: id != null ? { id: Number(id) } : null,
        error: null,
      };
    }
    if (table !== "focus_sessions") {
      return { data: null, error: { code: "UNHANDLED", message: table } };
    }

    const uid = filters.find(([k]) => k === "user_id")?.[1];
    const owned = focusRows.filter((r) => r.user_id === uid);

    if (op === "insert") {
      const row: Row = { id: nextId++, ...payload };
      focusRows.push(row);
      return { data: row, error: null };
    }
    if (op === "update") {
      const id = filters.find(([k]) => k === "id")?.[1];
      const wantsActive = filters.some(([k, v]) => k === "completed" && v === false);
      let matches = owned;
      if (id != null) matches = matches.filter((r) => r.id === id);
      if (wantsActive) matches = matches.filter((r) => r.completed === false);
      let updated: Row | undefined;
      for (const r of matches) {
        Object.assign(r, payload);
        updated = r;
      }
      if (terminal === "single") {
        return updated
          ? { data: updated, error: null }
          : { data: null, error: { code: "PGRST116", message: "no rows" } };
      }
      return { data: null, error: null };
    }
    if (op === "delete") {
      const id = filters.find(([k]) => k === "id")?.[1];
      focusRows.splice(
        0,
        focusRows.length,
        ...focusRows.filter((r) => !(r.user_id === uid && r.id === id)),
      );
      return { data: null, error: null };
    }
    // select
    const activeOnly = filters.some(([k, v]) => k === "completed" && v === false);
    const doneOnly = filters.some(([k, v]) => k === "completed" && v === true);
    let matches = owned;
    if (activeOnly) matches = matches.filter((r) => r.completed === false);
    if (doneOnly) matches = matches.filter((r) => r.completed === true);
    const sorted = [...matches].sort((a, b) => Number(b.id) - Number(a.id));
    const data = sorted.length ? sorted[0] : null;
    if (terminal === "single" && sorted.length !== 1) {
      return { data: null, error: { code: "PGRST116", message: "expected one row" } };
    }
    return { data, error: null };
  };

  return {
    db: focusRows,
    from: (table: string) => new FakeQuery(table, handler),
  };
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

const T0 = Date.parse("2026-09-14T08:00:00.000Z");

function json(method: string, body: unknown): Request {
  return new Request("http://localhost:3000/api/focus/session", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let supabase: ReturnType<typeof makeSupabase>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.clearAllMocks();
  supabase = makeSupabase();
  ctxMock.requireUserContext.mockReset();
  ctxMock.requireUserContext.mockResolvedValue({
    supabase,
    userId: "user-1",
    user: { id: "user-1", email: "a@example.com", name: "A" },
  });
  progressMock.applyFocusToTask.mockResolvedValue(null);
});
afterEach(() => {
  vi.useRealTimers();
});

const rowOf = (body: { session?: unknown }) =>
  (body.session ?? null) as (Row & { completed: boolean }) | null;

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

describe("focus session route — lifecycle", () => {
  it("start creates a single active RUNNING row with an absolute endsAt", async () => {
    const res = await POST(json("POST", { action: "start", mode: "focus", seconds: 1500 }));
    const s = rowOf(await res.json());
    expect(res.status).toBe(200);
    expect(s).not.toBeNull();
    expect(s!.completed).toBe(false);
    expect(s!.endsAt).not.toBeNull();
    expect(Date.parse(s!.endsAt as string) - Date.parse(s!.startedAt as string)).toBe(
      1500 * 1000,
    );
    expect(s!.day).toBe("2026-09-14");

    const getRes = await GET();
    const g = rowOf(await getRes.json());
    expect(g!.id).toBe(s!.id);
    expect(supabase.db.filter((r) => r.completed === false).length).toBe(1);
  });

  it("a second tab starting again UPSERTs the same row instead of duplicating", async () => {
    await POST(json("POST", { action: "start", mode: "focus", seconds: 1500 }));
    const res2 = await POST(
      json("POST", { action: "start", mode: "short_break", seconds: 300 }),
    );
    const s2 = rowOf(await res2.json());
    expect(supabase.db.filter((r) => r.completed === false).length).toBe(1);
    expect(s2!.mode).toBe("short_break");
    expect(s2!.seconds).toBe(300);
  });

  it("pause freezes remaining seconds and clears endsAt; resume restores endsAt", async () => {
    await POST(json("POST", { action: "start", mode: "focus", seconds: 1500 }));
    vi.setSystemTime(T0 + 61_000);

    const paused = rowOf((await POST(json("POST", { action: "pause" })).then((r) => r.json())) as { session?: unknown });
    expect(paused!.endsAt).toBeNull();
    expect(paused!.remainingSeconds).toBe(1500 - 61);

    // Pausing an already-paused session is idempotent — remaining is frozen.
    const pausedAgain = rowOf((await POST(json("POST", { action: "pause" })).then((r) => r.json())) as { session?: unknown });
    expect(pausedAgain!.remainingSeconds).toBe(paused!.remainingSeconds);
    expect(pausedAgain!.endsAt).toBeNull();

    vi.setSystemTime(T0 + 360_000); // 5 minutes later, still only 1439s must be left
    const resumed = rowOf((await POST(json("POST", { action: "resume" })).then((r) => r.json())) as { session?: unknown });
    expect(resumed!.remainingSeconds).toBeNull();
    const remainingAfterResume =
      (Date.parse(resumed!.endsAt as string) - Date.parse(new Date(T0 + 360_000).toISOString())) / 1000;
    expect(remainingAfterResume).toBe(1500 - 61);
  });

  it("a session paused at the exact end finalizes instead of storing 0 seconds", async () => {
    await POST(json("POST", { action: "start", mode: "focus", seconds: 300 }));
    vi.setSystemTime(T0 + 300_000);
    const res = await POST(json("POST", { action: "pause" }));
    const body = (await res.json()) as { session?: unknown };
    const s = rowOf(body);
    expect(s!.completed).toBe(true);
    expect(supabase.db.filter((r) => r.completed === false).length).toBe(0);
  });

  it("complete finalizes the row in place (same id, endsAt kept) and logs via the shared helper", async () => {
    await POST(json("POST", { action: "start", mode: "focus", seconds: 1500, taskId: 7 }));
    const res = await POST(json("POST", { action: "complete" }));
    const body = (await res.json()) as { session?: unknown; progress: unknown };
    const s = rowOf(body);
    expect(s!.completed).toBe(true);
    expect(s!.remainingSeconds).toBeNull();
    expect(Date.parse(s!.endsAt as string) - Date.parse(s!.startedAt as string)).toBe(1500 * 1000);
    expect(supabase.db.filter((r) => r.completed === false).length).toBe(0);

    expect(progressMock.applyFocusToTask).toHaveBeenCalledTimes(1);
    expect(progressMock.applyFocusToTask).toHaveBeenCalledWith(
      supabase,
      "user-1",
      7,
      "focus",
      1500,
      "2026-09-14",
    );

    const getRes = await GET();
    expect((await getRes.json()).session).toBeNull();
  });

  it("completing a second time (stale tab after reset) converges WITHOUT re-feeding task progress", async () => {
    await POST(json("POST", { action: "start", mode: "focus", seconds: 600, taskId: 7 }));
    const first = rowOf((await (await POST(json("POST", { action: "complete" }))).json()) as { session?: unknown });
    expect(progressMock.applyFocusToTask).toHaveBeenCalledTimes(1);
    // A stale tab (or a task raced after a reset on another device) finalizes
    // nothing new — it must NOT re-add minutes to the task.
    const second = rowOf((await (await POST(json("POST", { action: "complete" }))).json()) as { session?: unknown });
    expect(second!.id).toBe(first!.id);
    expect(second!.completed).toBe(true);
    expect(progressMock.applyFocusToTask).toHaveBeenCalledTimes(1);

    // Active row discarded → complete also converges without re-feeding.
    await POST(json("POST", { action: "start", mode: "focus", seconds: 600, taskId: 7 }));
    await POST(json("POST", { action: "reset" }));
    const afterReset = rowOf((await (await POST(json("POST", { action: "complete" }))).json()) as { session?: unknown });
    expect(afterReset!.completed).toBe(true);
    expect(progressMock.applyFocusToTask).toHaveBeenCalledTimes(1);
  });

  it("reset and skip discard the active session without logging it", async () => {
    await POST(json("POST", { action: "start", mode: "focus", seconds: 300 }));
    const res = await POST(json("POST", { action: "reset" }));
    expect((await res.json()).session).toBeNull();
    expect(supabase.db.length).toBe(0);

    await POST(json("POST", { action: "start", mode: "focus", seconds: 300 }));
    await POST(json("POST", { action: "skip" }));
    expect(supabase.db.length).toBe(0);
  });

  it("returns no session for actions while idle", async () => {
    for (const action of ["pause", "resume", "complete", "reset", "skip"]) {
      const res = await POST(json("POST", { action }));
      const body = (await res.json()) as { session?: unknown };
      expect(rowOf(body), action).toBeNull();
    }
  });
});

describe("focus session route — task linking", () => {
  it("forwards the shared task-progress result on completion", async () => {
    progressMock.applyFocusToTask.mockResolvedValue({ progress: 25, points: 0.5 });
    await POST(json("POST", { action: "start", mode: "focus", seconds: 1500, taskId: 3 }));
    const res = await POST(json("POST", { action: "complete" }));
    const body = (await res.json()) as { progress: unknown };
    expect(body.progress).toEqual({ progress: 25, points: 0.5 });
  });
});