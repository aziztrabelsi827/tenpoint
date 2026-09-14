import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { processDueReminders, isWebPushConfigured } from "@/lib/reminders";

/**
 * Reminder processor — invoked by Vercel Cron.
 *
 * Runs WITHOUT a user session: it must inspect every user's queued reminders,
 * so it uses the server-only service-role client (RLS-exempt) that is never
 * shipped to the browser. The endpoint is protected by a CRON_SECRET header so
 * only Vercel's scheduler can trigger it. Processing is idempotent: each
 * reminder row is claimed atomically (sent_at IS NULL -> set) before any push,
 * so overlapping cron runs can never double-notify.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isWebPushConfigured()) {
    return NextResponse.json({ ok: true, skipped: "web-push not configured" });
  }

  try {
    const supabase = await getServiceRoleClient();
    const result = await processDueReminders(supabase, { maxProcessed: 200 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reminder processor failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;