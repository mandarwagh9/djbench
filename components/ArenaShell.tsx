"use client";

import { useCallback, useState } from "react";
import { Arena, type AnonBattle } from "./Arena";

export function ArenaShell({ initial }: { initial: AnonBattle }) {
  const [battle, setBattle] = useState<AnonBattle>(initial);
  const [round, setRound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);

  const nextBattle = useCallback(async () => {
    setLoading(true);
    try {
      const url = lastKey ? `/api/battle?exclude=${encodeURIComponent(lastKey)}` : "/api/battle";
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        setBattle(await res.json());
        setRound((r) => r + 1);
        window.scrollTo({ top: 0 });
      }
    } catch {
      /* keep the current battle on the decks if the next one cannot be fetched */
    } finally {
      setLoading(false);
    }
  }, [lastKey]);

  return (
    <Arena
      key={`${battle.brief.id}-${round}`}
      battle={battle}
      loadingNext={loading}
      onRevealed={setLastKey}
      onNextBattle={nextBattle}
    />
  );
}
