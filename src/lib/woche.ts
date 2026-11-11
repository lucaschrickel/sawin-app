/**
 * Woche und Stundenraster der Plantafel. Alle Werte sind Ortszeit Berlin als Text („2026-11-09“, „2026-11-09T07:00“),
 * damit Server und Browser ohne Zeitzonen-Umrechnung dasselbe rechnen. Umrechnung nach UTC nur über src/lib/zeit.ts.
 */

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const utc = (d: string) => new Date(`${d}T12:00:00Z`);
const text = (t: Date) => t.toISOString().slice(0, 10);

/** Datum plus n Tage */
export const plusTage = (d: string, n: number) => {
  const t = utc(d);
  t.setUTCDate(t.getUTCDate() + n);
  return text(t);
};

/** Montag der Woche, in der das Datum liegt */
export const montagVon = (d: string) => plusTage(d, -((utc(d).getUTCDay() + 6) % 7));

/** Montag aus einem URL-Parameter, sonst Montag der Woche von „heute“ */
export const wocheAus = (param: string, heute: string) => (DATUM.test(param) && !Number.isNaN(utc(param).getTime()) ? montagVon(param) : montagVon(heute));

/** Kalenderwoche nach ISO 8601 */
export function kalenderwoche(d: string) {
  const t = utc(d);
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const ersterDo = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - ersterDo.getTime()) / 864e5 - 3 + ((ersterDo.getUTCDay() + 6) % 7)) / 7);
}

/** Arbeitstage Montag bis Freitag ab dem Montag */
export const arbeitstage = (montag: string) => [0, 1, 2, 3, 4].map((i) => plusTage(montag, i));

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
/** „Mo 09.11.“ */
export const tagKurz = (d: string) => `${WOCHENTAG[utc(d).getUTCDay()]} ${d.slice(8, 10)}.${d.slice(5, 7)}.`;

/** Arbeitstage von n Wochen ab dem Montag (Montag bis Freitag) */
export const arbeitstageWochen = (montag: string, wochen: number) => Array.from({ length: wochen }, (_, w) => arbeitstage(plusTage(montag, 7 * w))).flat();

/**
 * Raster: Arbeitstage, Arbeitszeit von/bis in vollen Stunden. Stundenraster (1 Woche): ein Slot je Stunde.
 * Tagesgenau (4 Wochen): ein Slot je Tag; Zeiten bleiben beim Verschieben erhalten (src/lib/plantafel-logik.ts).
 */
export type Raster = { tage: string[]; von: number; bis: number; tagesgenau?: boolean };
export const stundenJeTag = (r: Raster) => (r.tagesgenau ? 1 : r.bis - r.von);
export const slotsGesamt = (r: Raster) => r.tage.length * stundenJeTag(r);

/**
 * Ortszeit → Rasterposition. Vor der Woche → 0, danach → Ende. Zeiten vor bzw. nach der Arbeitszeit werden an den
 * Tagesrand gesetzt; der Beginn rundet ab, das Ende rundet auf.
 */
export function slotAus(lokal: string, r: Raster, art: "beginn" | "ende"): number {
  const d = lokal.slice(0, 10);
  const n = stundenJeTag(r);
  const i = r.tage.indexOf(d);
  // Tag außerhalb des Rasters (davor, danach, Wochenende): Beginn am nächsten Arbeitstag, Ende nach dem vorigen
  if (i < 0) {
    if (art === "beginn") {
      const k = r.tage.findIndex((t) => t > d);
      return k < 0 ? slotsGesamt(r) : k * n;
    }
    return r.tage.filter((t) => t < d).length * n;
  }
  if (r.tagesgenau) return art === "beginn" ? i : i + 1;
  const stunde = Number(lokal.slice(11, 13)) + Number(lokal.slice(14, 16)) / 60;
  const imTag = Math.min(Math.max(stunde, r.von), r.bis) - r.von;
  return i * n + (art === "beginn" ? Math.floor(imTag) : Math.ceil(imTag));
}

/** Rasterposition → Ortszeit. Ein Ende genau am Tagesrand ist das Arbeitsende des Vortags (nicht Arbeitsbeginn). */
export function lokalAus(slot: number, r: Raster, art: "beginn" | "ende"): string {
  const zwei = (h: number) => String(h).padStart(2, "0");
  if (r.tagesgenau) {
    const i = Math.min(Math.max(art === "ende" ? slot - 1 : slot, 0), r.tage.length - 1);
    return `${r.tage[i]}T${zwei(art === "ende" ? r.bis : r.von)}:00`;
  }
  const n = stundenJeTag(r);
  const randEnde = art === "ende" && slot > 0 && slot % n === 0;
  const tagIndex = randEnde ? slot / n - 1 : Math.floor(slot / n);
  const stunde = randEnde ? r.bis : r.von + (slot % n);
  return `${r.tage[Math.min(tagIndex, r.tage.length - 1)]}T${String(stunde).padStart(2, "0")}:00`;
}

/** „Mo 09.11. 07:00“ aus Ortszeit */
export const lokalKurz = (lokal: string) => `${tagKurz(lokal.slice(0, 10))} ${lokal.slice(11, 16)}`;
