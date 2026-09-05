import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Health is unauthenticated: it only checks connectivity to the database,
  // never touches a user's data. The Supabase client enumerates the public
  // health of the compute from the client's own roles.
  try {
    const supabase = await getSupabaseServerClient();
    // A cheap RPC that is PUBLIC-executable and proves the Supabase
    // (PostgREST/Postgres) stack is reachable without touching user data.
    const { error } = await supabase.rpc("health_check");
    if (error) return Response.json({ ok: false }, { status: 500 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
