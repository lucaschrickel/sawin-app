import type { Tone } from "@/components/ui/badge";

/** Status offener Anfragen (Reihenfolge = Spalten im Kanban), siehe CLAUDE.md „Anfragen“. */
export const ANFRAGE_STATUS = ["neu", "in_klaerung", "aufmass", "angebot_erstellen", "angebot_versendet"] as const;
export type AnfrageStatus = (typeof ANFRAGE_STATUS)[number];

export const ANFRAGE_STATUS_TEXT: Record<AnfrageStatus, string> = {
  neu: "Neu",
  in_klaerung: "In Klärung",
  aufmass: "Aufmaß",
  angebot_erstellen: "Angebot erstellen",
  angebot_versendet: "Angebot versendet",
};

export const ANFRAGE_STATUS_TON: Record<AnfrageStatus, Tone> = {
  neu: "gray",
  in_klaerung: "blue",
  aufmass: "brand",
  angebot_erstellen: "green",
  angebot_versendet: "amber",
};

export const istAnfrageStatus = (s: unknown): s is AnfrageStatus => ANFRAGE_STATUS.includes(s as AnfrageStatus);
