import "server-only";
import { Firestore } from "@google-cloud/firestore";
import { BASE_RATING, updateElo } from "./elo";
import type { Standing } from "./types";

/* Votes live in Firestore. Credentials arrive as a base64 service-account key so the
   whole thing is one environment variable. If it is absent the site still runs: the
   arena works and the reveal happens, only the tally is unavailable. */

let db: Firestore | null | undefined;

function client(): Firestore | null {
  if (db !== undefined) return db;
  const raw = process.env.GCP_SA_KEY;
  if (!raw) {
    db = null;
    return db;
  }
  try {
    const json = JSON.parse(
      raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"),
    );
    db = new Firestore({
      projectId: json.project_id,
      credentials: { client_email: json.client_email, private_key: json.private_key },
    });
  } catch {
    db = null;
  }
  return db;
}

export const storeReady = () => client() !== null;

const STANDINGS = "standings";
const VOTES = "votes";

export type BallotResult = "ok" | "duplicate" | "rate-limited";

const WINDOW_MS = 60 * 60 * 1000;  // rolling hour
const MAX_PER_WINDOW = 40;         // there are only 90 pairings, so this is generous for a real listener

/* One transaction does the whole ballot: rate check, duplicate check, both Elo updates and the
   vote log. Reads first, writes second, as Firestore requires. A listener gets one vote per
   pairing, which makes casual stuffing cost more than a curl loop. */
export async function recordVote(v: {
  briefId: string;
  aId: string;
  bId: string;
  winner: string; // a dj id, or "tie"
  voter: string;  // salted hash of the caller, never a raw address
  pairKey: string;
}): Promise<BallotResult> {
  const fs = client();
  if (!fs) throw new Error("vote store unavailable");

  const aRef = fs.collection(STANDINGS).doc(v.aId);
  const bRef = fs.collection(STANDINGS).doc(v.bId);
  const rateRef = fs.collection("rate").doc(v.voter);
  const ballotRef = fs.collection("ballots").doc(`${v.voter}__${v.pairKey}`);

  return fs.runTransaction<BallotResult>(async (tx) => {
    const [aSnap, bSnap, rateSnap, ballotSnap] = await tx.getAll(aRef, bRef, rateRef, ballotRef);

    if (ballotSnap.exists) return "duplicate";

    const now = Date.now();
    const rate = (rateSnap.data() as { n: number; since: number } | undefined) ?? { n: 0, since: now };
    const fresh = now - rate.since > WINDOW_MS ? { n: 0, since: now } : rate;
    if (fresh.n >= MAX_PER_WINDOW) return "rate-limited";

    const a = (aSnap.data() as Standing | undefined) ?? blank(v.aId);
    const b = (bSnap.data() as Standing | undefined) ?? blank(v.bId);

    const score = v.winner === "tie" ? 0.5 : v.winner === v.aId ? 1 : 0;
    const next = updateElo(a.rating, b.rating, score);

    a.rating = next.a;
    b.rating = next.b;
    a.battles += 1;
    b.battles += 1;
    if (score === 1) { a.wins += 1; b.losses += 1; }
    else if (score === 0) { a.losses += 1; b.wins += 1; }
    else { a.ties += 1; b.ties += 1; }

    tx.set(aRef, a);
    tx.set(bRef, b);
    tx.set(rateRef, { n: fresh.n + 1, since: fresh.since });
    tx.set(ballotRef, { at: now });
    tx.set(fs.collection(VOTES).doc(), {
      briefId: v.briefId, aId: v.aId, bId: v.bId, winner: v.winner, at: new Date(now).toISOString(),
    });
    return "ok";
  });
}

const blank = (djId: string): Standing => ({
  djId,
  rating: BASE_RATING,
  wins: 0,
  losses: 0,
  ties: 0,
  battles: 0,
});

export async function getStandings(): Promise<Standing[]> {
  const fs = client();
  if (!fs) return [];
  const snap = await fs.collection(STANDINGS).get();
  return snap.docs.map((d) => d.data() as Standing);
}

export async function totalVotes(): Promise<number> {
  const fs = client();
  if (!fs) return 0;
  const agg = await fs.collection(VOTES).count().get();
  return agg.data().count;
}
