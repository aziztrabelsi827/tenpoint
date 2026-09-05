import { NextResponse } from "next/server";
import { requireUserContext, requireUserId, updateDisplayName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireUserContext();
  if (ctx === null) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  return NextResponse.json({ ok: true, userId: ctx.userId, name: ctx.user.name });
}

export async function PATCH(request: Request) {
  const ctx = await requireUserContext();
  if (ctx === null) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim();
  if (name.length === 0) return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  try {
    await updateDisplayName(ctx.userId, name);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your display name." },
      { status: 500 },
    );
  }
  // Re-read from the authoritative source (profiles.display_name) so we always
  // return exactly what gDS persists, with correct precedence.
  const fresh = await requireUserContext();
  return NextResponse.json({ ok: true, name: fresh?.user.name?.trim() || name });
}
