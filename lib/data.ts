import catalog from "@/data/sets.json";
import type { Catalog, DjSet } from "./types";

export const CATALOG = catalog as unknown as Catalog;

export const djById = (id: string) => CATALOG.djs.find((d) => d.id === id)!;
export const briefById = (id: string) => CATALOG.briefs.find((b) => b.id === id)!;

export type Battle = { briefId: string; a: string; b: string };

/** Every ordered pair of DJs that both completed the same brief. */
export function allBattles(): Battle[] {
  const out: Battle[] = [];
  for (const brief of CATALOG.briefs) {
    const ids = CATALOG.sets.filter((s) => s.briefId === brief.id).map((s) => s.djId);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) out.push({ briefId: brief.id, a: ids[i], b: ids[j] });
  }
  return out;
}

export function setFor(djId: string, briefId: string): DjSet {
  return CATALOG.sets.find((s) => s.djId === djId && s.briefId === briefId)!;
}

export function randomBattle(): Battle {
  const all = allBattles();
  const b = all[Math.floor(Math.random() * all.length)];
  // Which model sits on deck A is itself randomised, so side never correlates with identity.
  return Math.random() < 0.5 ? b : { briefId: b.briefId, a: b.b, b: b.a };
}
