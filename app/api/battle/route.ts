import { NextResponse } from "next/server";
import { mintBattle } from "@/lib/battle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hands out the next anonymous pairing. `exclude` lets the client avoid repeating
// the battle it just judged without ever learning who was in it.
export async function GET(req: Request) {
  const exclude = new URL(req.url).searchParams.get("exclude") ?? undefined;
  const battle = mintBattle(exclude && exclude.length < 200 ? exclude : undefined);
  if (!battle) return NextResponse.json({ error: "no battles" }, { status: 503 });
  return NextResponse.json(battle, { headers: { "cache-control": "no-store" } });
}
