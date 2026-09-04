import { ArenaShell } from "@/components/ArenaShell";
import { mintBattle } from "@/lib/battle";

// A fresh pairing per visit, minted server side so no model identity reaches the browser.
export const dynamic = "force-dynamic";

export default function Page() {
  const battle = mintBattle();
  if (!battle) return null;
  return <ArenaShell initial={battle} />;
}
