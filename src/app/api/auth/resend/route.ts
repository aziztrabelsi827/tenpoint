import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit, ipKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Resends the signup confirmation email for an unconfirmed account.
 *
 * This delegates to Supabase Auth's own `resend()` flow — TenPoint does NOT
 * generate confirmation tokens or send emails itself. Supabase Auth remains
 * responsible for the confirmation flow; the delivery provider (e.g. Resend
 * via Supabase Custom SMTP) is configured server-side in the project settings.
 *
 * We intentionally return a generic `{ ok: true }` for any well-formed email so
 * an attacker cannot enumerate which addresses have an (unconfirmed) account.
 */
export async function POST(request: Request) {
  if (!rateLimit(ipKey(request.headers, "resend"), 3)) {
    return NextResponse.json(
      { error: "Too many resend requests. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const emailRedirectTo = new URL("/auth/callback", request.url).toString();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    // Never leak provider details or whether the address is registered. The
    // user simply retries later if their confirmation email did not arrive.
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true });
}
