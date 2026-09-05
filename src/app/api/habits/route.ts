import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUserContext } from "@/lib/auth";
import { MAX_HABITS, slugify } from "@/lib/data";
import { sanitizePointValue } from "@/lib/format";
import type { HabitDTO } from "@/lib/types";

type HabitRow = {
  id: number;
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
  kind: string;
  pointValue: number;
  targetCount: number;
  days: string;
  scheduleTimes: string;
  sortOrder: number;
  enabled: boolean;
};

type HabitPayload = {
  id?: number;
  name?: string;
  icon?: string;
  color?: string;
  description?: string;
  kind?: string;
  pointValue?: number;
  targetCount?: number;
  days?: number[];
  scheduleTimes?: string[];
  enabled?: boolean;
  sortOrder?: number;
};

function safeTimes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function serialise(row: HabitRow): HabitDTO {
  let days: number[] = [];
  try {
    const parsed = JSON.parse(row.days);
    if (Array.isArray(parsed)) days = parsed.filter((n) => typeof n === "number");
  } catch {
    days = [];
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    color: row.color,
    description: row.description,
    kind: row.kind === "negative" ? "negative" : "positive",
    pointValue: Number(row.pointValue ?? 1),
    targetCount: Math.max(1, Number(row.targetCount ?? 1)),
    days,
    scheduleTimes: safeTimes(row.scheduleTimes),
    sortOrder: row.sortOrder,
    enabled: row.enabled,
  };
}

function mapHabitRow(r: Record<string, unknown>): HabitRow {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    slug: String(r.slug ?? ""),
    icon: String(r.icon ?? ""),
    color: String(r.color ?? ""),
    description: String(r.description ?? ""),
    kind: String(r.kind ?? "positive"),
    pointValue: Number(r.point_value ?? 1),
    targetCount: Number(r.target_count ?? 1),
    days: String(r.days ?? "[]"),
    scheduleTimes: String(r.schedule_times ?? "[]"),
    sortOrder: Number(r.sort_order ?? 0),
    enabled: Boolean(r.enabled),
  };
}

async function uniqueSlug(supabase: SupabaseClient, userId: string, name: string, ignoreId?: number): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  for (let i = 2; i < 60; i += 1) {
    const { data } = await supabase
      .from("habits")
      .select("id")
      .eq("user_id", userId)
      .eq("slug", candidate)
      .maybeSingle();
    if (!data || Number(data.id) === ignoreId) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

export async function POST(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as HabitPayload;
  const name = (body.name ?? "").trim();
  if (name.length === 0) return NextResponse.json({ error: "Habit needs a name." }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "Keep habit names under 60 characters." }, { status: 400 });

  const pointValue = body.pointValue === undefined ? 1 : sanitizePointValue(body.pointValue);
  if (pointValue === null) {
    return NextResponse.json(
      { error: "Weight must be a number between 0.1 and 10." },
      { status: 400 },
    );
  }
  const kind = body.kind === "negative" ? "negative" : "positive";
  const targetCount =
    kind === "negative"
      ? 1
      : Math.max(1, Math.min(20, Math.round(Number(body.targetCount ?? 1) || 1)));

  const countResult = await supabase
    .from("habits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countResult.error) return NextResponse.json({ error: "Could not create the habit." }, { status: 500 });
  if ((countResult.count ?? 0) >= MAX_HABITS) {
    return NextResponse.json(
      { error: `You already track ${MAX_HABITS} habits, which is the storage limit for one workspace.` },
      { status: 400 },
    );
  }

  const maxOrder = await supabase
    .from("habits")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const maxOrderVal = maxOrder.data?.[0]?.sort_order;

  // Creation guard: scheduleTimes must not exceed targetCount (positive habits).
  if (kind !== "negative" && Array.isArray(body.scheduleTimes)) {
    const times = [...new Set(body.scheduleTimes)].filter((t) =>
      /^([01]\d|2[0-3]):[0-5]\d$/.test(t),
    );
    if (times.length > targetCount) {
      return NextResponse.json(
        {
          error: `${times.length} scheduled times exceed the target of ${targetCount} repetitions per day.`,
        },
        { status: 400 },
      );
    }
  }

  const unique = await uniqueSlug(supabase, userId, name);
  const { data: inserted, error } = await supabase
    .from("habits")
    .insert({
      user_id: userId,
      name,
      slug: unique,
      icon: body.icon ?? "✅",
      color: body.color ?? "#2563eb",
      description: (body.description ?? "").slice(0, 400),
      kind,
      point_value: pointValue,
      target_count: targetCount,
      days: JSON.stringify((body.days ?? []).filter((d) => d >= 0 && d <= 6)),
      schedule_times: JSON.stringify(
        [...new Set(body.scheduleTimes ?? [])]
          .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
          .sort(),
      ),
      sort_order: (maxOrderVal ?? -1) + 1,
      enabled: body.enabled ?? true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Could not create the habit." }, { status: 500 });
  return NextResponse.json({ habit: serialise(mapHabitRow(inserted as Record<string, unknown>)) });
}

export async function PATCH(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as HabitPayload;
  if (!body.id) return NextResponse.json({ error: "Missing habit id" }, { status: 400 });

  // Current configuration, needed to validate scheduleTimes against the target.
  const { data: current, error: readError } = await supabase
    .from("habits")
    .select("*")
    .eq("id", body.id)
    .eq("user_id", userId)
    .single();
  if (readError && readError.code !== "PGRST116") {
    return NextResponse.json({ error: "Could not load the habit." }, { status: 500 });
  }
  if (!current) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  const cur = mapHabitRow(current as Record<string, unknown>);

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    patch.name = body.name.trim().slice(0, 60);
    patch.slug = await uniqueSlug(supabase, userId, patch.name as string, body.id);
  }
  if (typeof body.icon === "string") patch.icon = body.icon.slice(0, 8);
  if (typeof body.color === "string") patch.color = body.color.slice(0, 24);
  if (typeof body.description === "string") patch.description = body.description.slice(0, 400);
  if (Array.isArray(body.days)) patch.days = JSON.stringify(body.days.filter((d) => d >= 0 && d <= 6));
  if (Array.isArray(body.scheduleTimes)) {
    // Validate HH:MM, dedupe, cap at 24.
    const times = [...new Set(body.scheduleTimes)]
      .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
      .sort();

    // A positive habit may not have MORE scheduled times than its daily target.
    // Fewer is fine — some repetitions can be unscheduled.
    const nextTarget = patch.target_count !== undefined ? Number(patch.target_count) : Math.max(1, Number(cur.targetCount ?? 1));
    const nextKind = patch.kind !== undefined ? String(patch.kind) : cur.kind;
    if (nextKind !== "negative" && times.length > nextTarget) {
      return NextResponse.json(
        {
          error: `${times.length} scheduled times exceed the target of ${nextTarget} repetitions per day. Remove ${
            times.length - nextTarget
          } time${times.length - nextTarget === 1 ? "" : "s"} or raise the target.`,
        },
        { status: 400 },
      );
    }
    patch.schedule_times = JSON.stringify(times);
  }
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.sortOrder === "number") patch.sort_order = body.sortOrder;

  if (body.pointValue !== undefined) {
    const cleaned = sanitizePointValue(body.pointValue);
    if (cleaned === null) {
      return NextResponse.json(
        { error: "Weight must be a number between 0.1 and 10." },
        { status: 400 },
      );
    }
    patch.point_value = cleaned;
  }
  if (typeof body.kind === "string") {
    patch.kind = body.kind === "negative" ? "negative" : "positive";
  }
  if (body.targetCount !== undefined) {
    patch.target_count = Math.max(1, Math.min(20, Math.round(Number(body.targetCount) || 1)));
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { data: updated, error: updateError } = await supabase
    .from("habits")
    .update(patch)
    .eq("id", body.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: "Could not update the habit." }, { status: 500 });
  if (!updated) return NextResponse.json({ habit: serialise(cur) });

  /**
   * Habit-log snapshots are IMMUTABLE to configuration changes.
   *
   * A log records one day's occurrences and the contribution that day earned.
   * Once written it is never rewritten — for any date, past, present or future.
   * New configuration only affects occurrences recorded from now on.
   */
  return NextResponse.json({ habit: serialise(mapHabitRow(updated as Record<string, unknown>)) });
}

/**
 * Deletes a habit.
 *
 * DESTRUCTIVE DELETE IS GUARDED: if the habit has any recorded history
 * (habit logs or occurrence records), deleting it would cascade-remove that
 * history and silently rewrite every past daily rating it contributed to.
 *
 * Habits with history are therefore ARCHIVED (disabled + renamed) so their
 * records stay intact and historical statistics remain valid. Only habits with
 * no recorded history are permanently removed.
 *
 * Set `force: true` to delete permanently even when history exists. The UI
 * confirms explicitly before doing this.
 */
export async function DELETE(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as { id?: number; force?: boolean };
  if (!body.id) return NextResponse.json({ error: "Missing habit id" }, { status: 400 });

  const { data: habit, error: habitReadError } = await supabase
    .from("habits")
    .select("*")
    .eq("id", body.id)
    .eq("user_id", userId)
    .single();
  if (habitReadError && habitReadError.code !== "PGRST116") {
    return NextResponse.json({ error: "Could not load the habit." }, { status: 500 });
  }
  if (!habit) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  const h = mapHabitRow(habit as Record<string, unknown>);

  // Count recorded history for this habit (RLS-scoped to the session user).
  const logCount = await supabase
    .from("habit_logs")
    .select("id", { count: "exact", head: true })
    .eq("habit_id", body.id)
    .eq("user_id", userId);
  const occCount = await supabase
    .from("habit_occurrences")
    .select("id", { count: "exact", head: true })
    .eq("habit_id", body.id)
    .eq("user_id", userId);
  if (logCount.error) return NextResponse.json({ error: "Could not check habit history." }, { status: 500 });
  if (occCount.error) return NextResponse.json({ error: "Could not check habit history." }, { status: 500 });

  const hasHistory =
    (logCount.count ?? 0) > 0 || (occCount.count ?? 0) > 0;

  if (hasHistory && body.force !== true) {
    // Archive: keep every historical record, stop future scheduling.
    const archivedName = `${h.name} (archived)`.slice(0, 60);
    const { error: archiveError } = await supabase
      .from("habits")
      .update({
        enabled: false,
        name: archivedName,
        // Detach from the calendar so archived occurrences stop rendering.
        schedule_times: "[]",
      })
      .eq("id", body.id)
      .eq("user_id", userId);
    if (archiveError) return NextResponse.json({ error: "Could not archive the habit." }, { status: 500 });

    return NextResponse.json({
      ok: true,
      archived: true,
      message: `“${h.name}” has ${logCount.count ?? 0} recorded day(s). It was archived instead of deleted so your history stays accurate. Pass force: true to delete permanently.`,
    });
  }

  const { error: deleteError } = await supabase
    .from("habits")
    .delete()
    .eq("id", body.id)
    .eq("user_id", userId);
  if (deleteError) return NextResponse.json({ error: "Could not delete the habit." }, { status: 500 });
  return NextResponse.json({ ok: true, archived: false });
}

export const dynamic = "force-dynamic";
