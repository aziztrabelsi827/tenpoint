import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type SqError = { code?: string; message: string } | null;

type Hooks = {
  onInsert?: (table: string, payload: Row) => { data: Row; error: SqError };
  onUpdate?: (table: string, payload: Row) => { data: Row; error: SqError };
};

/** Minimal chainable query builder for the validation paths under test. */
class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row = {};

  constructor(
    private table: string,
    private store: Record<string, Row[]>,
    private hooks: Hooks,
  ) {}

  select(_cols: unknown = "*") {
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
  order(_s?: unknown, _o?: unknown) {
    return this;
  }
  limit(_n?: unknown) {
    return this;
  }
  gte(_k?: unknown, _v?: unknown) {
    return this;
  }
  maybeSingle() {
    return this.finish("maybeSingle");
  }
  single() {
    return this.finish("single");
  }

  private matches(r: Row) {
    return this.filters.every(([k, v]) => r[k] === v);
  }

  private async finish(kind: "maybeSingle" | "single") {
    if (this.op === "insert") {
      return this.hooks.onInsert
        ? this.hooks.onInsert(this.table, this.payload)
        : { data: { id: 1, ...this.payload }, error: null };
    }
    if (this.op === "update") {
      return this.hooks.onUpdate
        ? this.hooks.onUpdate(this.table, this.payload)
        : { data: { id: 1, ...this.payload }, error: null };
    }
    const rows = (this.store[this.table] ?? []).filter((r) => this.matches(r));
    if (kind === "single" && rows.length === 0) {
      return { data: null, error: { code: "PGRST116", message: "Not found" } };
    }
    return { data: rows[0] ?? null, error: null };
  }
}

function makeSupabase(store: Record<string, Row[]>, hooks: Hooks = {}) {
  return { from: (table: string) => new FakeQuery(table, store, hooks) };
}

const ctxMock = vi.hoisted(() => ({
  requireUserContext: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireUserContext: ctxMock.requireUserContext };
});

import { PATCH as eventsPatch, POST as eventsPost } from "@/app/api/events/route";
import { POST as focusPost } from "@/app/api/focus/route";
import { PATCH as tasksPatch, POST as tasksPost } from "@/app/api/tasks/route";

function json(method: string, body: unknown, path: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fullTaskRow: Row = {
  id: 1,
  user_id: "user-1",
  title: "Read",
  notes: "",
  status: "todo",
  priority: "medium",
  category: "General",
  measure_type: "completion",
  target_value: 1,
  unit: "",
  max_points: 0.5,
  day: null,
  start_time: null,
  end_time: null,
  habit_id: null,
  created_at: "2026-08-01T00:00:00.000Z",
  completed_at: null,
};

beforeEach(() => {
  ctxMock.requireUserContext.mockReset();
  ctxMock.requireUserContext.mockResolvedValue({
    supabase: makeSupabase({}),
    userId: "user-1",
    user: { id: "user-1", email: "a@example.com", name: "A" },
  });
});

/* ------------------------------------------------------------------ */
/* Events: the effective range must never invert (Phase 1.7)           */
/* ------------------------------------------------------------------ */

describe("events route — start/end ordering", () => {
  const eventRow: Row = {
    id: 5,
    user_id: "user-1",
    title: "Standup",
    day: "2026-09-12",
    start_time: "10:00",
    end_time: "11:00",
    notes: "",
    location: "",
    color: "",
  };

  it("rejects a POST whose end time precedes its start time", async () => {
    const res = await eventsPost(
      json("POST", { title: "Standup", day: "2026-09-12", startTime: "15:00", endTime: "14:00" }, "/api/events"),
    );
    expect(res.status).toBe(400);
    await expect((await res.json()).error).toMatch(/after its start/i);
  });

  it("returns ok for a POST with a valid range", async () => {
    const supabase = makeSupabase({}, {
      onInsert: (_t, payload) => ({ data: { id: 5, ...payload }, error: null }),
    });
    ctxMock.requireUserContext.mockResolvedValue({
      supabase,
      userId: "user-1",
      user: { id: "user-1", email: "a@example.com", name: "A" },
    });
    const res = await eventsPost(
      json("POST", { title: "Standup", day: "2026-09-12", startTime: "09:00", endTime: "10:00" }, "/api/events"),
    );
    expect(res.status).toBe(200);
  });

  it("rejects a PATCH that inverts an existing event's range", async () => {
    const supabase = makeSupabase({ calendar_events: [eventRow] });
    ctxMock.requireUserContext.mockResolvedValue({
      supabase,
      userId: "user-1",
      user: { id: "user-1", email: "a@example.com", name: "A" },
    });
    // Stored starts 10:00; a move of the end to before it must be refused.
    const res = await eventsPatch(
      json("PATCH", { id: 5, endTime: "09:00" }, "/api/events"),
    );
    expect(res.status).toBe(400);
  });

  it("accepts a PATCH that keeps the range valid", async () => {
    const supabase = makeSupabase(
      { calendar_events: [eventRow] },
      { onUpdate: (_t, payload) => ({ data: { ...eventRow, ...payload }, error: null }) },
    );
    ctxMock.requireUserContext.mockResolvedValue({
      supabase,
      userId: "user-1",
      user: { id: "user-1", email: "a@example.com", name: "A" },
    });
    const res = await eventsPatch(
      json("PATCH", { id: 5, endTime: "12:00" }, "/api/events"),
    );
    expect(res.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/* Tasks: range ordering + habit ownership (Phases 1.6 + 1.7)          */
/* ------------------------------------------------------------------ */

describe("tasks route — start/end ordering", () => {
  it("rejects a POST whose end time precedes its start time", async () => {
    const res = await tasksPost(
      json("POST", { title: "Deep work", startTime: "14:00", endTime: "13:00" }, "/api/tasks"),
    );
    expect(res.status).toBe(400);
    await expect((await res.json()).error).toMatch(/after its start/i);
  });

  it("rejects a PATCH that inverts the stored schedule", async () => {
    const supabase = makeSupabase({ tasks: [{ ...fullTaskRow, start_time: "09:00", end_time: "10:00" }] });
    ctxMock.requireUserContext.mockResolvedValue({
      supabase,
      userId: "user-1",
      user: { id: "user-1", email: "a@example.com", name: "A" },
    });
    const res = await tasksPatch(
      json("PATCH", { id: 1, startTime: "11:00" }, "/api/tasks"),
    );
    expect(res.status).toBe(400);
  });
});

describe("tasks route — habit ownership", () => {
  it("rejects a POST linking a habit the user does not own", async () => {
    const supabase = makeSupabase({ habits: [] }); // no owned habit id 999
    ctxMock.requireUserContext.mockResolvedValue({
      supabase,
      userId: "user-1",
      user: { id: "user-1", email: "a@example.com", name: "A" },
    });
    const res = await tasksPost(
      json("POST", { title: "Read", habitId: 999 }, "/api/tasks"),
    );
    expect(res.status).toBe(404);
  });

  it("links a POST to a habit the user actually owns", async () => {
    let insertedHabitId: unknown = null;
    const supabase = makeSupabase(
      { habits: [{ id: 7, user_id: "user-1" }] },
      {
        onInsert: (_t, payload) => {
          insertedHabitId = payload.habit_id;
          return { data: { id: 1, ...payload }, error: null };
        },
      },
    );
    ctxMock.requireUserContext.mockResolvedValue({
      supabase,
      userId: "user-1",
      user: { id: "user-1", email: "a@example.com", name: "A" },
    });
    const res = await tasksPost(
      json("POST", { title: "Read", habitId: 7 }, "/api/tasks"),
    );
    expect(res.status).toBe(200);
    expect(insertedHabitId).toBe(7);
  });

  it("rejects a PATCH relinking to a foreign habit and does not write it", async () => {
    const supabase = makeSupabase({ tasks: [fullTaskRow], habits: [{ id: 7, user_id: "user-1" }] });
    ctxMock.requireUserContext.mockResolvedValue({
      supabase,
      userId: "user-1",
      user: { id: "user-1", email: "a@example.com", name: "A" },
    });
    const res = await tasksPatch(
      json("PATCH", { id: 1, habitId: 999 }, "/api/tasks"),
    );
    expect(res.status).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/* Focus: foreign links must never be persisted (Phase 1.6)            */
/* ------------------------------------------------------------------ */

describe("focus route — ownership of task/habit links", () => {
  it("stores null links when neither the task nor habit resolves to the user", async () => {
    const captured: { habit_id?: unknown; task_id?: unknown } = {};
    const supabase = makeSupabase(
      {
        user_settings: [{ user_id: "user-1", timezone: "Etc/UTC" }],
        habits: [],
        tasks: [],
      },
      {
        onInsert: (_t, payload) => {
          captured.habit_id = payload.habit_id;
          captured.task_id = payload.task_id;
          return { data: { id: 9, ...payload }, error: null };
        },
      },
    );
    ctxMock.requireUserContext.mockResolvedValue({
      supabase,
      userId: "user-1",
      user: { id: "user-1", email: "a@example.com", name: "A" },
    });

    const res = await focusPost(
      json("POST", { mode: "focus", seconds: 300, habitId: 4242, taskId: 9999 }, "/api/focus"),
    );
    expect(res.status).toBe(200);
    expect(captured.habit_id).toBeNull();
    expect(captured.task_id).toBeNull();
    const body = await res.json();
    expect(body.session.habitId).toBeNull();
    expect(body.session.taskId).toBeNull();
  });

  it("persists a session when the habit and task DO belong to the user", async () => {
    const captured: { habit_id?: unknown; task_id?: unknown } = {};
    const supabase = makeSupabase(
      {
        user_settings: [{ user_id: "user-1", timezone: "Etc/UTC" }],
        habits: [{ id: 7, user_id: "user-1" }],
        tasks: [{ id: 3, user_id: "user-1", measure_type: "completion" }],
      },
      {
        onInsert: (_t, payload) => {
          captured.habit_id = payload.habit_id;
          captured.task_id = payload.task_id;
          return { data: { id: 9, ...payload }, error: null };
        },
      },
    );
    ctxMock.requireUserContext.mockResolvedValue({
      supabase,
      userId: "user-1",
      user: { id: "user-1", email: "a@example.com", name: "A" },
    });

    const res = await focusPost(
      json("POST", { mode: "focus", seconds: 600, habitId: 7, taskId: 3 }, "/api/focus"),
    );
    expect(res.status).toBe(200);
    expect(captured.habit_id).toBe(7);
    expect(captured.task_id).toBe(3);
  });
});