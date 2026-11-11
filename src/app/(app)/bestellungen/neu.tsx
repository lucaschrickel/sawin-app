import type { ReactNode } from "react";
import { ladeBestellAuswahl } from "@/lib/einkauf";
import { heuteBerlin } from "@/lib/zeit";
import { BestellungDialog } from "./ui";

/** „Neue Bestellung“ mit geladener Auswahl (Lieferanten, offene Aufträge), optional vorbelegt */
export async function NeueBestellung({ lieferantId, auftragId, ausloeser, startOffen }: { lieferantId?: string; auftragId?: string; ausloeser?: ReactNode; startOffen?: boolean }) {
  const auswahl = await ladeBestellAuswahl();
  return <BestellungDialog auswahl={auswahl} vorlage={{ lieferantId, auftragId }} ausloeser={ausloeser} heute={heuteBerlin()} startOffen={startOffen} />;
}
