import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit, ipKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Session lifetime when "Keep me logged in" is checked (90 days). */
const KEEP_ME_LOGGED_IN_MAX_AGE = 60 * 60 * 24 * 90;

export async function POST(request: Request) {
  if (!rateLimit(ipKey(request.headers, "login"), 20)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      keepLoggedIn?: boolean;
    };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const keepLoggedIn = body.keepLoggedIn === true;

    if (!EMAIL_RE.test(email) || password.length === 0) {
      return NextResponse.json(
        { error: "Email or password is incorrect." },
        { status: 401 },
      );
    }

    // "Keep me logged in" controls the auth cookie's persistence:
    // - checked  -> a long-lived cookie so the session survives browser restarts.
    // - unchecked-> a session cookie (Max-Age 0) that ends when the browser
    //   closes, so the user is not silently kept signed in across restarts.
    const maxAge = keepLoggedIn ? KEEP_ME_LOGGED_IN_MAX_AGE : 0;
    const supabase = await getSupabaseServerClient({ maxAge });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    // Same message for unknown account and wrong password so accounts cannot be
    // enumerated through the login form.
    if (error || !data.session) {
      return NextResponse.json(
        { error: "Email or password is incorrect." },
        { status: 401 },
      );
    }

    const name =
      data.user?.user_metadata?.name ||
      (Array.isArray(data.user?.user_metadata?.full_name)
        ? (data.user?.user_metadata?.full_name as string[]).join(" ")
        : "") ||
      "";

    return NextResponse.json({ ok: true, name });
  } catch {
    return NextResponse.json({ error: "Could not sign you in." }, { status: 500 });
  }
}
