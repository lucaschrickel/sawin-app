import type { Tone } from "@/components/ui/badge";
import { rund } from "./beleg-summen";

/*
  Belegarten, Status, Kette und „Nächster Schritt“ (CLAUDE.md „Belege“, Demo: bStatus, belegSteps, nextSteps).
  Ohne Server-Abhängigkeiten, für Server- und Client-Komponenten.
*/

export const BELEGARTEN = [
  "angebot",
  "auftragsbestaetigung",
  "teil_ab",
  "lieferschein",
  "abschlagsrechnung",
  "rechnung",
  "zahlungsbestaetigung",
  "gutschrift",
] as const;
export type Belegart = (typeof BELEGARTEN)[number];

/** Belegarten, die die App selbst führt (eigene Nummer, eigenes PDF) */
export const APP_BELEGARTEN: Belegart[] = ["angebot", "auftragsbestaetigung", "lieferschein"];

/** Belegarten, die der Editor anlegt: App-Belege und Lexware-Belege (Rechnung, Abschlag, Gutschrift) */
export const EDITOR_BELEGARTEN: Belegart[] = ["angebot", "auftragsbestaetigung", "lieferschein", "abschlagsrechnung", "rechnung", "gutschrift"];

/** Belegarten, die über Lexware fertiggestellt werden */
export const LEXWARE_BELEGARTEN: Belegart[] = ["abschlagsrechnung", "rechnung", "gutschrift"];

export const BELEGART_TEXT: Record<Belegart, string> = {
  angebot: "Angebot",
  auftragsbestaetigung: "Auftragsbestätigung",
  teil_ab: "Teil-Auftragsbestätigung",
  lieferschein: "Lieferschein",
  abschlagsrechnung: "Abschlagsrechnung",
  rechnung: "Rechnung",
  zahlungsbestaetigung: "Zahlungsbestätigung",
  gutschrift: "Gutschrift",
};

/** Kurzform in Listen */
export const BELEGART_LISTE: Record<Belegart, string> = {
  angebot: "Angebot",
  auftragsbestaetigung: "AB",
  teil_ab: "Teil-AB",
  lieferschein: "Lieferschein",
  abschlagsrechnung: "Abschlag",
  rechnung: "Rechnung",
  zahlungsbestaetigung: "Zahlungsbest.",
  gutschrift: "Gutschrift",
};

/** Kürzel in der Sprungleiste der Kette */
export const BELEGART_KURZ: Record<Belegart, string> = {
  angebot: "AG",
  auftragsbestaetigung: "AB",
  teil_ab: "TAB",
  lieferschein: "LS",
  abschlagsrechnung: "AR",
  rechnung: "RE",
  zahlungsbestaetigung: "ZB",
  gutschrift: "GS",
};

/** Beschriftung der Nummer auf dem PDF */
export const NUMMER_LABEL: Record<Belegart, string> = {
  angebot: "Angebot-Nr.",
  auftragsbestaetigung: "AB-Nr.",
  teil_ab: "AB-Nr.",
  lieferschein: "Lieferschein-Nr.",
  abschlagsrechnung: "Rechnungs-Nr.",
  rechnung: "Rechnungs-Nr.",
  zahlungsbestaetigung: "Beleg-Nr.",
  gutschrift: "Gutschrift-Nr.",
};

const KETTEN_FOLGE: Record<Belegart, number> = {
  angebot: 0,
  auftragsbestaetigung: 1,
  teil_ab: 2,
  lieferschein: 3,
  abschlagsrechnung: 4,
  rechnung: 5,
  zahlungsbestaetigung: 6,
  gutschrift: 7,
};

export type BelegKurz = {
  id: string;
  art: Belegart;
  nummer: string | null;
  status: string;
  datum: string;
  kette_id: string;
  vorgaenger_id: string | null;
  titel: string | null;
  summe_brutto: number;
  gueltig_bis: string | null;
  teil?: boolean;
  faellig_am?: string | null;
  offen_betrag?: number | null;
  abschlag_nr?: number | null;
};

/** Belege in Kettenfolge (Art, dann Datum, dann Nummer) */
export function ketteSortiert<T extends BelegKurz>(belege: T[]): T[] {
  return [...belege].sort(
    (a, b) =>
      KETTEN_FOLGE[a.art] - KETTEN_FOLGE[b.art] ||
      a.datum.localeCompare(b.datum) ||
      (a.nummer ?? "~").localeCompare(b.nummer ?? "~"),
  );
}

export type AnzeigeStatus = { key: string; text: string; ton: Tone };

const S = (key: string, text: string, ton: Tone): AnzeigeStatus => ({ key, text, ton });

/**
 * Status zur Anzeige. Die AB ist aus der Kette berechnet: Bestätigt → In Abwicklung (Folgebeleg) → Abgerechnet
 * (Schluss- bzw. Rechnung fertig). „Abgelaufen“ ist kein gespeicherter Status: offenes Angebot nach „Gültig bis“.
 */
export function anzeigeStatus(b: BelegKurz, kette: BelegKurz[], heute: string): AnzeigeStatus {
  if (b.status === "entwurf") return S("entwurf", "Entwurf", "gray");
  switch (b.art) {
    case "angebot":
      if (b.status === "offen") return b.gueltig_bis && b.gueltig_bis < heute ? S("abgelaufen", "Abgelaufen", "amber") : S("offen", "Offen", "blue");
      if (b.status === "angenommen") return S("angenommen", "Angenommen", "green");
      if (b.status === "abgelehnt") return S("abgelehnt", "Abgelehnt", "red");
      return S("nicht_beauftragt", "Nicht beauftragt", "gray");
    case "auftragsbestaetigung": {
      const fertig = kette.filter((f) => f.id !== b.id && f.status !== "entwurf");
      if (fertig.some((f) => f.art === "rechnung" && !f.teil)) return S("abgerechnet", "Abgerechnet", "green");
      if (fertig.some((f) => ["teil_ab", "lieferschein", "abschlagsrechnung", "rechnung"].includes(f.art))) return S("in_abwicklung", "In Abwicklung", "amber");
      return S("bestaetigt", "Bestätigt", "blue");
    }
    case "teil_ab":
      return S("bestaetigt", "Bestätigt", "blue");
    case "lieferschein":
    case "zahlungsbestaetigung":
      return S("erstellt", "Erstellt", "blue");
    default:
      if (b.status === "bezahlt") return S("bezahlt", "Bezahlt", "green");
      if (b.art !== "gutschrift" && b.faellig_am && b.faellig_am < heute && (b.offen_betrag ?? 1) > 0) return S("ueberfaellig", "Überfällig", "red");
      return S("offen", "Offen", "blue");
  }
}

/** Angebot und AB bleiben nach dem Fertigstellen bearbeitbar, bis ein Folgebeleg existiert (wie app.beleg_bearbeitbar) */
export function bearbeitbar(b: BelegKurz, kette: BelegKurz[]): boolean {
  if (b.status === "entwurf") return true;
  if (b.art === "angebot") return !kette.some((f) => f.vorgaenger_id === b.id && f.art === "auftragsbestaetigung");
  if (b.art === "auftragsbestaetigung")
    return !kette.some((f) => f.id !== b.id && f.status !== "entwurf" && ["teil_ab", "lieferschein", "abschlagsrechnung", "rechnung"].includes(f.art));
  return false;
}

export type Schritt = {
  text: string;
  /** Link (öffnet z. B. den Editor) */
  href?: string;
  /** Aktion auf dem Angebot */
  aktion?: "angenommen" | "abgelehnt";
  ton: "primary" | "secondary" | "danger";
};

const neu = (art: Belegart, vorgaenger: string) => `/beleg/neu?art=${art}&vorgaenger=${vorgaenger}`;
const weiter = (b: BelegKurz): Schritt => ({ text: `${BELEGART_TEXT[b.art]} weiter bearbeiten`, href: `/beleg/${b.id}`, ton: "primary" });

/**
 * Nächster Schritt auf der Belegseite: nur Schritte, die von genau diesem Beleg ausgehen. Gibt es schon einen
 * Entwurf als Folgebeleg, steht nur „… weiter bearbeiten“ da.
 */
export function belegSchritte(b: BelegKurz, kette: BelegKurz[]): Schritt[] {
  if (b.status === "entwurf" || ["abgelehnt", "nicht_beauftragt"].includes(b.status)) return [];
  const folgeEntwurf = kette.find((f) => f.vorgaenger_id === b.id && f.status === "entwurf");
  if (folgeEntwurf) return [weiter(folgeEntwurf)];
  if (b.art === "angebot") {
    if (b.status === "offen")
      return [
        { text: "Angebot angenommen", aktion: "angenommen", ton: "primary" },
        { text: "Abgelehnt", aktion: "abgelehnt", ton: "danger" },
      ];
    if (b.status === "angenommen" && !kette.some((f) => f.art === "auftragsbestaetigung"))
      return [{ text: "Auftragsbestätigung erstellen", href: neu("auftragsbestaetigung", b.id), ton: "primary" }];
    return [];
  }
  const fertig = kette.filter((f) => f.status !== "entwurf");
  const schluss = fertig.find((f) => f.art === "rechnung" && !f.teil);
  const abschlaege = fertig.filter((f) => f.art === "abschlagsrechnung");
  const rechnungText = abschlaege.length ? "Schlussrechnung erstellen" : "Rechnung erstellen";
  if (b.art === "auftragsbestaetigung") {
    if (schluss) return [];
    const schritte: Schritt[] = [];
    if (!fertig.some((f) => f.art === "lieferschein")) schritte.push({ text: "Lieferschein erstellen", href: neu("lieferschein", b.id), ton: "primary" });
    schritte.push({ text: rechnungText, href: neu("rechnung", b.id), ton: schritte.length ? "secondary" : "primary" });
    schritte.push({ text: "Abschlagsrechnung", href: neu("abschlagsrechnung", b.id), ton: "secondary" });
    return schritte;
  }
  if (b.art === "lieferschein" && !schluss) return [{ text: rechnungText, href: neu("rechnung", b.id), ton: "primary" }];
  if (b.art === "rechnung") return [{ text: "Gutschrift erstellen", href: neu("gutschrift", b.id), ton: "secondary" }];
  return [];
}

/**
 * Nächster Schritt am Auftrag (alle Belege des Auftrags). Ohne AB (Auftrag aus der Zeit vor dem Beleg-Modul):
 * „Auftragsbestätigung erstellen“.
 */
export function auftragSchritte(auftragId: string, belege: BelegKurz[]): Schritt[] {
  const entwuerfe = belege.filter((b) => b.status === "entwurf");
  const ab = belege.find((b) => b.art === "auftragsbestaetigung" && b.status !== "entwurf");
  const schritte: Schritt[] = entwuerfe.map(weiter);
  if (!ab) {
    if (!entwuerfe.some((b) => b.art === "auftragsbestaetigung"))
      schritte.push({ text: "Auftragsbestätigung erstellen", href: `/beleg/neu?art=auftragsbestaetigung&auftrag=${auftragId}`, ton: "primary" });
    return schritte;
  }
  const fertig = belege.filter((b) => b.status !== "entwurf");
  const schluss = fertig.find((b) => b.art === "rechnung" && !b.teil);
  const ton = (): Schritt["ton"] => (schritte.length ? "secondary" : "primary");
  if (schluss) {
    // Nach der Schlussrechnung nur noch Gutschriften
    if (!entwuerfe.some((b) => b.art === "gutschrift")) schritte.push({ text: `Gutschrift zu ${schluss.nummer ?? "Rechnung"}`, href: neu("gutschrift", schluss.id), ton: "secondary" });
    return schritte;
  }
  if (!belege.some((b) => b.art === "lieferschein"))
    schritte.push({ text: "Lieferschein", href: neu("lieferschein", ab.id), ton: ton() });
  if (!entwuerfe.some((b) => b.art === "rechnung"))
    schritte.push({ text: fertig.some((b) => b.art === "abschlagsrechnung") ? "Schlussrechnung" : "Rechnung", href: `/beleg/neu?art=rechnung&auftrag=${auftragId}`, ton: ton() });
  if (!entwuerfe.some((b) => b.art === "abschlagsrechnung"))
    schritte.push({ text: "Abschlagsrechnung", href: `/beleg/neu?art=abschlagsrechnung&auftrag=${auftragId}`, ton: "secondary" });
  return schritte;
}

/**
 * Finanzen eines Auftrags (CLAUDE.md „Aufträge“): Auftragswert = Summe der AB; Auftragsbestand (noch nicht
 * berechnet) = AB − Abschläge − Rechnungen + Gutschriften; offen = noch nicht bezahlte Abschläge und Rechnungen.
 */
export function auftragFinanzen<T extends BelegKurz>(belege: T[]) {
  const fertig = belege.filter((b) => b.status !== "entwurf");
  const ab = fertig.find((b) => b.art === "auftragsbestaetigung") ?? null;
  const abschlaege = fertig.filter((b) => b.art === "abschlagsrechnung").sort((a, b) => (a.abschlag_nr ?? 0) - (b.abschlag_nr ?? 0));
  const rechnungen = fertig.filter((b) => b.art === "rechnung");
  const gutschriften = fertig.filter((b) => b.art === "gutschrift");
  const summe = (xs: T[]) => rund(xs.reduce((s, b) => s + b.summe_brutto, 0));
  const wert = ab?.summe_brutto ?? 0;
  return {
    ab,
    wert,
    abschlaege,
    rechnungen,
    gutschriften,
    bestand: ab ? rund(wert - summe(abschlaege) - summe(rechnungen) + summe(gutschriften)) : 0,
    offen: rund([...abschlaege, ...rechnungen].reduce((s, b) => s + (b.status === "bezahlt" ? 0 : (b.offen_betrag ?? b.summe_brutto)), 0)),
    abschlaegeBezahlt: abschlaege.filter((b) => b.status === "bezahlt").length,
  };
}
