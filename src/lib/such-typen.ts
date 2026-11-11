/** Bereiche und Treffer der globalen Suche (im Browser und auf dem Server nutzbar) */
export const SUCH_BEREICHE = [
  ["kunde", "Kunden"],
  ["anfrage", "Anfragen"],
  ["auftrag", "Aufträge"],
  ["beleg", "Belege"],
  ["ticket", "Service-Tickets"],
] as const;
export type SuchBereich = (typeof SUCH_BEREICHE)[number][0];

export type Treffer = {
  bereich: SuchBereich;
  id: string;
  nummer: string | null;
  titel: string;
  details: string;
  betrag: number | null;
  status: string | null;
  /** Wo der Begriff steht, z. B. „Position“, „Tag“, „Lieferadresse“ */
  fundstelle: string;
  /** Text der Fundstelle (null, wenn der Begriff in Nummer, Name oder Titel steht) */
  fundtext: string | null;
  href: string;
};

/** Text in Teile zerlegen, damit der Suchbegriff hervorgehoben werden kann (ohne HTML) */
export function markieren(text: string, q: string): { text: string; treffer: boolean }[] {
  const begriff = q.trim();
  if (!begriff) return [{ text, treffer: false }];
  const teile: { text: string; treffer: boolean }[] = [];
  const klein = text.toLowerCase();
  const b = begriff.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const j = klein.indexOf(b, i);
    if (j < 0) {
      teile.push({ text: text.slice(i), treffer: false });
      break;
    }
    if (j > i) teile.push({ text: text.slice(i, j), treffer: false });
    teile.push({ text: text.slice(j, j + b.length), treffer: true });
    i = j + b.length;
  }
  return teile;
}

/** Ausschnitt um den Suchbegriff (für lange Fundstellen) */
export function ausschnitt(text: string, q: string, breite = 70): string {
  const j = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (j < 0 || text.length <= breite) return text.length > breite ? `${text.slice(0, breite)} …` : text;
  const start = Math.max(0, j - Math.floor((breite - q.length) / 2));
  return `${start > 0 ? "… " : ""}${text.slice(start, start + breite).trim()}${start + breite < text.length ? " …" : ""}`;
}
