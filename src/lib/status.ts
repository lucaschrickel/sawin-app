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

/** Service-Tickets (CLAUDE.md „Service-Tickets“) */
export const TICKET_STATUS = ["neu", "eingeplant", "in_arbeit", "erledigt", "abgerechnet"] as const;
export type TicketStatus = (typeof TICKET_STATUS)[number];
export const TICKET_STATUS_TEXT: Record<TicketStatus, string> = { neu: "Neu", eingeplant: "Eingeplant", in_arbeit: "In Arbeit", erledigt: "Erledigt", abgerechnet: "Abgerechnet" };
export const TICKET_STATUS_TON: Record<TicketStatus, Tone> = { neu: "blue", eingeplant: "brand", in_arbeit: "amber", erledigt: "green", abgerechnet: "dark" };
/** Von Hand wählbar: „Abgerechnet“ setzt die App mit der Rechnung */
export const TICKET_STATUS_HAND: readonly TicketStatus[] = ["neu", "eingeplant", "in_arbeit", "erledigt"];

export const TICKET_ARTEN = ["reklamation", "wartung", "reparatur", "einstellung", "sonstiges"] as const;
export type TicketArt = (typeof TICKET_ARTEN)[number];
export const TICKET_ART_TEXT: Record<TicketArt, string> = { reklamation: "Reklamation", wartung: "Wartung", reparatur: "Reparatur", einstellung: "Einstellung / Justage", sonstiges: "Sonstiges" };

export const ABRECHNUNG = ["garantie", "kulanz", "kostenpflichtig"] as const;
export type Abrechnung = (typeof ABRECHNUNG)[number];
export const ABRECHNUNG_TEXT: Record<Abrechnung, string> = { garantie: "Garantie", kulanz: "Kulanz", kostenpflichtig: "Kostenpflichtig" };

export const TICKET_PRIO = ["hoch", "normal", "niedrig"] as const;
export type TicketPrio = (typeof TICKET_PRIO)[number];
export const TICKET_PRIO_TEXT: Record<TicketPrio, string> = { hoch: "Hoch", normal: "Normal", niedrig: "Niedrig" };
export const TICKET_PRIO_TON: Record<TicketPrio, Tone> = { hoch: "red", normal: "gray", niedrig: "blue" };
