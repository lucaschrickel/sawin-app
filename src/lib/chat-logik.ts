/*
  Chat (CLAUDE.md „Chat“): Erwähnungen mit @Kürzel, Hervorhebung im Text, Dateiname der Fotos in der Ablage. Ohne
  Abhängigkeiten, im Browser, auf dem Server und in den Unit-Tests (tests/unit/chat.test.ts) nutzbar.
*/

export type ChatPerson = { id: string; name: string; kuerzel: string };

const ERWAEHNUNG = /(^|[^\p{L}\p{N}@])@([\p{L}]{1,4})(?![\p{L}\p{N}])/gu;

/** Erwähnte Personen (Kürzel ohne Unterschied in Groß-/Kleinschreibung), jede nur einmal, ohne den Autor */
export function erwaehnte(text: string, personen: ChatPerson[], autor?: string): ChatPerson[] {
  const nachKuerzel = new Map(personen.map((p) => [p.kuerzel.toUpperCase(), p]));
  const treffer = new Map<string, ChatPerson>();
  for (const m of text.matchAll(ERWAEHNUNG)) {
    const p = nachKuerzel.get(m[2].toUpperCase());
    if (p && p.id !== autor) treffer.set(p.id, p);
  }
  return [...treffer.values()];
}

/** Text in Teile zerlegen: bekannte Erwähnungen hervorheben, alles andere unverändert (Ausgabe als Text, nie als HTML) */
export function textTeile(text: string, kuerzel: string[]): { text: string; erwaehnung: boolean }[] {
  const bekannt = new Set(kuerzel.map((k) => k.toUpperCase()));
  const teile: { text: string; erwaehnung: boolean }[] = [];
  let rest = 0;
  for (const m of text.matchAll(ERWAEHNUNG)) {
    if (!bekannt.has(m[2].toUpperCase())) continue;
    const start = m.index + m[1].length;
    if (start > rest) teile.push({ text: text.slice(rest, start), erwaehnung: false });
    teile.push({ text: `@${m[2]}`, erwaehnung: true });
    rest = start + m[2].length + 1;
  }
  if (rest < text.length) teile.push({ text: text.slice(rest), erwaehnung: false });
  return teile;
}

/** Erwähnung an das Textende anfügen (Auswahl „@ erwähnen“) */
export const erwaehnungAnfuegen = (text: string, kuerzel: string) => `${text.replace(/\s*$/, text.trim() ? " " : "")}@${kuerzel} `;

/** Dateiname eines Chat-Fotos in der Ablage: Chat_<JJJJ-MM-TT_HHMM>_<Kürzel>.<Endung> (Zeit in Berlin) */
export function chatFotoName(zeitLokal: string, kuerzel: string | null, mime: string): string {
  const endung = mime === "image/png" ? "png" : mime === "image/heic" || mime === "image/heif" ? "heic" : "jpg";
  const zeit = zeitLokal.slice(0, 16).replace("T", "_").replace(":", "");
  return `Chat_${zeit}${kuerzel ? `_${kuerzel}` : ""}.${endung}`;
}
