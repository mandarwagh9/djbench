"use client";

import { useCallback, useState } from "react";
import { Arena } from "./Arena";
import type { Brief, Catalog, Dj, DjSet } from "@/lib/types";

type Battle = { briefId: string; a: string; b: string };

export function ArenaShell({ catalog, initial }: { catalog: Catalog; initial: Battle }) {
  const [battle, setBattle] = useState<Battle>(initial);
  const [round, setRound] = useState(0);

  const nextBattle = useCallback(() => {
    const pairs: Battle[] = [];
    for (const brief of catalog.briefs) {
      const ids = catalog.sets.filter((s) => s.briefId === brief.id).map((s) => s.djId);
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) pairs.push({ briefId: brief.id, a: ids[i], b: ids[j] });
    }
    // Avoid repeating the pairing the listener just judged.
    const fresh = pairs.filter(
      (p) => !(p.briefId === battle.briefId && (p.a === battle.a || p.a === battle.b)),
    );
    const pool = fresh.length ? fresh : pairs;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setBattle(Math.random() < 0.5 ? pick : { briefId: pick.briefId, a: pick.b, b: pick.a });
    setRound((r) => r + 1);
    window.scrollTo({ top: 0 });
  }, [battle, catalog]);

  const brief = catalog.briefs.find((b) => b.id === battle.briefId) as Brief;
  const setA = catalog.sets.find((s) => s.djId === battle.a && s.briefId === battle.briefId) as DjSet;
  const setB = catalog.sets.find((s) => s.djId === battle.b && s.briefId === battle.briefId) as DjSet;
  const djA = catalog.djs.find((d) => d.id === battle.a) as Dj;
  const djB = catalog.djs.find((d) => d.id === battle.b) as Dj;

  if (!brief || !setA || !setB) return null;

  return (
    <Arena
      key={`${battle.briefId}-${battle.a}-${battle.b}-${round}`}
      brief={brief}
      setA={setA}
      setB={setB}
      djA={djA}
      djB={djB}
      onNextBattle={nextBattle}
    />
  );
}
