import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit, ipKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Requests a password reset email via Supabase Auth's recovery flow.
 *
 * We always return an ok response for any syntactically-valid email so that an
 * attacker cannot enumerate which addresses have an account.
 */
export async function POST(request: Request) {
  if (!rateLimit(ipKey(request.headers, "forgot"), 10)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const resetRedirect = new URL(
    "/reset-password",
    new URL(request.url).origin,
  ).toString();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetRedirect,
  });
  if (error) {
    // Swallow the error so account enumeration is not possible.
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true });
}
