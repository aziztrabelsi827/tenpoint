import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth";

export async function POST(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json()) as { order?: number[] };
  if (!Array.isArray(body.order)) return NextResponse.json({ error: "Missing order" }, { status: 400 });

  // PostgREST takes the row lock only per update; there is no local `FOR
  // UPDATE`, but the whole list is the session user's own and RLS scopes every
  // update. sort_order is enforced by the UNIQUE(user_id, sort_order) index.
  const results = await Promise.all(
    body.order.map((id, index) =>
      supabase
        .from("habits")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("user_id", userId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed) return NextResponse.json({ error: "Could not reorder habits." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
