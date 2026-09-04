"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "./types";

/* Two YouTube players running the same position in two different setlists.
   A single wall clock drives both, so deck A track 3 and deck B track 3 always
   start together and the comparison stays fair no matter how either one buffers.
   Audio is real YouTube audio; the crossfader is an equal-power gain law across
   the two players, which is what a real two-channel mixer does. */

type YTPlayer = {
  loadVideoById: (o: { videoId: string; startSeconds?: number; suggestedQuality?: string }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (v: number) => void;
  getCurrentTime: () => number;
  destroy: () => void;
  getPlayerState: () => number;
  setPlaybackQuality: (q: string) => void;
};

/* The projection is blurred past recognition, so decoding HD would burn GPU for nothing.
   Full-resolution playback on two players at once was enough to lock up the renderer. */
const LOW = "small";
function throttle(p: YTPlayer | null) {
  try { p?.setPlaybackQuality(LOW); } catch {}
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("server"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPromise;
}

// Equal power: both channels sit at ~0.71 in the middle instead of dipping to 0.5.
const gains = (x: number) => ({
  a: Math.cos((x * Math.PI) / 2),
  b: Math.sin((x * Math.PI) / 2),
});

export type DeckState = {
  ready: boolean;
  started: boolean;
  index: number;
  elapsed: number;
  playing: boolean;
  crossfade: number;
  failed: { a: boolean; b: boolean };
  start: () => void;
  setCrossfade: (v: number) => void;
  togglePlay: () => void;
  goTo: (i: number) => void;
  next: () => void;
};

export function useDecks(
  aTracks: Track[],
  bTracks: Track[],
  mountA: React.RefObject<HTMLDivElement | null>,
  mountB: React.RefObject<HTMLDivElement | null>,
): DeckState {
  const length = Math.min(aTracks.length, bTracks.length);

  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [crossfade, setCrossfadeState] = useState(0.5);
  const [failed, setFailed] = useState({ a: false, b: false });

  const pa = useRef<YTPlayer | null>(null);
  const pb = useRef<YTPlayer | null>(null);
  const xf = useRef(0.5);
  const markRef = useRef(0);      // wall clock at which the current track began
  const pausedAt = useRef<number | null>(null);
  const indexRef = useRef(0);
  const startedRef = useRef(false);

  const applyGain = useCallback((x: number) => {
    const g = gains(x);
    try {
      pa.current?.setVolume(Math.round(g.a * 100));
      pb.current?.setVolume(Math.round(g.b * 100));
    } catch {
      /* player not ready yet; gain is reapplied on the next track load */
    }
  }, []);

  const setCrossfade = useCallback(
    (v: number) => {
      const x = Math.max(0, Math.min(1, v));
      xf.current = x;
      setCrossfadeState(x);
      applyGain(x);
    },
    [applyGain],
  );

  // Build both players once.
  useEffect(() => {
    let dead = false;
    if (!aTracks.length || !bTracks.length) return;

    loadYouTubeApi().then((YT) => {
      if (dead || !mountA.current || !mountB.current) return;

      const common = {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          fs: 0,
          origin: window.location.origin,
        },
      };

      let up = 0;
      const onReady = () => {
        throttle(pa.current);
        throttle(pb.current);
        up += 1;
        if (up === 2 && !dead) {
          applyGain(xf.current);
          setReady(true);
        }
      };

      pa.current = new YT.Player(mountA.current, {
        ...common,
        videoId: aTracks[0].videoId,
        events: {
          onReady,
          onError: () => setFailed((f) => ({ ...f, a: true })),
        },
      });
      pb.current = new YT.Player(mountB.current, {
        ...common,
        videoId: bTracks[0].videoId,
        events: {
          onReady,
          onError: () => setFailed((f) => ({ ...f, b: true })),
        },
      });
    });

    return () => {
      dead = true;
      try { pa.current?.destroy(); } catch {}
      try { pb.current?.destroy(); } catch {}
      pa.current = null;
      pb.current = null;
    };
    // Players are built once per battle; the parent remounts this hook via `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Point both decks at track `i` and restart the shared clock.
  const cue = useCallback(
    (i: number, autoplay: boolean) => {
      const a = aTracks[i];
      const b = bTracks[i];
      if (!a || !b) return;
      setFailed({ a: false, b: false });
      try {
        pa.current?.loadVideoById({ videoId: a.videoId, startSeconds: a.startSec, suggestedQuality: LOW });
        pb.current?.loadVideoById({ videoId: b.videoId, startSeconds: b.startSec, suggestedQuality: LOW });
        throttle(pa.current);
        throttle(pb.current);
        applyGain(xf.current);
        if (!autoplay) {
          pa.current?.pauseVideo();
          pb.current?.pauseVideo();
        }
      } catch {
        /* ignore: a failed cue surfaces through onError */
      }
      markRef.current = performance.now();
      pausedAt.current = autoplay ? null : performance.now();
      setElapsed(0);
    },
    [aTracks, bTracks, applyGain],
  );

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= length) return;
      indexRef.current = i;
      setIndex(i);
      cue(i, startedRef.current && playing);
    },
    [cue, length, playing],
  );

  const next = useCallback(() => {
    const n = indexRef.current + 1;
    if (n >= length) {
      // End of both sets: hold on the last track rather than dumping the listener out.
      setPlaying(false);
      try { pa.current?.pauseVideo(); pb.current?.pauseVideo(); } catch {}
      return;
    }
    goTo(n);
  }, [goTo, length]);

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    setPlaying(true);
    cue(0, true);
    try { pa.current?.playVideo(); pb.current?.playVideo(); } catch {}
  }, [cue]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      const nowPlaying = !p;
      try {
        if (nowPlaying) {
          pa.current?.playVideo();
          pb.current?.playVideo();
          if (pausedAt.current != null) {
            markRef.current += performance.now() - pausedAt.current;
            pausedAt.current = null;
          }
        } else {
          pa.current?.pauseVideo();
          pb.current?.pauseVideo();
          pausedAt.current = performance.now();
        }
      } catch {}
      return nowPlaying;
    });
  }, []);

  // Shared clock: advances the pair, never either deck on its own.
  useEffect(() => {
    if (!started || !playing) return;
    const hold = aTracks[indexRef.current]?.playSec ?? 45;
    const id = window.setInterval(() => {
      const secs = (performance.now() - markRef.current) / 1000;
      setElapsed(secs);
      if (secs >= hold) next();
    }, 120);
    return () => window.clearInterval(id);
  }, [started, playing, index, next, aTracks]);

  // Nothing should keep decoding while the listener is in another tab.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        try { pa.current?.pauseVideo(); pb.current?.pauseVideo(); } catch {}
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return {
    ready,
    started,
    index,
    elapsed,
    playing,
    crossfade,
    failed,
    start,
    setCrossfade,
    togglePlay,
    goTo,
    next,
  };
}
