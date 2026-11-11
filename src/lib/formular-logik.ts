import type { Tone } from "@/components/ui/badge";
import { leerePosition, textZuHtml, type PositionEingabe } from "./beleg-typen.ts";
import { dateiTeil } from "./versand.ts";

/*
  Formulare & Protokolle (CLAUDE.md „Formulare & Protokolle“): Texte, Status und Rechenhilfen ohne Abhängigkeiten,
  im Browser, auf dem Server und in den Unit-Tests (tests/unit/formulare.test.ts) nutzbar.
*/

export type FormularTyp = "aufmass" | "montageprotokoll" | "servicebericht" | "uebergabeprotokoll";
export type FormularStatus = "entwurf" | "abgeschlossen" | "gedruckt" | "scan_abgelegt";

export const FORMULAR_TEXT: Record<FormularTyp, string> = {
  aufmass: "Aufmaßblatt",
  montageprotokoll: "Montageprotokoll",
  servicebericht: "Servicebericht",
  uebergabeprotokoll: "Übergabeprotokoll",
};
export const FORMULAR_STATUS_TEXT: Record<FormularStatus, string> = {
  entwurf: "Entwurf",
  abgeschlossen: "Abgeschlossen",
  gedruckt: "Gedruckt",
  scan_abgelegt: "Scan abgelegt",
};
export const FORMULAR_STATUS_TON: Record<FormularStatus, Tone> = { entwurf: "gray", abgeschlossen: "green", gedruckt: "amber", scan_abgelegt: "green" };
export const PROTOKOLLE: FormularTyp[] = ["montageprotokoll", "servicebericht", "uebergabeprotokoll"];

/** Reihenfolge der Knöpfe: am Ticket zuerst der Servicebericht, sonst das Aufmaß */
export const formularReihenfolge = (ticket: boolean): FormularTyp[] =>
  ticket ? ["servicebericht", "aufmass", "montageprotokoll", "uebergabeprotokoll"] : ["aufmass", "montageprotokoll", "uebergabeprotokoll", "servicebericht"];

export type AufmassZeile = {
  id: string;
  raum: string;
  element: string;
  breite_mm: string;
  hoehe_mm: string;
  anzahl: string;
  anschlag: string;
  bemerkung: string;
};

export const leereAufmassZeile = (vorher?: AufmassZeile, element = "Fenster"): AufmassZeile => ({
  id: crypto.randomUUID(),
  raum: vorher?.raum ?? "",
  element,
  breite_mm: "",
  hoehe_mm: "",
  anzahl: "1",
  anschlag: "",
  bemerkung: "",
});

/** Ganze Zahl > 0 aus der Eingabe, sonst null */
export function mm(eingabe: string | number | null | undefined): number | null {
  const t = String(eingabe ?? "").replace(/\s|\./g, "").trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** Anzahl der Elemente (Summe der Anzahl, leere Anzahl zählt als 1) */
export const elementeSumme = (zeilen: { anzahl: string | number | null }[]) => zeilen.reduce((s, z) => s + (mm(z.anzahl) ?? 1), 0);

/** Maß für Anzeige und PDF: „1.230 × 1.480 mm“ */
export function masse(breite: number | string | null, hoehe: number | string | null): string {
  const b = mm(breite);
  const h = mm(hoehe);
  const f = (n: number) => n.toLocaleString("de-DE");
  if (b && h) return `${f(b)} × ${f(h)} mm`;
  if (b) return `Breite ${f(b)} mm`;
  if (h) return `Höhe ${f(h)} mm`;
  return "";
}

type KatalogArtikel = { bezeichnung: string; einheit: string; preis_netto: number; beschreibung_html: string | null };
type AufmassKonfig = { artikel: Record<string, string>; zusatz: string[] };

const preisText = (netto: number, brutto: boolean, frei: boolean) => {
  const p = brutto && !frei ? Math.round(netto * 1.19 * 100) / 100 : netto;
  return String(p).replace(".", ",");
};

/**
 * „In Angebot übernehmen“: je Zeile mit Element eine Position. Titel = Katalogartikel zum Element (sonst das Element)
 * mit Maß, Beschreibung = Raum · Anschlag · Bemerkung (vor der Artikelbeschreibung), Menge = Anzahl, Preis aus dem
 * Katalog (sonst leer). Danach die Zusatzartikel aus der Konfiguration, wenn es sie im Katalog gibt.
 */
export function aufmassZuPositionen(
  zeilen: { raum: string | null; element: string | null; breite_mm: number | string | null; hoehe_mm: number | string | null; anzahl: number | string | null; anschlag: string | null; bemerkung: string | null }[],
  katalog: KatalogArtikel[],
  konfig: AufmassKonfig,
  opt: { brutto: boolean; frei: boolean },
): PositionEingabe[] {
  const finde = (name: string | undefined) => (name ? katalog.find((a) => a.bezeichnung.trim().toLowerCase() === name.trim().toLowerCase()) : undefined);
  const steuersatz = opt.frei ? "0" : "19";
  const positionen: PositionEingabe[] = zeilen
    .filter((z) => (z.element ?? "").trim())
    .map((z) => {
      const element = z.element!.trim();
      const art = finde(konfig.artikel[element]) ?? finde(element);
      const mass = masse(z.breite_mm, z.hoehe_mm);
      const zusatz = [z.raum, z.anschlag, z.bemerkung].map((x) => (x ?? "").trim()).filter(Boolean).join(" · ");
      return {
        ...leerePosition(),
        titel: [art?.bezeichnung ?? element, mass].filter(Boolean).join(", "),
        beschreibung: textZuHtml(zusatz) + (art?.beschreibung_html ?? ""),
        menge: String(mm(z.anzahl) ?? 1),
        einheit: art?.einheit ?? "Stk",
        einzelpreis: art ? preisText(art.preis_netto, opt.brutto, opt.frei) : "",
        steuersatz,
      };
    });
  if (!positionen.length) return positionen;
  for (const name of konfig.zusatz) {
    const art = finde(name);
    if (art)
      positionen.push({
        ...leerePosition(),
        titel: art.bezeichnung,
        beschreibung: art.beschreibung_html ?? "",
        einheit: art.einheit,
        einzelpreis: preisText(art.preis_netto, opt.brutto, opt.frei),
        steuersatz,
      });
  }
  return positionen;
}

/** Checkliste für die Protokolle aus den Produkten des Auftrags (ohne Dopplungen, in Reihenfolge der Produkte) */
export function checklisteFuer(produkte: string[], checklisten: Record<string, string[]>): { produkt: string; punkte: string[] }[] {
  return [...new Set(produkte)].filter((p) => checklisten[p]?.length).map((p) => ({ produkt: p, punkte: checklisten[p] }));
}

/** Dateiname in der Ablage: <Nummer>_<Formular>_<Kunde>[_n].pdf (n ab dem zweiten Formular derselben Art), wie die Beleg-PDFs */
export function formularDateiname(typ: FormularTyp, nummer: string, kunde: string | null, n = 1): string {
  return [dateiTeil(nummer), dateiTeil(FORMULAR_TEXT[typ]), kunde ? dateiTeil(kunde) : "", n > 1 ? String(n) : ""].filter(Boolean).join("_") + ".pdf";
}
