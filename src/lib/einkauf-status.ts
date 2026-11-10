import type { Tone } from "@/components/ui/badge";
import { kalenderwoche } from "@/lib/woche";

/**
 * Abgeleitete Status im Einkauf (CLAUDE.md „Einkauf“, Demo bestStatus/bst). Server und Browser.
 * Gespeichert wird nur „bestellt“ oder „bestaetigt“ am Kopf und „geliefert“ je Zeile.
 */

export type BestellStatus = "bestellt" | "bestaetigt" | "teilweise_geliefert" | "geliefert" | "ueberfaellig";
export const BESTELL_STATUS_TEXT: Record<BestellStatus, string> = {
  bestellt: "Bestellt",
  bestaetigt: "Bestätigt",
  teilweise_geliefert: "Teilweise geliefert",
  geliefert: "Geliefert",
  ueberfaellig: "Überfällig",
};
export const BESTELL_STATUS_TON: Record<BestellStatus, Tone> = {
  bestellt: "blue",
  bestaetigt: "brand",
  teilweise_geliefert: "amber",
  geliefert: "green",
  ueberfaellig: "red",
};

/** Liefer-KW und Jahr liegen vor der aktuellen Woche */
export function kwVorbei(kw: number | null, jahr: number | null, heute: string) {
  if (!kw || !jahr) return false;
  const jetztJahr = Number(heute.slice(0, 4));
  const jetztKw = kalenderwoche(heute);
  return jahr < jetztJahr || (jahr === jetztJahr && kw < jetztKw);
}

export function bestellStatus(b: { status: "bestellt" | "bestaetigt"; liefer_kw: number | null; liefer_jahr: number | null; zeilen: { geliefert: boolean }[] }, heute: string): BestellStatus {
  if (b.zeilen.length && b.zeilen.every((z) => z.geliefert)) return "geliefert";
  if (b.zeilen.some((z) => z.geliefert)) return "teilweise_geliefert";
  if (kwVorbei(b.liefer_kw, b.liefer_jahr, heute)) return "ueberfaellig";
  return b.status;
}

export type AuftragBestellstatus = "offen" | "teilweise_bestellt" | "bestellt" | "teilweise_geliefert" | "abgeschlossen";
export const AUFTRAG_BESTELL_TEXT: Record<AuftragBestellstatus, string> = {
  offen: "Offen",
  teilweise_bestellt: "Teilweise bestellt",
  bestellt: "Bestellt",
  teilweise_geliefert: "Teilweise geliefert",
  abgeschlossen: "Ware eingetroffen",
};
export const AUFTRAG_BESTELL_TON: Record<AuftragBestellstatus, Tone> = {
  offen: "amber",
  teilweise_bestellt: "amber",
  bestellt: "blue",
  teilweise_geliefert: "blue",
  abgeschlossen: "green",
};

/** Bestellstatus eines Auftrags aus seinen Bestellzeilen und „Noch nicht bestellt“ (Demo bst) */
export function auftragBestellstatus(zeilen: { geliefert: boolean }[], nochNichtBestellt: string | null, phase: string): AuftragBestellstatus {
  const rest = (nochNichtBestellt ?? "").trim();
  if (!zeilen.length) return rest || phase === "bestellung" ? "offen" : "abgeschlossen";
  if (zeilen.every((z) => z.geliefert)) return rest ? "teilweise_geliefert" : "abgeschlossen";
  if (zeilen.some((z) => z.geliefert)) return "teilweise_geliefert";
  return rest ? "teilweise_bestellt" : "bestellt";
}

/** Liefer-KW des Auftrags = früheste offene Zeile („KW 50/2026“) */
export function auftragLieferKw(zeilen: { geliefert: boolean; liefer_kw: number | null; liefer_jahr: number | null }[]) {
  const offen = zeilen.filter((z) => !z.geliefert && z.liefer_kw && z.liefer_jahr).sort((a, b) => a.liefer_jahr! - b.liefer_jahr! || a.liefer_kw! - b.liefer_kw!);
  return offen[0] ? { kw: offen[0].liefer_kw!, jahr: offen[0].liefer_jahr! } : null;
}

/** „Noch nicht bestellt“ ohne die Positionen, die jetzt bestellt wurden (Zeilen durch Komma oder Zeilenumbruch getrennt) */
export function ohneBestellte(nochNichtBestellt: string, bestellt: string[]) {
  const weg = new Set(bestellt.map((t) => t.trim().toLowerCase()));
  return nochNichtBestellt
    .split(/\n|,/)
    .map((t) => t.trim())
    .filter((t) => t && !weg.has(t.toLowerCase()))
    .join(", ");
}
