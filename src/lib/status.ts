import type { Tone } from "@/components/ui/badge";

/** Auftragsstatus wie in der Demo und in Airtable. Reihenfolge = Pipeline-Spalten. */
export const AUFTRAG_STATUS = [
  "Angebotserstellung",
  "Bestellung",
  "Montage",
  "Abnahme",
  "Baustelle fertig",
  "Reklamation",
  "Abgeschlossen",
  "Angebot abgelehnt",
] as const;
export type AuftragStatus = (typeof AUFTRAG_STATUS)[number];

export const AUFTRAG_TONE: Record<AuftragStatus, Tone> = {
  Angebotserstellung: "gray",
  Bestellung: "blue",
  Montage: "brand",
  Abnahme: "green",
  "Baustelle fertig": "amber",
  Reklamation: "red",
  Abgeschlossen: "dark",
  "Angebot abgelehnt": "red",
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
