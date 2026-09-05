import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth";
import type { EventDTO } from "@/lib/types";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ["event", "personal", "work", "focus", "health"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type EventRow = {
  id: number;
  title: string;
  kind: string;
  day: string;
  start_time: string;
  end_time: string;
  notes: string;
  location: string;
  color: string;
};

function serialise(row: EventRow): EventDTO {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    day: row.day,
    startTime: row.start_time,
    endTime: row.end_time,
    notes: row.notes,
    location: row.location,
    color: row.color,
  };
}

export async function POST(request: Request) {
  // RLS enforces that every row written belongs to the session user. The
  // `user_id` column is never taken from the client — the authenticated
  // session is the authority.
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as {
    title?: string;
    kind?: string;
    day?: string;
    startTime?: string;
    endTime?: string;
    notes?: string;
    location?: string;
    color?: string;
  };

  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Event needs a title." }, { status: 400 });
  if (!body.day || !KEY_RE.test(body.day))
    return NextResponse.json({ error: "Event needs a valid date." }, { status: 400 });

  const startTime = TIME_RE.test(body.startTime ?? "") ? (body.startTime as string) : "09:00";
  const endTime = TIME_RE.test(body.endTime ?? "") ? (body.endTime as string) : "10:00";
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color ?? "") ? (body.color as string) : "";

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      user_id: userId,
      title: title.slice(0, 120),
      kind: KINDS.includes(body.kind ?? "") ? (body.kind as string) : "event",
      day: body.day,
      start_time: startTime,
      end_time: endTime,
      notes: (body.notes ?? "").slice(0, 1000),
      location: (body.location ?? "").slice(0, 200),
      color,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Could not create the event." }, { status: 500 });
  return NextResponse.json({ event: serialise(data as EventRow) });
}

export async function PATCH(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as {
    id?: number;
    title?: string;
    kind?: string;
    day?: string;
    startTime?: string;
    endTime?: string;
    notes?: string;
    location?: string;
    color?: string;
  };
  if (!body.id) return NextResponse.json({ error: "Missing event id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 120);
  if (typeof body.kind === "string" && KINDS.includes(body.kind)) patch.kind = body.kind;
  if (typeof body.day === "string" && KEY_RE.test(body.day)) patch.day = body.day;
  if (typeof body.startTime === "string" && TIME_RE.test(body.startTime)) patch.start_time = body.startTime;
  if (typeof body.endTime === "string" && TIME_RE.test(body.endTime)) patch.end_time = body.endTime;
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 1000);
  if (typeof body.location === "string") patch.location = body.location.slice(0, 200);
  if (typeof body.color === "string") {
    patch.color = /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : "";
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  // RLS's WITH CHECK ensures an update can only ever touch the session user's
  // own rows, even if a foreign id were supplied.
  const { data, error } = await supabase
    .from("calendar_events")
    .update(patch)
    .eq("id", body.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({ event: serialise(data as EventRow) });
}

export async function DELETE(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;
  const body = (await request.json()) as { id?: number };
  if (!body.id) return NextResponse.json({ error: "Missing event id" }, { status: 400 });

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", body.id)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: "Could not delete the event." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
