import type { Tone } from "@/components/ui/badge";

export const AUFGABE_STATUS = ["offen", "in_arbeit", "wartet_zulieferer", "wartet_kunde", "erledigt"] as const;
export type AufgabeStatus = (typeof AUFGABE_STATUS)[number];
export const AUFGABE_STATUS_TEXT: Record<AufgabeStatus, string> = {
  offen: "Offen",
  in_arbeit: "In Arbeit",
  wartet_zulieferer: "Wartet auf Zulieferer",
  wartet_kunde: "Wartet auf Kunde",
  erledigt: "Erledigt",
};
export const AUFGABE_STATUS_TON: Record<AufgabeStatus, Tone> = {
  offen: "gray",
  in_arbeit: "blue",
  wartet_zulieferer: "amber",
  wartet_kunde: "amber",
  erledigt: "green",
};

export const PRIORITAET = ["hoch", "normal", "niedrig"] as const;
export type Prioritaet = (typeof PRIORITAET)[number];
export const PRIORITAET_TEXT: Record<Prioritaet, string> = { hoch: "Hoch", normal: "Normal", niedrig: "Niedrig" };

/** Bezug einer Aufgabe (höchstens einer) */
export type Bezug = { art: "kunde" | "anfrage" | "auftrag"; id: string; text: string };
export const BEZUG_ART_TEXT: Record<Bezug["art"], string> = { kunde: "Kunde", anfrage: "Anfrage", auftrag: "Auftrag" };
export const bezugHref = (b: Bezug) => (b.art === "kunde" ? `/kunden/${b.id}` : b.art === "anfrage" ? `/anfragen/${b.id}` : `/auftraege/${b.id}`);
