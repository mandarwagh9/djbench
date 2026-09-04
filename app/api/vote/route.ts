import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { recordVote, storeReady } from "@/lib/store";
import { openBattle, pairKey } from "@/lib/battle";
import { CATALOG } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Identity is revealed here and nowhere earlier. The browser sends back the opaque token it
   was given plus a side, so it never had to know which model it was judging. */

function voterHash(req: Request) {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  // Salted with a server secret and stored only as a digest, so no address is retained.
  return createHash("sha256")
    .update(`${ip}|${process.env.GCP_SA_KEY?.slice(0, 32) ?? "dev"}`)
    .digest("hex")
    .slice(0, 32);
}

const pub = (id: string) => {
  const d = CATALOG.djs.find((x) => x.id === id)!;
  return { id: d.id, name: d.name, lab: d.lab, model: d.model, accent: d.accent };
};

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

  const pairing = openBattle(body?.token);
  const side = body?.winner;
  if (!pairing || !["a", "b", "tie"].includes(side)) {
    return NextResponse.json({ ok: false, error: "invalid ballot" }, { status: 400 });
  }

  const winner = side === "tie" ? "tie" : side === "a" ? pairing.aId : pairing.bId;
  const reveal = { a: pub(pairing.aId), b: pub(pairing.bId) };

  try {
    const result = await recordVote({
      ...pairing,
      winner,
      voter: voterHash(req),
      pairKey: pairKey(pairing),
    });
    // A duplicate or throttled ballot still reveals the decks: the listener did the listening,
    // they just do not get to move the rating twice.
    return NextResponse.json({ ok: true, counted: result === "ok", result, reveal });
  } catch {
    return NextResponse.json({ ok: false, error: "write failed", reveal }, { status: 500 });
  }
}
