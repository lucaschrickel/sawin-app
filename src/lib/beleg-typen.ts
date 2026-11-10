import type { Belegart } from "./belege-status";
import type { Steuerart } from "./beleg-summen";

/*
  Eingabezustand des Beleg-Editors (Client) und Hilfen für Beschreibungen.
  Beschreibungen sind in Version 1 reiner Text mit Zeilenumbrüchen; gespeichert wird bereinigtes HTML
  (<p>, <br>), damit später formatierte Texte (TipTap) ohne Umbau dazukommen.
*/

export type PositionEingabe = {
  /** Schlüssel in der Liste (bleibt beim Umsortieren gleich) */
  key: string;
  id: string | null;
  typ: "artikel" | "text";
  titel: string;
  beschreibung: string;
  optional: boolean;
  menge: string;
  einheit: string;
  einzelpreis: string;
  rabatt_prozent: string;
  steuersatz: string;
  /** Schlussrechnung: Abzug dieser Abschlagsrechnung (von der App erzeugt, nicht änderbar) */
  abzug_beleg_id?: string | null;
};

export type BezugWahl = { art: "anfrage" | "auftrag" | "ticket" | "neu" | "keiner"; id: string | null; text: string };

export type KopfEingabe = {
  id: string | null;
  art: Belegart;
  nummer: string | null;
  status: string;
  version: number;
  vorgaenger_id: string | null;
  vorgaenger_text: string | null;
  kunde_id: string;
  kunde_name: string;
  kunde_nummer: string;
  bezug: BezugWahl;
  adresse_name: string;
  adresse_zusatz: string;
  adresse_strasse: string;
  adresse_plz: string;
  adresse_ort: string;
  adresse_land: string;
  datum: string;
  titel: string;
  bauvorhaben: string;
  objekt: string;
  einleitung: string;
  lieferbedingungen: string;
  nachbemerkung: string;
  zahlungsbedingung_id: string;
  zahlungsbedingung_text: string;
  zahlungsziel_tage: string;
  skontoziel_tage: string;
  skonto_prozent: string;
  steuerart: Steuerart;
  preise_brutto: boolean;
  gesamtrabatt_prozent: string;
  gueltig_bis: string;
  /** Lieferschein: Lieferdatum */
  liefertermin: string;
  /** AB: geplanter Liefer- bzw. Montagezeitraum; Rechnung: Leistungszeitraum */
  leistung_von: string;
  leistung_bis: string;
  /** Abschlagsrechnung: Eingabe als Prozent vom Auftragswert (brutto) oder als Bruttobetrag */
  abschlag_art: "prozent" | "betrag";
  abschlag_wert: string;
  /** Teilrechnung (aus Teil-AB bzw. deren Lieferschein; setzt der Server) */
  teil: boolean;
  tags: string[];
  kommentar_intern: string;
};

export type EditorZustand = { kopf: KopfEingabe; positionen: PositionEingabe[] };

export const STEUERART_TEXT: Record<Steuerart, string> = {
  standard: "Standard (mit Umsatzsteuer)",
  bauleistung_13b: "§ 13b UStG (Bauleistung)",
  steuerfrei: "Steuerfrei",
};

export const HINWEIS_13B = "Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). Die Umsatzsteuer schuldet der Leistungsempfänger.";
export const HINWEIS_STEUERFREI = "Steuerfreie Leistung, ohne Ausweis der Umsatzsteuer.";

export const EINHEITEN = ["Stk", "Pauschal", "m", "m²", "Std"];
export const STEUERSAETZE = [19, 7, 0];

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Reiner Text → bereinigtes HTML (Absätze und Zeilenumbrüche) */
export function textZuHtml(text: string): string {
  const t = text.replace(/\r\n?/g, "\n").trim();
  if (!t) return "";
  return t
    .split(/\n{2,}/)
    .map((absatz) => `<p>${absatz.split("\n").map(escape).join("<br>")}</p>`)
    .join("");
}

/** HTML → reiner Text (Aufzählungen als „• “, Absätze als Leerzeile); auch für Lexware und das PDF */
export function htmlZuText(html: string | null | undefined): string {
  if (!html) return "";
  // Listen der Reihe nach: Aufzählung „• “, Nummerierung „1. “ (auch verschachtelt)
  const listen: { art: string; n: number }[] = [];
  return html
    .replace(/<\s*(\/?)\s*(ul|ol|li|p|br)\b[^>]*>/gi, (_m, zu: string, tag: string) => {
      const t = tag.toLowerCase();
      if (t === "br") return "\n";
      if (t === "ul" || t === "ol") {
        if (zu) listen.pop();
        else listen.push({ art: t, n: 0 });
        return "\n";
      }
      if (t === "li") {
        if (zu) return "\n";
        const l = listen[listen.length - 1];
        return l?.art === "ol" ? `${++l.n}. ` : "• ";
      }
      return zu ? "\n" : "";
    })
    .replace(/<[^>]+>/g, "")
    // Absatz innerhalb eines Listenpunkts: keine Leerzeile zwischen den Punkten
    .replace(/\n+(?=(• |\d+\. ))/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Platzhalter der Zahlungsbedingung füllen (CLAUDE.md „Zahlungsbedingungen wie in Lexware“) */
export function zahlungsbedingungFuellen(
  text: string,
  w: { datum: string; brutto: number; zahlungsziel: number | null; skontoziel: number | null; skonto: number | null },
): string {
  const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  const tag = (iso: string, plus: number) => {
    const d = new Date(Date.parse(`${iso}T12:00:00Z`) + plus * 864e5);
    return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
  };
  const skontoBetrag = w.skonto ? Math.round(w.brutto * w.skonto) / 100 : 0;
  const werte: Record<string, string> = {
    Zahlungsziel: String(w.zahlungsziel ?? 0),
    Fälligkeitsdatum: tag(w.datum, w.zahlungsziel ?? 0),
    Skonto: w.skonto != null ? `${String(w.skonto).replace(".", ",")} %` : "",
    Skontoziel: String(w.skontoziel ?? ""),
    Skontodatum: w.skontoziel != null ? tag(w.datum, w.skontoziel) : "",
    Skontobetrag: eur(skontoBetrag),
    Betrag: eur(w.brutto),
    "Betrag nach Skonto": eur(w.brutto - skontoBetrag),
  };
  return text.replace(/\{(Zahlungsziel|Fälligkeitsdatum|Skonto|Skontoziel|Skontodatum|Skontobetrag|Betrag|Betrag nach Skonto)\}/g, (_, k: string) => werte[k] ?? "");
}

export const PLATZHALTER = ["{Zahlungsziel}", "{Fälligkeitsdatum}", "{Skonto}", "{Skontoziel}", "{Skontodatum}", "{Skontobetrag}", "{Betrag}", "{Betrag nach Skonto}"];

/** Standardtexte je Belegart, solange keine Textvorlage als Standard markiert ist */
export const STANDARD_TEXTE: Partial<Record<Belegart, { einleitung?: string; nachbemerkung?: string }>> = {
  angebot: { einleitung: "Sehr geehrte Damen und Herren,\nvielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:" },
  auftragsbestaetigung: { einleitung: "Sehr geehrte Damen und Herren,\nvielen Dank für Ihren Auftrag. Hiermit bestätigen wir Ihnen die folgenden Leistungen:" },
  teil_ab: { einleitung: "Sehr geehrte Damen und Herren,\nhiermit bestätigen wir Ihnen die Lieferung folgender Positionen aus unserer Auftragsbestätigung:" },
  lieferschein: { einleitung: "Wir liefern Ihnen folgende Positionen:", nachbemerkung: "Ware vollständig und unbeschädigt erhalten: ______________________ (Datum, Unterschrift)" },
  rechnung: { einleitung: "Sehr geehrte Damen und Herren,\nfür die erbrachten Leistungen erlauben wir uns, folgende Rechnung zu stellen:", nachbemerkung: "Vielen Dank für Ihren Auftrag." },
  abschlagsrechnung: { einleitung: "Sehr geehrte Damen und Herren,\nwie vereinbart berechnen wir Ihnen folgenden Abschlag:", nachbemerkung: "Vielen Dank für Ihren Auftrag." },
  gutschrift: { einleitung: "Zu unserer Rechnung erhalten Sie folgende Korrektur:" },
};

let schluessel = 0;
/** Schlüssel für neue Positionszeilen (bleibt beim Umsortieren gleich) */
export const neuerSchluessel = () => `p${Date.now().toString(36)}${(schluessel++).toString(36)}`;

/** Belegarten, die über Lexware fertiggestellt werden (Nummer und PDF von Lexware) */
export const LEXWARE_ARTEN: Belegart[] = ["rechnung", "abschlagsrechnung", "gutschrift"];

export const leerePosition = (typ: "artikel" | "text" = "artikel"): PositionEingabe => ({
  key: neuerSchluessel(),
  id: null,
  typ,
  titel: "",
  beschreibung: "",
  optional: false,
  menge: "1",
  einheit: typ === "text" ? "" : "Stk",
  einzelpreis: "",
  rabatt_prozent: "",
  steuersatz: "19",
});
