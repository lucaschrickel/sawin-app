import type { Tone } from "@/components/ui/badge";

/** Phasen eines Auftrags (CLAUDE.md, Demo). Reihenfolge = Pipeline-Spalten. */
export const AUFTRAG_PHASEN = ["bestellung", "montage", "abnahme", "baustelle_fertig", "reklamation", "abgeschlossen"] as const;
export type AuftragPhase = (typeof AUFTRAG_PHASEN)[number];
export const istAuftragPhase = (v: string): v is AuftragPhase => (AUFTRAG_PHASEN as readonly string[]).includes(v);

export const AUFTRAG_PHASE_TEXT: Record<AuftragPhase, string> = {
  bestellung: "Bestellung",
  montage: "Montage",
  abnahme: "Abnahme",
  baustelle_fertig: "Baustelle fertig",
  reklamation: "Reklamation",
  abgeschlossen: "Abgeschlossen",
};

export const AUFTRAG_PHASE_TON: Record<AuftragPhase, Tone> = {
  bestellung: "blue",
  montage: "brand",
  abnahme: "green",
  baustelle_fertig: "amber",
  reklamation: "red",
  abgeschlossen: "dark",
};

/** Phasenleiste: Reklamation erscheint nur, solange der Auftrag in dieser Phase ist */
export const phasenLeiste = (phase: AuftragPhase): AuftragPhase[] =>
  phase === "reklamation"
    ? ["bestellung", "montage", "abnahme", "reklamation", "baustelle_fertig", "abgeschlossen"]
    : ["bestellung", "montage", "abnahme", "baustelle_fertig", "abgeschlossen"];

export const MONTAGESTATUS = ["nicht_begonnen", "bereit", "in_arbeit", "teilweise_abgeschlossen", "abgeschlossen"] as const;
export type Montagestatus = (typeof MONTAGESTATUS)[number];
export const MONTAGESTATUS_TEXT: Record<Montagestatus, string> = {
  nicht_begonnen: "Nicht begonnen",
  bereit: "Bereit",
  in_arbeit: "In Arbeit",
  teilweise_abgeschlossen: "Teilweise abgeschlossen",
  abgeschlossen: "Abgeschlossen",
};

export const BELEG_STATUS_TONE: Record<string, Tone> = {
  Entwurf: "gray",
  Offen: "blue",
  Angenommen: "green",
  Abgelehnt: "red",
  Bezahlt: "green",
  Überfällig: "red",
  Storniert: "dark",
};
