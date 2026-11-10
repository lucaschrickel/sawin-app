import type { Tone } from "@/components/ui/badge";

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

/** Belegarten, die die App in Schritt 1 selbst führt (eigene Nummer, eigenes PDF) */
export const APP_BELEGARTEN: Belegart[] = ["angebot", "auftragsbestaetigung", "lieferschein"];

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
  if (b.art === "auftragsbestaetigung") {
    if (!kette.some((f) => f.art === "lieferschein" && f.status !== "entwurf"))
      return [{ text: "Lieferschein erstellen", href: neu("lieferschein", b.id), ton: "primary" }];
    return [];
  }
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
  if (!belege.some((b) => b.art === "lieferschein"))
    schritte.push({ text: "Lieferschein", href: neu("lieferschein", ab.id), ton: schritte.length ? "secondary" : "primary" });
  return schritte;
}
