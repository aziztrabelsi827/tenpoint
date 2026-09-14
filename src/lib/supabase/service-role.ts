import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

/**
 * Service-role Supabase client for server-only background work.
 *
 * This client BYPASSES RLS, so it must ONLY ever be used in server-side,
 * trusted code paths (the reminder cron processor here). It is never imported
 * by client components, never shipped to the browser, and never used to serve
 * a single user's request — user-facing data access stays on the authenticated
 * RLS-enforced client.
 */
export async function getServiceRoleClient(): Promise<SupabaseClient> {
  const key = SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured for the reminder processor.");
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}