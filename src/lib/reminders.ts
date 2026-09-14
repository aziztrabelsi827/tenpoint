import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

/**
 * Reminders & Web Push
 * ====================
 * TenPoint sends one reminder per scheduled task/event, 30 minutes before the
 * start, via the Web Push API. The flow:
 *
 *   1. Task/event CRUD punches a row into `scheduled_reminders` (via
 *      `scheduleReminderFor`). The reminder time is the local start time minus
 *      30 minutes, converted to an absolute instant (UTC) using the user's IANA
 *      timezone from `user_settings`.
 *   2. A server-side job (Vercel Cron -> /api/notifications/cron) finds due
 *      reminders, re-validates the source row is still eligible, and pushes.
 *   3. The browser service worker (`public/sw.js`) shows the notification.
 *
 * Duplicate prevention is a database concern: a unique partial index on
 * `(user_id, source_type, source_id, reminder_type) WHERE sent_at IS NULL`
 * guarantees at most one pending reminder per item, and the cron processor
 * marks `sent_at` atomically so concurrent runs cannot double-send.
 */

/** TenPoint reminds users 30 minutes before the scheduled start. */
export const REMINDER_LEAD_MINUTES = 30;
export const REMINDER_TYPE = "30min_before";

export const DEFAULT_PUSH_TTL_SECONDS = 60 * 60; // 1h — drop if device is offline longer
export const TEST_NOTIFICATION_TAG = "tenpoint-test";

/** Short-title & body used by the test notification flow. */
export const TEST_TITLE = "TenPoint";
export const TEST_BODY = "Notifications are working.";

/* ---------------- VAPID config ---------------- */

export function getVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

/**
 * Converts a local calendar day + "HH:MM" wall-clock time into an absolute UTC
 * Date instant, using the user's IANA timezone.
 *
 * This is the standard "zoned time -> instant" derivation used by date-fns-tz:
 * treat the wall-clock time as if it were UTC to get an approximate instant,
 * read back what the target timezone *displays* at that instant, then correct
 * the instant by the timezone's actual offset at that moment. The correction is
 * exact for every real IANA zone (Africa/Tunis, DST zones, etc.) because
 * Intl.DateTimeFormat resolves the true UTC offset for the probed instant.
 *
 * Returns null when the day/time/timezone is malformed.
 */
export function localWallClockToUtc(
  day: string,
  time: string,
  timezone: string,
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  try {
    const [y, mo, da] = day.split("-").map(Number);
    // Reject impossible calendar dates (e.g. 2026-13-40) that Date.UTC would
    // silently normalise into a different day.
    const probeDay = new Date(Date.UTC(y, mo - 1, da));
    if (
      probeDay.getUTCFullYear() !== y ||
      probeDay.getUTCMonth() !== mo - 1 ||
      probeDay.getUTCDate() !== da
    ) {
      return null;
    }
    const [h, mi] = time.split(":").map(Number);
    // Wall-clock time first approximated as UTC (an instant on the timeline).
    const asTS = Date.UTC(y, mo - 1, da, h, mi, 0, 0);

    // What the target timezone renders AT that instant (its real clock).
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const parts = dtf.formatToParts(new Date(asTS));
    const byType = new Map(parts.map((p) => [p.type.toLowerCase(), p.value]));
    const read = (t: string) => Number(byType.get(t));
    const [ry, rmo, rda, rh, rmi, rs] = [
      read("year"),
      read("month"),
      read("day"),
      read("hour"),
      read("minute"),
      read("second"),
    ];
    if (![ry, rmo, rda, rh, rmi].every((n) => Number.isFinite(n))) return null;
    const tzWallClock = Date.UTC(ry, rmo - 1, rda, rh, rmi, rs);

    // Correct the instant by the difference between our UTC guess and the
    // timezone's reading of it — that difference IS the real zone offset.
    return new Date(asTS + (asTS - tzWallClock));
  } catch {
    return null;
  }
}

/** The absolute reminder instant = local start - lead. Returns null when the
 *  start cannot be converted (e.g. no scheduled time). */
export function reminderInstantFor(
  day: string,
  startTime: string | null,
  timezone: string | null,
): Date | null {
  if (!startTime) return null;
  const tz = timezone ?? "Etc/UTC";
  const start = localWallClockToUtc(day, startTime, tz);
  if (!start) return null;
  return new Date(start.getTime() - REMINDER_LEAD_MINUTES * 60 * 1000);
}

/**
 * Determines whether a reminder is still eligible to be sent.
 * Tasks: must have a day + start_time, not completed/cancelled/archived.
 * Events: must exist (events have no cancellation field in the schema).
 */
export function isReminderEligible(
  sourceType: string,
  row: {
    status?: string | null;
    day?: string | null;
    startTime?: string | null;
  } | null,
): row is { day: string; startTime: string } {
  if (!row) return false;
  if (sourceType === "task") {
    if (row.status === "completed" || row.status === "archived") return false;
  }
  if (!row.day || !row.startTime) return false;
  return true;
}

/* ---------------- scheduling helpers (server-side) ---------------- */

/**
 * Upserts the pending reminder for a task/event so it tracks the item's
 * current schedule. Called after every create/reschedule. Deletes any existing
 * pending reminder first, then inserts the fresh one — so a reschedule simply
 * replaces the pending row and can never start two parallel reminders.
 */
export async function scheduleReminderFor(
  supabase: SupabaseClient,
  userId: string,
  sourceType: "task" | "event",
  sourceId: number,
  title: string,
  day: string | null,
  startTime: string | null,
  timezone: string | null,
): Promise<void> {
  const when = reminderInstantFor(day ?? "", startTime, timezone);
  if (!when) return; // no schedule -> nothing to remind about

  // If a reminder's fire time is already in the past for this exact item,
  // never queue a late notification (spec: "DO NOT immediately send a late
  // notification"). Also, only schedule strictly-future-eligible reminders.
  if (when.getTime() <= Date.now()) return;

  // Remove any pending reminder for the item first — the unique partial index
  // guarantees only one pending row can survive.
  await supabase
    .from("scheduled_reminders")
    .update({ sent_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .is("sent_at", null);

  const { error } = await supabase.from("scheduled_reminders").insert({
    user_id: userId,
    source_type: sourceType,
    source_id: sourceId,
    title: title.slice(0, 160),
    scheduled_for: when.toISOString(),
    reminder_type: REMINDER_TYPE,
  });
  if (error) {
    // The unique partial index may collide on a racing duplicate; that is
    // harmless (the reminder already exists). Any other error is surfaced to
    // the caller so CRUD can still proceed but log the problem.
    if ((error as { code?: string }).code !== "23505") {
      console.error("scheduleReminderFor failed", error.message);
    }
  }
}

/** Marks any pending reminder for an item as sent (invalidates it). */
export async function cancelReminderFor(
  supabase: SupabaseClient,
  userId: string,
  sourceType: "task" | "event",
  sourceId: number,
): Promise<void> {
  await supabase
    .from("scheduled_reminders")
    .update({ sent_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .is("sent_at", null);
}

/* ---------------- push delivery ---------------- */

export type PushSubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Sends a push payload to every subscription owned by the user. Returns the
 *  list of invalid subscription ids (endpoints the push service rejected). */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url: string; tag?: string },
  opts: { ttl?: number } = {},
): Promise<{ handled: number; failures: number }> {
  const config = getVapidConfig();
  if (!config) return { handled: 0, failures: 0 };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { handled: 0, failures: 0 };

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  let handled = 0;
  let failures = 0;
  const dead: number[] = [];

  for (const sub of subs as PushSubscriptionRow[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { TTL: opts.ttl ?? DEFAULT_PUSH_TTL_SECONDS },
      );
      handled++;
    } catch (err) {
      failures++;
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 = endpoint gone. Disabling-please-stop arrives via 403 in some
      // browsers; it is safer to drop it too so a dead device is never re-tried.
      if (status === 404 || status === 410 || status === 403) dead.push(sub.id);
    }
  }

  if (dead.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", dead).eq("user_id", userId);
  }

  return { handled, failures };
}

/* ---------------- cron processor ---------------- */

export type DueReminderRow = {
  id: number;
  user_id: string;
  source_type: "task" | "event";
  source_id: number;
  title: string;
  scheduled_for: string;
};

/**
 * Processes every reminder whose fire time has arrived.
 * For each: re-validate the source row, deliver the push, then mark sent.
 * Idempotent: a row is only processed if `sent_at IS NULL`, and we atomically
 * claim it first (update sent_at) before delivering so a concurrent run cannot
 * double-send.
 */
export async function processDueReminders(
  supabase: SupabaseClient,
  batches: { batchSize?: number; maxProcessed?: number } = {},
): Promise<{ attempted: number; delivered: number; skipped: number }> {
  const config = getVapidConfig();
  if (!config) return { attempted: 0, delivered: 0, skipped: 0 };

  const batchSize = batches.batchSize ?? 50;
  const maxProcessed = batches.maxProcessed ?? 200;

  // Claim a batch of due, unsent reminders atomically. `sent_at` update within
  // Postgres is atomic per row, and the unique partial index (WHERE sent_at IS
  // NULL) means a second claimer can never grab the same row.
  const now = new Date().toISOString();
  const { data: due } = await supabase
    .from("scheduled_reminders")
    .select("id, user_id, source_type, source_id, title, scheduled_for")
    .lte("scheduled_for", now)
    .is("sent_at", null)
    .order("scheduled_for", { ascending: true })
    .limit(Math.min(batchSize, maxProcessed));

  if (!due || due.length === 0) return { attempted: 0, delivered: 0, skipped: 0 };

  let attempted = 0;
  let delivered = 0;
  let skipped = 0;

  for (const row of due as DueReminderRow[]) {
    attempted++;

    // Claim.
    const { data: claimed, error: claimError } = await supabase
      .from("scheduled_reminders")
      .update({ sent_at: now })
      .eq("id", row.id)
      .is("sent_at", null)
      .select("id")
      .single();
    if (claimError || !claimed) {
      skipped++; // someone else already sent it — idempotent by design
      continue;
    }

    // Re-validate the source row still exists and is eligible.
    const table = row.source_type === "task" ? "tasks" : "calendar_events";
    const { data: source } = await supabase
      .from(table)
      .select("status, day, start_time")
      .eq("id", row.source_id)
      .eq("user_id", row.user_id)
      .maybeSingle();
    if (!isReminderEligible(row.source_type, {
      status: source?.status as string | null,
      day: source?.day as string | null,
      startTime: source?.start_time as string | null,
    })) {
      skipped++; // deleted / completed / rescheduled-away — never send
      continue;
    }

    const url = row.source_type === "task" ? "/tasks" : "/calendar";
    const { handled } = await sendPushToUser(
      supabase,
      row.user_id,
      {
        title: "TenPoint reminder",
        body: `${row.title} starts in 30 minutes.`,
        url,
        tag: `tenpoint-${row.source_type}-${row.source_id}`,
      },
    );
    if (handled > 0) delivered += handled;
  }

  return { attempted, delivered, skipped };
}