"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useDecks } from "@/lib/useDecks";
import { Waveform } from "./Waveform";
import type { Brief, Dj, DjSet } from "@/lib/types";

type Side = "a" | "b";
type Verdict = Side | "tie";

const CH_A = "#d6f94a";
const CH_B = "#4ad9f9";

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

export function Arena({
  brief,
  setA,
  setB,
  djA,
  djB,
  onNextBattle,
}: {
  brief: Brief;
  setA: DjSet;
  setB: DjSet;
  djA: Dj;
  djB: Dj;
  onNextBattle: () => void;
}) {
  const mountA = useRef<HTMLDivElement>(null);
  const mountB = useRef<HTMLDivElement>(null);
  const deck = useDecks(setA.tracks, setB.tracks, mountA, mountB);

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [sending, setSending] = useState(false);
  const [peek, setPeek] = useState(false);
  const [heard, setHeard] = useState({ a: false, b: false });

  const len = Math.min(setA.tracks.length, setB.tracks.length);
  const tA = setA.tracks[deck.index];
  const tB = setB.tracks[deck.index];
  const hold = tA?.playSec ?? 45;
  const progress = Math.max(0, Math.min(1, deck.elapsed / hold));

  // A vote only counts once the listener has actually sat on both channels.
  useEffect(() => {
    if (!deck.started) return;
    if (deck.crossfade <= 0.35) setHeard((h) => (h.a ? h : { ...h, a: true }));
    if (deck.crossfade >= 0.65) setHeard((h) => (h.b ? h : { ...h, b: true }));
  }, [deck.crossfade, deck.started]);

  const canVote = heard.a && heard.b && !verdict;

  const cast = useCallback(
    async (v: Verdict) => {
      if (sending || verdict) return;
      setSending(true);
      setVerdict(v);
      try {
        await fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            briefId: brief.id,
            aId: djA.id,
            bId: djB.id,
            winner: v === "tie" ? "tie" : v === "a" ? djA.id : djB.id,
          }),
        });
      } catch {
        /* the reveal still stands locally if the tally cannot be reached */
      } finally {
        setSending(false);
      }
    },
    [brief.id, djA.id, djB.id, sending, verdict],
  );

  // Console shortcuts. A booth is played with hands, not menus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.key !== "Escape") return;
      if (e.code === "Space") {
        e.preventDefault();
        deck.started ? deck.togglePlay() : deck.start();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        deck.setCrossfade(Math.max(0, deck.crossfade - 0.12));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        deck.setCrossfade(Math.min(1, deck.crossfade + 0.12));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        deck.next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deck]);

  // Applied inside the quarter-scale layer, so 7px reads as roughly 28px on screen.
  const blur = peek ? "1.5px" : "7px";
  // Peeking pulls the scrim back so the listener can confirm the audio is real YouTube.
  const scrim = peek ? "rgba(10,10,11,.34)" : "rgba(10,10,11,.76)";

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      {/* Real YouTube playback, treated as club projection and cross dissolved by the fader. */}
      <div className="fixed inset-0 z-0" aria-hidden="true">
        <div
          className="ytwrap transition-opacity duration-200"
          style={{ opacity: 1 - deck.crossfade, ["--proj-blur" as string]: blur }}
        >
          <div ref={mountA} className="h-full w-full" />
        </div>
        <div
          className="ytwrap transition-opacity duration-200"
          style={{ opacity: deck.crossfade, ["--proj-blur" as string]: blur }}
        >
          <div ref={mountB} className="h-full w-full" />
        </div>
        <div className="absolute inset-0 transition-colors duration-300" style={{ background: scrim }} />
        <div className="etch absolute inset-0 opacity-70" />
      </div>

      {/* ENTRY GATE. Also supplies the user gesture browsers require before audio. */}
      {!deck.started && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-base/94 px-5">
          <div className="w-full max-w-2xl">
            <h1 className="font-display text-5xl leading-[1.02] tracking-tighter sm:text-7xl">
              Two models.
              <br />
              One room.
            </h1>
            <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-muted">
              Both were handed the same crowd and told to pick a set. You decide who read the room.
            </p>

            <div className="mt-8 border-y hair py-5">
              <div className="tnum text-[11px] uppercase tracking-[0.2em] text-dim">
                Tonight
              </div>
              <div className="mt-2 font-display text-2xl tracking-tight">{brief.title}</div>
              <p className="mt-2 max-w-[54ch] text-sm leading-relaxed text-muted">{brief.situation}</p>
            </div>

            <button
              onClick={deck.start}
              disabled={!deck.ready}
              className="mt-8 w-full rounded-[2px] bg-cha px-8 py-4 font-display text-base font-semibold tracking-tight text-base transition-opacity hover:opacity-90 disabled:opacity-40 sm:w-auto"
            >
              {deck.ready ? "Drop the needle" : "Loading decks"}
            </button>
            <p className="tnum mt-4 text-[11px] text-dim">
              Audio plays from YouTube. Headphones recommended.
            </p>
          </div>
        </div>
      )}

      {/* CONSOLE */}
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-[1400px] flex-col px-4 py-4 sm:px-6">
        <header className="flex items-center justify-between gap-4 border-b hair pb-3">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-lg font-semibold tracking-tight">DJbench</span>
            <span className="tnum hidden text-[11px] uppercase tracking-[0.18em] text-dim sm:inline">
              {brief.title}
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <button
              onClick={() => setPeek((p) => !p)}
              className="tnum rounded-[2px] border hair px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-muted hover:text-ink"
            >
              {peek ? "Hide video" : "Show video"}
            </button>
            <Link
              href="/leaderboard"
              className="tnum rounded-[2px] border hair px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-muted hover:text-ink"
            >
              Standings
            </Link>
          </nav>
        </header>

        {/* Brief strip */}
        <section className="grid gap-x-8 gap-y-2 border-b hair py-3 sm:grid-cols-[auto_1fr_auto]">
          <div className="tnum text-[11px] uppercase tracking-[0.16em] text-dim">
            {brief.clock} · {brief.venue.split(".")[0]}
          </div>
          <p className="text-[13px] leading-snug text-muted">{brief.crowd}</p>
          <div className="tnum text-[11px] uppercase tracking-[0.16em] text-dim">
            Track {deck.index + 1} of {len}
          </div>
        </section>

        {/* Decks and mixer */}
        <main className="grid flex-1 items-center gap-4 py-4 lg:grid-cols-[1fr_auto_1fr]">
          <DeckPanel
            side="a"
            label="Deck A"
            color={CH_A}
            gain={1 - deck.crossfade}
            track={tA}
            progress={progress}
            index={deck.index}
            total={len}
            elapsed={deck.elapsed}
            hold={hold}
            failed={deck.failed.a}
            revealed={!!verdict}
            dj={djA}
            read={setA.read}
            tracks={setA.tracks}
          />

          <Mixer
            deck={deck}
            canVote={canVote}
            verdict={verdict}
            heard={heard}
            onVote={cast}
            sending={sending}
          />

          <DeckPanel
            side="b"
            label="Deck B"
            color={CH_B}
            gain={deck.crossfade}
            track={tB}
            progress={progress}
            index={deck.index}
            total={len}
            elapsed={deck.elapsed}
            hold={hold}
            failed={deck.failed.b}
            revealed={!!verdict}
            dj={djB}
            read={setB.read}
            tracks={setB.tracks}
          />
        </main>
      </div>

      {verdict && (
        <Reveal
          verdict={verdict}
          djA={djA}
          djB={djB}
          setA={setA}
          setB={setB}
          brief={brief}
          onNext={onNextBattle}
        />
      )}
    </div>
  );
}

function DeckPanel(props: {
  side: Side;
  label: string;
  color: string;
  gain: number;
  track: any;
  progress: number;
  index: number;
  total: number;
  elapsed: number;
  hold: number;
  failed: boolean;
  revealed: boolean;
  dj: Dj;
  read: string;
  tracks: any[];
}) {
  const { label, color, gain, track, progress, failed, revealed, dj, read, tracks, index, elapsed, hold } = props;
  const live = gain > 0.5;
  if (!track) return null;

  return (
    <section className="face rounded-[2px] border hair p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${live ? "live-dot" : ""}`}
            style={{ background: live ? color : "#3a3a44" }}
          />
          <span className="tnum text-[11px] uppercase tracking-[0.2em]" style={{ color: live ? color : "#8b8b95" }}>
            {label}
          </span>
        </div>
        <span className="tnum text-[11px] text-dim">
          {revealed ? `${dj.name} · ${dj.lab}` : "Identity hidden"}
        </span>
      </div>

      <div className="mt-3">
        <Waveform wave={track.wave} progress={progress} color={color} active={live} />
      </div>

      <div className="tnum mt-1 flex justify-between text-[10px] text-dim">
        <span>{clock(elapsed)}</span>
        <span>{clock(hold)}</span>
      </div>

      <div className="mt-3 min-h-[76px]">
        <div className="font-display text-lg leading-tight tracking-tight">{track.title}</div>
        <div className="text-sm text-muted">{track.artist}</div>
        <div className="tnum mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-dim">
          {track.year && <span>{track.year}</span>}
          {track.bpm && <span>{track.bpm} BPM</span>}
          {failed && <span className="text-live">Video unavailable</span>}
        </div>
      </div>

      <p className="mt-3 border-t hair pt-3 text-[13px] leading-snug text-muted">
        <span className="text-dim">Why here. </span>
        {track.why}
      </p>

      {revealed && (
        <div className="mt-3 border-t hair pt-3">
          <p className="text-[13px] leading-snug text-muted">
            <span className="text-dim">The read. </span>
            {read}
          </p>
          <ol className="tnum mt-3 space-y-1 text-[11px]">
            {tracks.map((t: any, i: number) => (
              <li key={i} className={i === index ? "text-ink" : "text-dim"}>
                <span style={{ color: i === index ? color : undefined }}>{String(i + 1).padStart(2, "0")}</span>{" "}
                {t.artist}, {t.title}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function Mixer({
  deck,
  canVote,
  verdict,
  heard,
  onVote,
  sending,
}: {
  deck: ReturnType<typeof useDecks>;
  canVote: boolean;
  verdict: Verdict | null;
  heard: { a: boolean; b: boolean };
  onVote: (v: Verdict) => void;
  sending: boolean;
}) {
  const x = deck.crossfade;
  return (
    <section className="face flex w-full flex-col items-center gap-4 rounded-[2px] border hair p-4 lg:w-[248px]">
      <div className="tnum text-[11px] uppercase tracking-[0.2em] text-dim">Crossfader</div>

      <div className="flex w-full items-center gap-3">
        <span className="tnum text-[11px]" style={{ color: CH_A, opacity: 0.4 + (1 - x) * 0.6 }}>
          A
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={x}
          onChange={(e) => deck.setCrossfade(parseFloat(e.target.value))}
          aria-label="Crossfade between deck A and deck B"
          className="h-12 w-full"
          style={{
            background: `linear-gradient(90deg, ${CH_A}44, #22222a 46%, #22222a 54%, ${CH_B}44)`,
            borderRadius: 2,
          }}
        />
        <span className="tnum text-[11px]" style={{ color: CH_B, opacity: 0.4 + x * 0.6 }}>
          B
        </span>
      </div>

      <div className="flex w-full gap-2">
        <button
          onClick={deck.togglePlay}
          className="tnum flex-1 rounded-[2px] border hair py-2 text-[11px] uppercase tracking-[0.12em] text-muted hover:text-ink"
        >
          {deck.playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={deck.next}
          className="tnum flex-1 rounded-[2px] border hair py-2 text-[11px] uppercase tracking-[0.12em] text-muted hover:text-ink"
        >
          Next
        </button>
      </div>

      <div className="w-full border-t hair pt-4">
        <div className="tnum text-[11px] uppercase tracking-[0.2em] text-dim">Who read the room</div>

        <div className="mt-3 flex flex-col gap-2">
          <button
            disabled={!canVote || sending}
            onClick={() => onVote("a")}
            className="rounded-[2px] py-3 font-display text-sm font-semibold tracking-tight text-base transition-opacity hover:opacity-90 disabled:opacity-25"
            style={{ background: CH_A }}
          >
            Deck A
          </button>
          <button
            disabled={!canVote || sending}
            onClick={() => onVote("b")}
            className="rounded-[2px] py-3 font-display text-sm font-semibold tracking-tight text-base transition-opacity hover:opacity-90 disabled:opacity-25"
            style={{ background: CH_B }}
          >
            Deck B
          </button>
          <button
            disabled={!canVote || sending}
            onClick={() => onVote("tie")}
            className="tnum rounded-[2px] border hair py-2.5 text-[11px] uppercase tracking-[0.12em] text-muted hover:text-ink disabled:opacity-25"
          >
            Too close to call
          </button>
        </div>

        {!verdict && !canVote && (
          <p className="mt-3 text-[12px] leading-snug text-dim">
            Ride the fader to both ends before you vote.{" "}
            <span style={{ color: heard.a ? CH_A : undefined }}>A {heard.a ? "heard" : "pending"}</span>
            {", "}
            <span style={{ color: heard.b ? CH_B : undefined }}>B {heard.b ? "heard" : "pending"}</span>
            {"."}
          </p>
        )}
      </div>
    </section>
  );
}

function Reveal({
  verdict,
  djA,
  djB,
  setA,
  setB,
  brief,
  onNext,
}: {
  verdict: Verdict;
  djA: Dj;
  djB: Dj;
  setA: DjSet;
  setB: DjSet;
  brief: Brief;
  onNext: () => void;
}) {
  const winner = verdict === "tie" ? null : verdict === "a" ? djA : djB;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t hair bg-panel/97 px-4 py-4 backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="tnum text-[11px] uppercase tracking-[0.2em] text-dim">Decks revealed</div>
          <div className="mt-1.5 font-display text-xl tracking-tight">
            <span style={{ color: CH_A }}>{djA.name}</span>
            <span className="text-dim"> against </span>
            <span style={{ color: CH_B }}>{djB.name}</span>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {winner ? `You gave ${brief.title} to ${winner.name} of ${winner.lab}.` : "You called it a tie."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/leaderboard"
            className="tnum rounded-[2px] border hair px-5 py-3 text-[11px] uppercase tracking-[0.12em] text-muted hover:text-ink"
          >
            Standings
          </Link>
          <button
            onClick={onNext}
            className="rounded-[2px] bg-cha px-6 py-3 font-display text-sm font-semibold tracking-tight text-base hover:opacity-90"
          >
            Next battle
          </button>
        </div>
      </div>
    </div>
  );
}
