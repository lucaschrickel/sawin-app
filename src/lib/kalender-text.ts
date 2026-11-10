/** Kalender: Terminarten, Einträge und Zeiträume (Server und Browser) */
import { plusTage, montagVon } from "@/lib/woche";

export const KALENDER_ARTEN = ["montage", "service", "aufmass", "beratung", "intern", "abwesenheit"] as const;
export type KalenderArt = (typeof KALENDER_ARTEN)[number];
export const KALENDER_ART_TEXT: Record<KalenderArt, string> = {
  montage: "Montage",
  service: "Service",
  aufmass: "Aufmaß",
  beratung: "Beratung",
  intern: "Intern",
  abwesenheit: "Abwesenheit",
};
/** Token-Namen je Terminart (--cal-<name> und --cal-<name>-bg) */
export const KALENDER_TOKEN: Record<KalenderArt, string> = {
  montage: "montage",
  service: "service",
  aufmass: "aufmass",
  beratung: "beratung",
  intern: "intern",
  abwesenheit: "abw",
};

export type KalenderEintrag = {
  schluessel: string;
  art: KalenderArt;
  titel: string;
  unter: string | null;
  /** Ortszeit Berlin „YYYY-MM-DDTHH:MM“; ganztags: „YYYY-MM-DDT00:00“ bis „YYYY-MM-DDT23:59“ */
  beginn: string;
  ende: string;
  ganztags: boolean;
  mitarbeiter: string[];
  href: string | null;
  /** eigener Termin (Beratung, Intern): öffnet den Termin-Dialog */
  termin: TerminDaten | null;
  vorgeplant: boolean;
  beantragt: boolean;
};

export type TerminDaten = {
  id: string;
  titel: string;
  art: "beratung" | "intern";
  datum: string;
  beginn: string;
  ende: string;
  mitarbeiter: string[];
  bezug: { art: "kunde" | "anfrage" | "auftrag"; id: string; text: string } | null;
  ort: string | null;
  notiz: string | null;
};

export type KalenderAnsicht = "monat" | "woche" | "tag" | "liste";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** Sichtbarer Zeitraum je Ansicht: Monat in ganzen Wochen (Mo–So), Woche Mo–So, Tag, Liste = Kalendermonat */
export function kalenderZeitraum(ansicht: KalenderAnsicht, datum: string) {
  const monatErster = `${datum.slice(0, 7)}-01`;
  const naechsterErster = new Date(Date.UTC(Number(datum.slice(0, 4)), Number(datum.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const monatLetzter = plusTage(naechsterErster, -1);
  const monatName = `${MONATE[Number(datum.slice(5, 7)) - 1]} ${datum.slice(0, 4)}`;
  if (ansicht === "monat") return { von: montagVon(monatErster), bis: plusTage(montagVon(monatLetzter), 6), titel: monatName };
  if (ansicht === "liste") return { von: monatErster, bis: monatLetzter, titel: monatName };
  if (ansicht === "woche") {
    const m = montagVon(datum);
    return { von: m, bis: plusTage(m, 6), titel: `${tagLang(m)} – ${tagLang(plusTage(m, 6))}` };
  }
  return { von: datum, bis: datum, titel: tagLang(datum, true) };
}

const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
/** „12.11.2026“ bzw. mit Wochentag „Donnerstag, 12.11.2026“ */
export function tagLang(d: string, mitWochentag = false) {
  const t = `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  return mitWochentag ? `${WOCHENTAG[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${t}` : t;
}

/** Nächster bzw. voriger Zeitraum */
export function kalenderSchritt(ansicht: KalenderAnsicht, datum: string, richtung: 1 | -1) {
  if (ansicht === "monat" || ansicht === "liste") {
    return new Date(Date.UTC(Number(datum.slice(0, 4)), Number(datum.slice(5, 7)) - 1 + richtung, 1)).toISOString().slice(0, 10);
  }
  return plusTage(datum, richtung * (ansicht === "woche" ? 7 : 1));
}

/** Liegt der Eintrag (auch teilweise) an diesem Tag? */
export const amTag = (e: Pick<KalenderEintrag, "beginn" | "ende">, d: string) => e.beginn.slice(0, 10) <= d && e.ende.slice(0, 10) >= d;
