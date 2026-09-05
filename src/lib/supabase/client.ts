"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

/**
 * Browser-side Supabase client.
 *
 * This is a SINGLE instance created once and reused, so we never re-create the
 * client (or a fresh session) on every render. It uses the default cookie-based
 * storage that `@supabase/ssr` wires up against the current request cookies.
 */
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}
