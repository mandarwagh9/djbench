import { NextResponse } from "next/server";
import { recordVote, storeReady } from "@/lib/store";
import { CATALOG } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!storeReady()) {
    return NextResponse.json({ ok: false, error: "tally unavailable" }, { status: 503 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const ids = new Set(CATALOG.djs.map((d) => d.id));
  const briefs = new Set(CATALOG.briefs.map((b) => b.id));
  const { briefId, aId, bId, winner } = body ?? {};

  const valid =
    typeof briefId === "string" && briefs.has(briefId) &&
    typeof aId === "string" && ids.has(aId) &&
    typeof bId === "string" && ids.has(bId) &&
    aId !== bId &&
    (winner === "tie" || winner === aId || winner === bId);

  if (!valid) return NextResponse.json({ ok: false, error: "invalid ballot" }, { status: 400 });

  try {
    await recordVote({ briefId, aId, bId, winner });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "write failed" }, { status: 500 });
  }
}
