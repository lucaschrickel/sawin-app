/*
  Rechenlogik der Plantafel (Montage- und Service-Plan), ohne Oberfläche: Zeilen, Ziehen und Ablegen, Duplizieren,
  Farben, Pipeline-Stufen, Reihenfolge. Im Browser und auf dem Server nutzbar; Unit-Tests: tests/unit/plantafel.test.ts.
  Zeiten sind Ortszeit Berlin als Text („2026-12-14T07:00“), siehe src/lib/woche.ts.
*/
import { lokalAus, plusTage, type Raster } from "./woche.ts";

// ---------- Zeilen ----------

/** Zeilenart: Monteur, Kolonne (Gruppenzeile), weitere Ressource, Planungszeile (Pipeline-Stufe bzw. „Terminierbar“) */
export type ZeilenArt = "m" | "k" | "r" | "p";
export type Zeile = { art: ZeilenArt; id: string };
export const zeilenSchluessel = (z: Zeile) => `${z.art}:${z.id}`;
export function zeileAus(s: string | null | undefined): Zeile | null {
  const m = /^([mkrp]):(.+)$/.exec(s ?? "");
  return m ? { art: m[1] as ZeilenArt, id: m[2] } : null;
}

export type TafelKolonne = { id: string; name: string; stammfahrzeug_id: string | null; mitglieder: string[] };
/** Was ein Einsatz an Team und Ressourcen trägt */
export type Besetzung = { monteure: string[]; fahrzeug_id: string | null; ressource_id: string | null };

/** Steht der Einsatz in dieser Zeile? Kolonne: alle Mitglieder sind im Team. */
export function inZeile(e: Besetzung, z: Zeile, kolonnen: TafelKolonne[]): boolean {
  if (z.art === "m") return e.monteure.includes(z.id);
  if (z.art === "r") return e.ressource_id === z.id;
  if (z.art === "k") {
    const k = kolonnen.find((x) => x.id === z.id);
    return !!k && k.mitglieder.length > 0 && k.mitglieder.every((m) => e.monteure.includes(m));
  }
  return false;
}

/**
 * Team, Fahrzeug und Ressource nach dem Ablegen eines Balkens in einer anderen Zeile (CLAUDE.md „Kolonnen“):
 *  - Monteur: aus einer Monteurzeile wird der Monteur getauscht, sonst ist er allein im Team; ohne Fahrzeug kommt das
 *    Stammfahrzeug seiner Kolonne dazu.
 *  - Kolonne: alle Mitglieder und das Stammfahrzeug, keine weitere Ressource.
 *  - Ressource: Ressource setzen, Team bleibt.
 * Beim Duplizieren (kopie) gilt dasselbe für die Kopie; ein Monteur ist dann allein im Team.
 */
export function besetzungNachAblage(e: Besetzung, quelle: Zeile, ziel: Zeile, kopie: boolean, kolonnen: TafelKolonne[]): Besetzung | { fehler: string } {
  if (ziel.art === "k") {
    const k = kolonnen.find((x) => x.id === ziel.id);
    if (!k) return { fehler: "Kolonne nicht gefunden." };
    if (!k.mitglieder.length) return { fehler: `${k.name} hat noch keine Monteure.` };
    return { monteure: [...k.mitglieder], fahrzeug_id: k.stammfahrzeug_id ?? e.fahrzeug_id, ressource_id: null };
  }
  if (ziel.art === "r") return { monteure: [...e.monteure], fahrzeug_id: e.fahrzeug_id, ressource_id: ziel.id };
  if (ziel.art === "m") {
    let monteure: string[];
    if (!kopie && quelle.art === "m" && e.monteure.includes(quelle.id)) {
      if (quelle.id === ziel.id) monteure = [...e.monteure];
      else if (e.monteure.includes(ziel.id)) return { fehler: "Der Monteur ist schon in diesem Einsatz." };
      else monteure = e.monteure.map((m) => (m === quelle.id ? ziel.id : m));
    } else monteure = [ziel.id];
    const fahrzeug = e.fahrzeug_id ?? kolonnen.find((k) => k.mitglieder.includes(ziel.id))?.stammfahrzeug_id ?? null;
    // Aus einer Ressourcenzeile auf einen Monteur verschoben: die Ressource entfällt
    const ressource = !kopie && quelle.art === "r" ? null : e.ressource_id;
    return { monteure, fahrzeug_id: fahrzeug, ressource_id: ressource };
  }
  return { fehler: "Hier lässt sich kein Einsatz ablegen." };
}

/** Team und Fahrzeug für einen neuen Einsatz aus einer Planungszeile, abgelegt in einer Zeile */
export function besetzungNeu(ziel: Zeile, kolonnen: TafelKolonne[]): Besetzung | { fehler: string } {
  return besetzungNachAblage({ monteure: [], fahrzeug_id: null, ressource_id: null }, { art: "p", id: "" }, ziel, true, kolonnen);
}

// ---------- Zeiten beim Ziehen ----------

const istWochenende = (d: string) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());

/** Datum um n Werktage (Montag bis Freitag) verschieben */
export function plusWerktage(d: string, n: number): string {
  let t = d;
  const schritt = n < 0 ? -1 : 1;
  for (let i = 0; i < Math.abs(n); i++) {
    t = plusTage(t, schritt);
    while (istWochenende(t)) t = plusTage(t, schritt);
  }
  return t;
}

/** Nächster Werktag nach dem Datum (ohne Wochenende und Feiertage), z. B. für „Duplizieren“ im Termin-Dialog */
export function naechsterWerktag(d: string, feiertage: Iterable<string> = []): string {
  const frei = new Set(feiertage);
  let t = plusTage(d, 1);
  while (istWochenende(t) || frei.has(t)) t = plusTage(t, 1);
  return t;
}

export type ZugArt = "verschieben" | "anfang" | "ende";
type Zeitraum = { beginn: string; ende: string };

/**
 * Neue Zeiten nach dem Ziehen. s0/en0: Slots beim Greifen, s/en: Slots beim Loslassen.
 * Stundenraster: Beginn und Ende auf volle Stunden; beim Verschieben bleibt die Länge in Slots.
 * Tagesgenau: nur die Tage ändern sich (um Werktage), die Uhrzeiten bleiben.
 * null, wenn sich nichts ändert oder das Ende nicht nach dem Beginn läge.
 */
export function zeitNachZug(e: Zeitraum, art: ZugArt, s0: number, en0: number, s: number, en: number, r: Raster): Zeitraum | null {
  let neu: Zeitraum;
  if (r.tagesgenau) {
    const uhr = (x: string) => x.slice(10);
    if (art === "verschieben") {
      const d = s - s0;
      if (!d) return null;
      neu = { beginn: plusWerktage(e.beginn.slice(0, 10), d) + uhr(e.beginn), ende: plusWerktage(e.ende.slice(0, 10), d) + uhr(e.ende) };
    } else if (art === "anfang") {
      if (s === s0) return null;
      neu = { beginn: r.tage[Math.min(Math.max(s, 0), r.tage.length - 1)] + uhr(e.beginn), ende: e.ende };
    } else {
      if (en === en0) return null;
      neu = { beginn: e.beginn, ende: r.tage[Math.min(Math.max(en - 1, 0), r.tage.length - 1)] + uhr(e.ende) };
    }
  } else if (art === "verschieben") {
    if (s === s0) return null;
    neu = { beginn: lokalAus(s, r, "beginn"), ende: lokalAus(s + (en0 - s0), r, "ende") };
  } else if (art === "anfang") {
    if (s === s0) return null;
    neu = { beginn: lokalAus(s, r, "beginn"), ende: e.ende };
  } else {
    if (en === en0) return null;
    neu = { beginn: e.beginn, ende: lokalAus(en, r, "ende") };
  }
  return neu.ende > neu.beginn ? neu : null;
}

/** Zeitraum für einen neuen Einsatz, abgelegt auf einem Slot: Stundenraster ab der Stunde bis Arbeitsende, tagesgenau der ganze Arbeitstag */
export function zeitNeu(slot: number, r: Raster): Zeitraum {
  if (r.tagesgenau) return { beginn: lokalAus(slot, r, "beginn"), ende: lokalAus(slot + 1, r, "ende") };
  const n = r.bis - r.von;
  return { beginn: lokalAus(slot, r, "beginn"), ende: lokalAus((Math.floor(slot / n) + 1) * n, r, "ende") };
}

/** Datum (Tag) eines Slots, z. B. für das Ablegen in einer Planungszeile */
export const tagAusSlot = (slot: number, r: Raster) => r.tage[Math.min(Math.max(Math.floor(slot / (r.tagesgenau ? 1 : r.bis - r.von)), 0), r.tage.length - 1)];

/** Spuren für überlappende Balken in einer Zeile (frühester zuerst, längster zuerst) */
export function spurenVerteilen<T extends { s: number; en: number }>(liste: T[]): { balken: (T & { spur: number })[]; spuren: number } {
  const sortiert = [...liste].sort((a, b) => a.s - b.s || b.en - a.en);
  const enden: number[] = [];
  const balken = sortiert.map((b) => {
    let spur = enden.findIndex((x) => x <= b.s);
    if (spur < 0) spur = enden.push(0) - 1;
    enden[spur] = b.en;
    return { ...b, spur };
  });
  return { balken, spuren: Math.max(1, enden.length) };
}

// ---------- Farben ----------

export const PLAN_FARBEN = [
  ["plan-1", "Sand"],
  ["plan-2", "Blau"],
  ["plan-3", "Grün"],
  ["plan-4", "Gelb"],
  ["plan-5", "Rot"],
  ["plan-6", "Violett"],
  ["plan-7", "Oliv"],
  ["plan-8", "Türkis"],
  ["plan-9", "Rosa"],
  ["plan-10", "Grau"],
] as const;

export const istHex = (c: string | null | undefined): c is string => /^#[0-9a-f]{6}$/i.test(c ?? "");
export const istPlanFarbe = (c: string | null | undefined): c is string => /^plan-([1-9]|10)$/.test(c ?? "");

/** relative Leuchtdichte nach WCAG 2.1 */
function leuchtdichte(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export const kontrast = (a: string, b: string) => {
  const [x, y] = [leuchtdichte(a), leuchtdichte(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Schriftfarbe auf einer frei gewählten Farbe: dunkel oder hell, je nachdem was mehr Kontrast hat (mindestens 4,5:1, sonst Schwarz) */
export function schriftAuf(hex: string): string {
  const dunkel = kontrast(hex, "#171717");
  const hell = kontrast(hex, "#FFFFFF");
  if (dunkel >= 4.5 && dunkel >= hell) return "#171717";
  if (hell >= 4.5) return "#FFFFFF";
  return kontrast(hex, "#000000") >= hell ? "#000000" : "#FFFFFF";
}

/** Hintergrund und Schrift eines Balkens: frei gewählte Farbe, Palettenfarbe oder Standard nach Typ */
export function balkenFarbe(farbe: string | null, standard: "auftrag" | "service" | "reklamation"): { hintergrund: string; rand: string; schrift?: string } {
  if (istHex(farbe)) return { hintergrund: farbe, rand: farbe, schrift: schriftAuf(farbe) };
  const token = istPlanFarbe(farbe) ? farbe : standard === "service" ? "plan-2" : standard === "reklamation" ? "plan-5" : "plan-1";
  return { hintergrund: `var(--${token})`, rand: `var(--${token})` };
}

// ---------- Auftrags-Pipeline (Montageplan) ----------

export type PipelineStufe = "lieferung" | "abschlag" | "warten";
export const STUFEN: [PipelineStufe, string][] = [
  ["lieferung", "Lieferung"],
  ["abschlag", "Abschlag bezahlt"],
  ["warten", "Warten auf Kunde"],
];
export type PipelineAuftrag = {
  warten_auf_kunde: boolean;
  liefertermin: string | null;
  stufe_lieferung_datum: string | null;
  stufe_abschlag_datum: string | null;
  stufe_warten_datum: string | null;
  abschlaege_bezahlt: number;
};

/** Aktuelle Stufe: „Warten auf Kunde“ hat Vorrang, dann „Abschlag bezahlt“ (mindestens ein Abschlag bezahlt), sonst „Lieferung“ */
export const pipelineStufe = (a: PipelineAuftrag): PipelineStufe => (a.warten_auf_kunde ? "warten" : a.abschlaege_bezahlt > 0 ? "abschlag" : "lieferung");

/** Datum in der Pipeline: Datum der Stufe, sonst der Liefertermin; ohne beides steht der Auftrag nicht in der Pipeline */
export function stufeDatum(a: PipelineAuftrag, stufe: PipelineStufe = pipelineStufe(a)): string | null {
  const eigen = stufe === "lieferung" ? a.stufe_lieferung_datum : stufe === "abschlag" ? a.stufe_abschlag_datum : a.stufe_warten_datum;
  return eigen ?? a.liefertermin;
}

/**
 * Ablegen eines Auftrags in einer Pipeline-Zeile: welche Felder ändern sich? „Warten auf Kunde“ setzt bzw. löst den
 * Schalter; „Abschlag bezahlt“ entsteht nur durch eine Zahlung. Das Datum gilt für die Stufe, in der der Auftrag danach steht.
 */
export function pipelineAblage(a: PipelineAuftrag, zielStufe: PipelineStufe, datum: string): { warten_auf_kunde: boolean; stufe: PipelineStufe; feld: "stufe_lieferung_datum" | "stufe_abschlag_datum" | "stufe_warten_datum"; datum: string } {
  const warten = zielStufe === "warten";
  const stufe = pipelineStufe({ ...a, warten_auf_kunde: warten });
  return { warten_auf_kunde: warten, stufe, feld: `stufe_${stufe}_datum`, datum };
}

// ---------- Reihenfolge ----------

/** Element vor ein anderes schieben (ohne Ziel: ans Ende) */
export function vorSchieben<T>(liste: T[], element: T, vor: T | null): T[] {
  const ohne = liste.filter((x) => x !== element);
  const i = vor === null ? -1 : ohne.indexOf(vor);
  if (i < 0) return [...ohne, element];
  return [...ohne.slice(0, i), element, ...ohne.slice(i)];
}

/** Reihenfolge der Gruppen in der Tafel: gespeicherte Reihenfolge, fehlende Kolonnen und „Ohne Kolonne“/„Weitere Ressourcen“ dahinter */
export function gruppenOrdnen(gespeichert: string[] | null, kolonnenIds: string[]): string[] {
  const alle = [...kolonnenIds.map((id) => `kolonne:${id}`), "solo", "res"];
  const bekannt = (gespeichert ?? []).filter((g) => alle.includes(g));
  const rest = alle.filter((g) => !bekannt.includes(g));
  // neue Kolonnen vor „Ohne Kolonne“, sonst ans Ende
  const ergebnis = [...bekannt];
  for (const g of rest) {
    const solo = ergebnis.indexOf("solo");
    if (g.startsWith("kolonne:") && solo >= 0) ergebnis.splice(solo, 0, g);
    else ergebnis.push(g);
  }
  return ergebnis;
}

/** Vorauswahl der Sammelfreigabe: vorgeplante Einsätze ohne Konflikt sind angehakt */
export const freigabeVorauswahl = (einsaetze: { id: string; konflikte: number }[]) => einsaetze.filter((e) => e.konflikte === 0).map((e) => e.id);
