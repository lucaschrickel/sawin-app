/*
  Formatierte Texte (Positions- und Artikelbeschreibungen, CLAUDE.md „Formatierte Texte“, Sicherheit Punkt 11).
  Gespeichert wird bereinigtes HTML nach Whitelist: b, strong, i, em, u, ul, ol, li, p, br und span nur mit color bzw.
  font-weight. Der Server bereinigt vor jedem Speichern; das PDF und Lexware lesen nur bereinigtes HTML.
  Unit-Tests: tests/unit/html.test.ts.
*/
import sanitizeHtml from "sanitize-html";
import { textZuHtml } from "./beleg-typen.ts";

const FARBE = [/^#[0-9a-f]{3}$/i, /^#[0-9a-f]{6}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i];

const REGELN: sanitizeHtml.IOptions = {
  allowedTags: ["b", "strong", "i", "em", "u", "ul", "ol", "li", "p", "br", "span"],
  allowedAttributes: { span: ["style"] },
  allowedStyles: { span: { color: FARBE, "font-weight": [/^(bold|[1-9]00)$/] } },
  allowedSchemes: [],
  disallowedTagsMode: "discard",
  // Inhalt von script/style usw. vollständig entfernen, nicht als Text stehen lassen
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "svg", "math"],
};

/** span ohne (erlaubten) Stil entfernen, Inhalt behalten */
function leereSpansAuspacken(html: string): string {
  let vorher = "";
  let s = html;
  while (s !== vorher) {
    vorher = s;
    s = s.replace(/<span>((?:(?!<span[\s>])[\s\S])*?)<\/span>/gi, "$1");
  }
  return s;
}

/** Sieht der Wert wie HTML aus (sonst reiner Text mit Zeilenumbrüchen)? */
export const istHtml = (wert: string) => /^\s*<(p|ul|ol|b|strong|i|em|u|span|br)\b/i.test(wert);

/**
 * Bereinigt formatierten Text nach der Whitelist. Reiner Text (z. B. aus älteren Belegen oder von der App erzeugte
 * Abzugspositionen) wird vorher in Absätze umgewandelt. Leerer Inhalt („<p></p>“) ergibt "".
 */
export function htmlBereinigen(wert: string | null | undefined, maxLaenge = 20000): string {
  const roh = String(wert ?? "").slice(0, maxLaenge * 2);
  const html = istHtml(roh) ? roh : textZuHtml(roh);
  const sauber = leereSpansAuspacken(sanitizeHtml(html, REGELN)).trim();
  const leer = sauber.replace(/<\/?(p|br|span|b|strong|i|em|u)[^>]*>/gi, "").trim() === "" && !/<(ul|ol)/i.test(sauber);
  return leer ? "" : sauber.slice(0, maxLaenge);
}
