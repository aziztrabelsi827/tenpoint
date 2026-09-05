import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit, ipKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Sets a new password from a recovery session.
 *
 * This uses Supabase Auth's own updateUser, which requires the active recovery
 * session established when the user clicked the magic link they received by
 * email. There is no custom password reset system.
 */
export async function POST(request: Request) {
  if (!rateLimit(ipKey(request.headers, "reset"), 10)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    confirmPassword?: string;
  };
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json(
      { error: "Your reset link is invalid or has expired. Please request a new one." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
