import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return NextResponse.json({ error: "Could not sign you out." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}