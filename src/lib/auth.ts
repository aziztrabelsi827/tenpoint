import "server-only";
import { redirect } from "next/navigation";
import { ensureSettings } from "@/lib/data";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Authentication (Supabase Auth)
 * ==============================
 * TenPoint is a multi-user application. Each account owns its own habits,
 * occurrences, logs, tasks, progress, events, focus sessions and settings, and
 * every app record ultimately belongs to `auth.users.id`.
 *
 * Sessions are managed entirely by Supabase Auth and stored in httpOnly cookies
 * by the SSRF-aware server client. There is NO custom JWT, custom password
 * hashing, or separate cookie session here — the Supabase session is the single
 * source of truth.
 *
 * All user-owned data access goes through the authenticated Supabase client so
 * ROW LEVEL SECURITY (`user_id = auth.uid()`) is enforced at the database. The
 * authenticated user id is always the authority — it is never taken from the
 * request body or query string.
 */

export type SessionUser = { id: string; email: string; name: string };

/* ---------------- session --------------- */

/**
 * Resolves the authenticated user and an authenticated Supabase client in ONE
 * call. Routes use this so they get both the client (used for RLS-enforced
 * data access) and the authoritative user id without a second session lookup.
 */
export async function requireUserContext(): Promise<{
  supabase: SupabaseClient;
  userId: string;
  user: SessionUser;
} | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let name = "";
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, display_name")
      .eq("id", user.id)
      .single();
    name = (
      profile?.display_name ||
      profile?.full_name ||
      user.user_metadata?.name ||
      ""
    ).toString();
  } catch {
    // Profile may not be provisioned yet; fall back to metadata.
    name = (user.user_metadata?.name || "").toString();
  }

  return {
    supabase,
    userId: user.id,
    user: { id: user.id, email: user.email ?? "", name: name.trim() },
  };
}

/**
 * Resolves the authenticated user from the Supabase session.
 * Returns null when there is no valid session.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const ctx = await requireUserContext();
  return ctx?.user ?? null;
}

/* ---------------- route guards ---------------- */

/**
 * Guard for API route handlers. Returns the authenticated user id (a uuid), or
 * null when unauthenticated. Routes respond with a 401 when null.
 */
export async function requireUserId(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.id ?? null;
}

/**
 * Guard for server components. Redirects to /login when unauthenticated and
 * provisions the account's settings row on first visit.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  await ensureSettings(user.id);
  return user;
}

/* ---------------- profile ---------------- */

/** Updates the user's display name on their own profile row. Throws on DB error. */
export async function updateDisplayName(userId: string, name: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name.trim().slice(0, 60), updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    throw new Error(`Failed to update display name: ${error.message}`);
  }
}
