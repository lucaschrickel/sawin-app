import type { Tone } from "@/components/ui/badge";
import { plusTage } from "@/lib/woche";

/** Texte und Rechnungen für Mitarbeiter, Zeiterfassung und Abwesenheiten (Server und Browser) */

export const ABWESENHEIT_ARTEN = ["urlaub", "krank", "schulung", "ueberstundenabbau", "sonstiges"] as const;
export type AbwesenheitArt = (typeof ABWESENHEIT_ARTEN)[number];
export const ABWESENHEIT_TEXT: Record<string, string> = {
  urlaub: "Urlaub",
  krank: "Krank",
  schulung: "Schulung",
  ueberstundenabbau: "Überstundenabbau",
  sonstiges: "Sonstiges",
};
export const ABWESENHEIT_TON: Record<string, Tone> = { urlaub: "brand", krank: "red", schulung: "blue", ueberstundenabbau: "amber", sonstiges: "gray" };

export type AbwesenheitStatus = "beantragt" | "genehmigt" | "abgelehnt";
export const ABWESENHEIT_STATUS_TEXT: Record<AbwesenheitStatus, string> = { beantragt: "Beantragt", genehmigt: "Genehmigt", abgelehnt: "Abgelehnt" };
export const ABWESENHEIT_STATUS_TON: Record<AbwesenheitStatus, Tone> = { beantragt: "amber", genehmigt: "green", abgelehnt: "red" };

/** Arbeitstage (Montag bis Freitag) zwischen zwei Daten einschließlich; Feiertage folgen mit dem Feiertags-Modul */
export function arbeitstageZwischen(von: string, bis: string): number {
  let n = 0;
  for (let d = von; d <= bis; d = plusTage(d, 1)) {
    const wt = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wt !== 0 && wt !== 6) n += 1;
  }
  return n;
}

/** „1 Arbeitstag“, „5 Arbeitstage“ */
export const arbeitstageText = (n: number) => `${n} ${n === 1 ? "Arbeitstag" : "Arbeitstage"}`;

/** Arbeitstage eines Zeitraums, die in ein Jahr fallen (Urlaubskonto je Jahr) */
export const arbeitstageImJahr = (von: string, bis: string, jahr: number) => {
  const a = von > `${jahr}-01-01` ? von : `${jahr}-01-01`;
  const e = bis < `${jahr}-12-31` ? bis : `${jahr}-12-31`;
  return a > e ? 0 : arbeitstageZwischen(a, e);
};

export const ZEIT_ARTEN = ["montage", "aufmass", "service", "lager", "fahrt", "buero"] as const;
export type ZeitArt = (typeof ZEIT_ARTEN)[number];
export const ZEIT_ART_TEXT: Record<ZeitArt, string> = {
  montage: "Montage",
  aufmass: "Aufmaß",
  service: "Service",
  lager: "Lager / Werkstatt",
  fahrt: "Fahrt",
  buero: "Büro",
};
/** Arten, die immer einem Auftrag (später auch einem Service-Ticket) zugeordnet sind */
export const ZEIT_ART_MIT_BEZUG: readonly ZeitArt[] = ["montage", "aufmass", "service"];

/** Stunden einer Buchung aus „HH:MM“ und Pause in Minuten */
export function stunden(beginn: string, ende: string, pauseMin: number): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.max(0, m(ende) - m(beginn) - pauseMin) / 60;
}

/** „7,5 h“ */
export const stundenText = (h: number) => `${h.toLocaleString("de-DE", { maximumFractionDigits: 2 })} h`;
