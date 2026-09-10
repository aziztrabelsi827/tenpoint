import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth";
import { ensureSettings } from "@/lib/data";
import { isValidTimezone, normaliseTimezone, todayInZone } from "@/lib/timezone";
import type { SettingsDTO } from "@/lib/types";

const THEMES = ["soft", "productivity", "dark", "nature", "brutalist", "sunset", "aurora", "paper", "custom"];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(request: Request) {
  const ctx = await requireUserContext();
  if (!ctx) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { supabase, userId } = ctx;

  await ensureSettings(userId);
  const body = (await request.json()) as Partial<SettingsDTO>;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.theme === "string" && THEMES.includes(body.theme)) patch.theme = body.theme;

  /**
   * Timezone is the source of truth for the user's calendar day. Only accept a
   * valid IANA identifier — never an arbitrary string or a bare offset.
   */
  if (typeof body.timezone === "string" && isValidTimezone(body.timezone)) {
    patch.timezone = normaliseTimezone(body.timezone);
  }
  /**
   * Explicit camelCase (DTO/request) -> snake_case (database column) mapping.
   * Never rely on implicit conversion — PostgREST silently drops keys that do
   * not match an actual column, which would cause silent data loss.
   */
  if (typeof body.customPrimary === "string" && HEX_RE.test(body.customPrimary)) patch.custom_primary = body.customPrimary;
  if (typeof body.customAccent === "string" && HEX_RE.test(body.customAccent)) patch.custom_accent = body.customAccent;
  if (typeof body.customBackground === "string" && HEX_RE.test(body.customBackground)) patch.custom_background = body.customBackground;
  if (typeof body.customCard === "string" && HEX_RE.test(body.customCard)) patch.custom_card = body.customCard;
  if (typeof body.customRadius === "number") patch.custom_radius = Math.max(0, Math.min(28, Math.round(body.customRadius)));
  if (body.customMode === "light" || body.customMode === "dark") patch.custom_mode = body.customMode;
  if (typeof body.focusMinutes === "number") patch.focus_minutes = Math.max(1, Math.min(180, Math.round(body.focusMinutes)));
  if (typeof body.shortBreakMinutes === "number") patch.short_break_minutes = Math.max(1, Math.min(60, Math.round(body.shortBreakMinutes)));
  if (typeof body.longBreakMinutes === "number") patch.long_break_minutes = Math.max(1, Math.min(90, Math.round(body.longBreakMinutes)));
  if (typeof body.sessionsBeforeLongBreak === "number") patch.sessions_before_long_break = Math.max(2, Math.min(8, Math.round(body.sessionsBeforeLongBreak)));

  const { error: updateError } = await supabase
    .from("user_settings")
    .update(patch)
    .eq("user_id", userId);
  if (updateError) {
    return NextResponse.json({ ok: false, error: "Could not save settings." }, { status: 500 });
  }

  // Return the AUTHORITATIVE saved settings straight from the database — not an
  // echo of the request body — so the client reflects what actually persisted.
  const row = await ensureSettings(userId);
  return NextResponse.json({
    ok: true,
    settings: row,
    timezone: row.timezone,
    today: todayInZone(row.timezone),
  });
}

export const dynamic = "force-dynamic";
