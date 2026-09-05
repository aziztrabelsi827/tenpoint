import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Allow-list for the user-supplied `next` query parameter so the callback can
 * never be abused as an open redirect. Only safe internal paths are permitted:
 * they must start with a single "/" and must NOT be a protocol-relative URL
 * ("//evil.com") or an absolute URL. Anything else falls back to /dashboard.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  if (/^\/[^/]/.test(raw) === false) return "/dashboard";
  return raw;
}

/**
 * Supabase Auth callback / exchange route.
 *
 * After an email confirmation or a password-recovery link is clicked, Supabase
 * redirects here with a `code` (and, for recovery, a `type=recovery`). We
 * exchange the code for a session / refresh the token so the resulting pages
 * (dashboard after signup-confirmation, reset-password after recovery) run with
 * a valid authenticated context.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const type = searchParams.get("type");

  const isRecovery = type === "recovery";

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV !== "production";
      const redirectTo = new URL(
        isRecovery ? "/reset-password" : safeNext(next),
        isLocalEnv ? origin : `https://${forwardedHost ?? new URL(request.url).host}`,
      ).toString();
      return NextResponse.redirect(redirectTo);
    }
  }

  if (isRecovery) {
    return NextResponse.redirect(new URL("/reset-password", origin));
  }

  // No usable code — send the user home where they can log in.
  return NextResponse.redirect(new URL("/login", origin));
}
