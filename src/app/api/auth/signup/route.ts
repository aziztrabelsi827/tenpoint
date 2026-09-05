import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit, ipKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request) {
  if (!rateLimit(ipKey(request.headers, "signup"), 10)) {
    return NextResponse.json(
      { error: "Too many sign-ups from this device. Please wait and try again." },
      { status: 429 },
    );
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
    };
    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const confirmPassword = body.confirmPassword ?? "";

    if (name.length < 2) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }

    // Do not reveal whether the account already exists with a different status
    // code. Supabase returns a generic error for an existing user; we surface a
    // neutral message and let login be the source of truth.
    const supabase = await getSupabaseServerClient();
    const emailRedirectTo = new URL("/auth/callback", request.url).toString();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: { name },
      },
    });

    if (error) {
      // A keyed error from Supabase; avoid leaking which case triggered it.
      if (/already registered|already been registered|exists/i.test(error.message)) {
        return NextResponse.json({ ok: true, alreadyExists: true });
      }
      return NextResponse.json({ error: "Could not create your account." }, { status: 400 });
    }

    const needsConfirmation = !!data.session === false;
    return NextResponse.json({ ok: true, needsConfirmation });
  } catch {
    return NextResponse.json({ error: "Could not create your account." }, { status: 500 });
  }
}
