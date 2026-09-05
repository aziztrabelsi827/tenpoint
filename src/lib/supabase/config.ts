/**
 * Shared Supabase configuration.
 *
 * URL + anon key are safe for the browser (they are public). The service role
 * key MUST NEVER reach the client — it lives only in server-only modules and is
 * used solely for trusted server-side administrative tasks (e.g. writing a
 * user's profile during sign-up via a server route).
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
    (SUPABASE_ANON_KEY.startsWith("eyJ") ||
      // Local dev / custom gateway keys can be non-JWT; treat a missing anon
      // key as a hard error at auth time instead.
      SUPABASE_ANON_KEY.length > 0),
);
