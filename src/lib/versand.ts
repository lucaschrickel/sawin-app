/*
  Vorläufiger Versand in Version 1 (CLAUDE.md „Versand in Version 1“): Dateiname des Beleg-PDFs und mailto-Link für
  Outlook. Ohne Abhängigkeiten, im Browser, auf dem Server und in den Unit-Tests (tests/unit/versand.test.ts) nutzbar.
*/

/** Text für Dateinamen: Umlaute ausschreiben, alles außer Buchstaben, Ziffern und Bindestrich wird „_“ */
export function dateiTeil(text: string, max = 40): string {
  const t = text
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return t.slice(0, max).replace(/_+$/, "");
}

/** Dateiname zum Herunterladen und Versenden: <Nummer>[_V<n>]_<Belegart>_<Kunde>.pdf */
export function versandDateiname(b: { nummer: string | null; version: number; artText: string; kunde: string | null }): string {
  const teile = [dateiTeil(b.nummer ?? "Entwurf", 30) + (b.version > 1 ? `_V${b.version}` : ""), dateiTeil(b.artText, 30), dateiTeil(b.kunde ?? "", 40)].filter(Boolean);
  return `${teile.join("_")}.pdf`;
}

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
/** E-Mail-Adressen aus einem Eingabefeld (Komma, Semikolon oder Leerzeichen getrennt); null, wenn eine ungültig ist */
export function adressenLesen(text: string): string[] | null {
  const liste = text
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return liste.every((x) => EMAIL.test(x)) ? [...new Set(liste)] : null;
}

/** mailto-Link für Outlook: Empfänger, BCC, Betreff, Text (Zeilenumbrüche als CRLF) */
export function mailtoLink(m: { an: string[]; bcc: string[]; betreff: string; text: string }): string {
  const teile = [
    m.bcc.length ? `bcc=${m.bcc.map(encodeURIComponent).join(",")}` : "",
    `subject=${encodeURIComponent(m.betreff)}`,
    `body=${encodeURIComponent(m.text.replace(/\r?\n/g, "\r\n"))}`,
  ].filter(Boolean);
  return `mailto:${m.an.map(encodeURIComponent).join(",")}?${teile.join("&")}`;
}

/** Outlook übernimmt mailto-Links zuverlässig bis etwa 2000 Zeichen */
export const MAILTO_GRENZE = 2000;

/** Artikel im Akkusativ für den Mailtext: „unser Angebot“, „unseren Lieferschein“, „unsere Rechnung“ */
const ARTIKEL: Record<string, string> = { angebot: "unser", lieferschein: "unseren" };

/** Vorbelegung von Betreff und Text */
export function versandVorlage(b: { art: string; artText: string; nummer: string | null; datum: string; bauvorhaben: string | null; firma: string | null; version: number }) {
  const datum = `${b.datum.slice(8, 10)}.${b.datum.slice(5, 7)}.${b.datum.slice(0, 4)}`;
  const was = `${ARTIKEL[b.art] ?? "unsere"} ${b.artText} ${b.nummer ?? ""}`.trim();
  return {
    betreff: [`${b.artText} ${b.nummer ?? ""}`.trim(), b.version > 1 ? `Version ${b.version}` : "", b.bauvorhaben ?? ""].filter(Boolean).join(" – "),
    text: [
      "Guten Tag,",
      "",
      `anbei erhalten Sie ${was} vom ${datum}${b.bauvorhaben ? ` zum Bauvorhaben ${b.bauvorhaben}` : ""}.`,
      "",
      "Bei Fragen sind wir gern für Sie da.",
      "",
      "Mit freundlichen Grüßen",
      b.firma ?? "",
    ]
      .join("\n")
      .trim(),
  };
}
