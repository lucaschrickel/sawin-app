import type { Tone } from "@/components/ui/badge";

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
