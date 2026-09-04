import { ArenaShell } from "@/components/ArenaShell";
import { CATALOG, randomBattle } from "@/lib/data";

// A fresh pairing per visit, so nobody lands on the same battle twice in a row.
export const dynamic = "force-dynamic";

export default function Page() {
  return <ArenaShell catalog={CATALOG} initial={randomBattle()} />;
}
