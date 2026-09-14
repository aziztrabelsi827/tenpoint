import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth";
import { sendPushToUser, TEST_BODY, TEST_TITLE, TEST_NOTIFICATION_TAG, isWebPushConfigured } from "@/lib/reminders";

/**
 * Sends a test push notification to the authenticated user's devices.
 * Used from Settings to verify the subscription and delivery path end to end.
 */
export async function POST() {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Notifications are not configured on this server yet." },
      { status: 503 },
    );
  }

  const { handled, failures } = await sendPushToUser(
    supabase,
    userId,
    {
      title: TEST_TITLE,
      body: TEST_BODY,
      url: "/dashboard",
      tag: TEST_NOTIFICATION_TAG,
    },
    { ttl: 60 },
  );

  if (handled === 0 && failures === 0) {
    return NextResponse.json(
      { error: "You have no subscribed devices. Enable notifications first." },
      { status: 400 },
    );
  }
  if (handled === 0) {
    return NextResponse.json(
      { error: "The push service rejected every device. Re-enable notifications in Settings." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, delivered: handled });
}

export const dynamic = "force-dynamic";