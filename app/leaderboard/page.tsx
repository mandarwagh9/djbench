import Link from "next/link";
import { CATALOG } from "@/lib/data";
import { getStandings, storeReady, totalVotes } from "@/lib/store";
import { BASE_RATING } from "@/lib/elo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Standings",
  description: "Which language model reads a dance floor best, ranked by blind listener votes.",
};

export default async function Leaderboard() {
  const live = storeReady();
  const [standings, votes] = live
    ? await Promise.all([getStandings(), totalVotes()])
    : [[], 0];

  const rows = CATALOG.djs
    .map((dj) => {
      const s = standings.find((x) => x.djId === dj.id);
      return {
        dj,
        rating: s?.rating ?? BASE_RATING,
        wins: s?.wins ?? 0,
        losses: s?.losses ?? 0,
        ties: s?.ties ?? 0,
        battles: s?.battles ?? 0,
      };
    })
    .sort((a, b) => b.rating - a.rating || b.battles - a.battles);

  const top = rows[0]?.rating ?? BASE_RATING;
  const floor = Math.min(...rows.map((r) => r.rating));
  const span = Math.max(1, top - floor);

  return (
    <div className="min-h-[100dvh]">
      <div className="etch fixed inset-0 -z-10 opacity-60" />

      <div className="mx-auto max-w-5xl px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b hair pb-3">
          <Link href="/" className="font-display text-lg font-semibold tracking-tight">
            DJbench
          </Link>
          <Link
            href="/"
            className="tnum rounded-[2px] border hair px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-muted hover:text-ink"
          >
            Back to the booth
          </Link>
        </header>

        <section className="py-10">
          <h1 className="font-display text-4xl leading-[1.05] tracking-tighter sm:text-6xl">
            Who reads a room.
          </h1>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">
            Every model gets the same brief and the same crowd. Listeners hear two sets blind and
            pick one. Ratings move on those votes alone.
          </p>
          <p className="tnum mt-5 text-[12px] text-dim">
            {live
              ? `${votes.toLocaleString()} ${votes === 1 ? "ballot" : "ballots"} counted`
              : "Tally offline. Ratings shown at their starting value."}
          </p>
        </section>

        {/* Standings. Numbers are data, so they are mono and tabular throughout. */}
        <section className="border-t hair">
          <div className="tnum grid grid-cols-[2rem_1fr_4.5rem] gap-3 py-3 text-[10px] uppercase tracking-[0.16em] text-dim sm:grid-cols-[2.5rem_1fr_7rem_5rem_4.5rem]">
            <span>#</span>
            <span>Model</span>
            <span className="hidden sm:block">Record</span>
            <span className="hidden sm:block">Battles</span>
            <span className="text-right">Rating</span>
          </div>

          {rows.map((r, i) => (
            <div
              key={r.dj.id}
              className="grid grid-cols-[2rem_1fr_4.5rem] items-center gap-3 border-t hair py-4 sm:grid-cols-[2.5rem_1fr_7rem_5rem_4.5rem]"
            >
              <span className="tnum text-[13px] text-dim">{String(i + 1).padStart(2, "0")}</span>

              <div className="min-w-0">
                <div className="truncate font-display text-[15px] tracking-tight">{r.dj.name}</div>
                <div className="tnum text-[11px] text-dim">{r.dj.lab}</div>
                <div className="mt-2 h-[3px] w-full max-w-[220px] bg-hairline sm:hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${20 + ((r.rating - floor) / span) * 80}%`,
                      background: r.dj.accent,
                    }}
                  />
                </div>
              </div>

              <span className="tnum hidden text-[13px] text-muted sm:block">
                {r.wins}W {r.losses}L {r.ties}T
              </span>
              <span className="tnum hidden text-[13px] text-dim sm:block">{r.battles}</span>

              <span className="tnum text-right text-[15px]" style={{ color: r.dj.accent }}>
                {Math.round(r.rating)}
              </span>
            </div>
          ))}
        </section>

        <section className="mt-14 grid gap-8 border-t hair pt-8 sm:grid-cols-2">
          <div>
            <h2 className="font-display text-xl tracking-tight">How the score moves</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              Elo, the chess rating, applied to sets. Everyone starts at {BASE_RATING}. Beating a
              highly rated model earns more than beating a struggling one, and a tie moves both
              toward each other. A model that has not been heard yet sits at its starting value.
            </p>
          </div>
          <div>
            <h2 className="font-display text-xl tracking-tight">What is being measured</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              Selection and sequencing, not production. No model made any of this music. Each was
              asked which real records it would play, in what order, for a specific room at a
              specific hour, and the audio comes from YouTube.
            </p>
          </div>
        </section>

        <section className="mt-10 border-t hair pt-8">
          <h2 className="font-display text-xl tracking-tight">The roster</h2>
          <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {CATALOG.djs.map((d) => (
              <div key={d.id} className="flex items-baseline justify-between gap-4 border-b hair pb-2">
                <span className="text-[14px]">{d.name}</span>
                <span className="tnum text-right text-[11px] text-dim">{d.model}</span>
              </div>
            ))}
          </div>
          <p className="tnum mt-5 text-[11px] leading-relaxed text-dim">
            Google, OpenAI, DeepSeek and Alibaba models run on Vertex AI. The Anthropic set was
            written by Claude Opus 5 answering the same prompt.
          </p>
        </section>

        <footer className="tnum mt-14 border-t hair py-6 text-[11px] text-dim">
          Catalog of {CATALOG.stats.setCount} sets and {CATALOG.stats.trackCount} selections across{" "}
          {CATALOG.briefs.length} rooms.
        </footer>
      </div>
    </div>
  );
}
