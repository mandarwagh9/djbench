import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { CATALOG } from "./data";
import type { Brief, Track } from "./types";

/* A battle handed to the browser carries no model identity at all: not a name, not a lab,
   not even a dj id. The pairing travels as an encrypted token that only the server can
   open, so "blind" holds against devtools and against reading the RSC payload, and the
   reveal can only come back from the vote response. */

const key = () =>
  createHash("sha256").update(process.env.GCP_SA_KEY || "djbench-local-dev").digest();

/* AES-256-GCM, not a signature. A signed-but-readable token would still have published the
   pairing: base64 is an encoding, not a secret. GCM also authenticates, so a forged or edited
   token fails to decrypt rather than opening. */
function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

function unseal(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export type AnonBattle = {
  token: string;
  brief: Brief;
  a: { read: string; tracks: Track[] };
  b: { read: string; tracks: Track[] };
};

type Pairing = { briefId: string; aId: string; bId: string };

export function mintBattle(exclude?: string): AnonBattle | null {
  const pairs: Pairing[] = [];
  for (const brief of CATALOG.briefs) {
    const ids = CATALOG.sets.filter((s) => s.briefId === brief.id).map((s) => s.djId);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        pairs.push({ briefId: brief.id, aId: ids[i], bId: ids[j] });
  }
  if (!pairs.length) return null;

  const fresh = exclude ? pairs.filter((p) => `${p.briefId}:${p.aId}:${p.bId}` !== exclude) : pairs;
  const pool = fresh.length ? fresh : pairs;
  let pick = pool[Math.floor(Math.random() * pool.length)];
  // Which model sits on deck A is randomised too, so side never correlates with identity.
  if (Math.random() < 0.5) pick = { briefId: pick.briefId, aId: pick.bId, bId: pick.aId };

  const brief = CATALOG.briefs.find((x) => x.id === pick.briefId)!;
  const setA = CATALOG.sets.find((s) => s.djId === pick.aId && s.briefId === pick.briefId)!;
  const setB = CATALOG.sets.find((s) => s.djId === pick.bId && s.briefId === pick.briefId)!;

  return {
    token: seal(JSON.stringify({ ...pick, t: Date.now() })),
    brief,
    a: { read: setA.read, tracks: setA.tracks },
    b: { read: setB.read, tracks: setB.tracks },
  };
}

/** Opens a token minted by this server. Returns null for anything forged or malformed. */
export function openBattle(token: unknown): Pairing | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const plain = unseal(token);
  if (!plain) return null;
  try {
    const p = JSON.parse(plain);
    const ids = new Set(CATALOG.djs.map((d) => d.id));
    const briefs = new Set(CATALOG.briefs.map((b) => b.id));
    if (!briefs.has(p.briefId) || !ids.has(p.aId) || !ids.has(p.bId) || p.aId === p.bId) return null;
    return { briefId: p.briefId, aId: p.aId, bId: p.bId };
  } catch {
    return null;
  }
}

export const pairKey = (p: Pairing) =>
  `${p.briefId}__${[p.aId, p.bId].sort().join("__")}`;
