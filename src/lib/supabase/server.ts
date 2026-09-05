import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

export type ServerCookieOptions = {
  /**
   * Session persistence for the auth cookie(s).
   * - a positive number -> cookie lives that many seconds (e.g. "Keep me logged
   *   in" -> 90 days).
   * - 0 -> session cookie: held only for the life of the browser session and
   *   cleared when the browser closes.
   * - undefined -> leave @supabase/ssr's default behaviour.
   */
  maxAge?: number;
};

/**
 * Server-side Supabase client bound to the current request's cookies.
 *
 * This is the correct pattern for Next.js App Router SSR: the client is created
 * per request (server components have no shared mutable request state) and reads
 * the session from the httpOnly cookie with a mutation-safe wrapper so refreshed
 * tokens are written straight back into the cookie jar.
 *
 * `maxAge` overrides the auth cookie's lifetime. `@supabase/ssr` hard-codes a
 * 400-day Max-Age in its own cookie options, so we force our value here in the
 * `setAll` hook (applied to every auth cookie it writes). This is what makes
 * "Keep me logged in" actually control persistence:
 *   - `maxAge: 0` (unchecked) -> a true *session* cookie (no Max-Age/Expires),
 *     stored for the browser session and cleared when the browser closes. Note
 *     we must emit NO `Max-Age=0`, because browsers treat `Max-Age=0` as a
 *     cookie deletion and would never persist the session at all.
 *   - `maxAge: 90 days` (checked) -> a long-lived cookie that survives restarts.
 */
export async function getSupabaseServerClient(cookieOptions?: ServerCookieOptions) {
  const cookieStore = await cookies();
  const maxAge = cookieOptions?.maxAge;
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const writeOptions = { ...(options ?? {}) } as Record<string, unknown>;
            if (maxAge !== undefined) {
              if (maxAge > 0) {
                // Long-lived cookie: set an explicit Max-Age in seconds.
                writeOptions.maxAge = maxAge;
              } else {
                // "Keep me logged in" unchecked -> a real *session* cookie.
                // Browsers interpret "Max-Age=0" as a cookie *deletion*, so we
                // must omit both Max-Age and Expires entirely. That makes the
                // browser keep the cookie for the current session and clear it
                // when the browser is closed.
                delete writeOptions.maxAge;
                delete writeOptions.expires;
              }
            }
            cookieStore.set(name, value, writeOptions);
          });
        } catch {
          // The `setAll` was called from a Server Component. This can be
          // ignored if you have proxy refreshing user sessions.
        }
      },
    },
  });
}
