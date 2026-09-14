import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth";
import { isWebPushConfigured } from "@/lib/reminders";

/**
 * Push-subscription management.
 *
 * POST   save a push subscription for the authenticated user (upsert by
 *        endpoint — one browser = one endpoint). user_id always comes from the
 *        session, never from the body, and RLS confines every write to the
 *        session user's own rows.
 * DELETE remove a subscription by endpoint.
 * GET    report whether the user has any active subscriptions.
 */
export async function POST(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Notifications are not configured on this server yet." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    endpoint?: string;
    p256dh?: string;
    auth?: string;
    userAgent?: string;
  };
  const endpoint = (body.endpoint ?? "").trim();
  const p256dh = (body.p256dh ?? "").trim();
  const auth = (body.auth ?? "").trim();
  if (!endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid push endpoint." }, { status: 400 });
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(p256dh) || !/^[A-Za-z0-9+/=_-]+$/.test(auth)) {
    return NextResponse.json({ error: "Invalid push subscription keys." }, { status: 400 });
  }

  // Store the browser's keys verbatim — they arrive URL-safe base64 exactly as
  // the web-push library expects them. Never re-encode.
  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: endpoint.slice(0, 2048),
        p256dh,
        auth,
        user_agent: (body.userAgent ?? "").slice(0, 300),
        updated_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Could not save the subscription: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data?.id ?? null });
}

export async function DELETE(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = (body.endpoint ?? "").trim();
  if (!endpoint) {
    // No endpoint supplied: clear every subscription the user owns.
    const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId);
    if (error) {
      return NextResponse.json({ error: "Could not clear notifications." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, removed: "all" });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint.slice(0, 2048));
  if (error) {
    return NextResponse.json({ error: "Could not remove the subscription." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, removed: "one" });
}

export async function GET() {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  return NextResponse.json({
    enabled: (count ?? 0) > 0,
    count: count ?? 0,
    configured: isWebPushConfigured(),
  });
}

export const dynamic = "force-dynamic";