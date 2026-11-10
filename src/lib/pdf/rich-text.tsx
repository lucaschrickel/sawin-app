import { Text, View } from "@react-pdf/renderer";

/*
  Bereinigtes HTML (Whitelist, src/lib/html.ts) als PDF: Absätze, Aufzählung „•“, Nummerierung „1.“ (auch
  verschachtelt), fett, kursiv, unterstrichen, Schriftfarbe. Erwartet nur bereinigtes HTML; unbekannte Tags werden
  ignoriert, ihr Text bleibt.
*/

type Lauf = { text: string; fett: boolean; kursiv: boolean; unter: boolean; farbe: string | null };
type Block = { art: "absatz"; laeufe: Lauf[] } | { art: "punkt"; marker: string; tiefe: number; laeufe: Lauf[] };

const ENTITAETEN: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", apos: "'" };
const entschluesseln = (s: string) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
    ENTITAETEN[e.toLowerCase()] ?? (e.startsWith("#x") ? String.fromCodePoint(parseInt(e.slice(2), 16)) : e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1))) : m),
  );

/** HTML → Blöcke mit formatierten Läufen */
export function htmlBloecke(html: string): Block[] {
  const bloecke: Block[] = [];
  const stil: { fett: number; kursiv: number; unter: number; farben: (string | null)[]; spans: { farbe: boolean; fett: boolean }[] } = { fett: 0, kursiv: 0, unter: 0, farben: [], spans: [] };
  const listen: { geordnet: boolean; n: number }[] = [];
  let aktuell: Block | null = null;
  const ziel = (): Block => {
    if (!aktuell) {
      aktuell = { art: "absatz", laeufe: [] };
      bloecke.push(aktuell);
    }
    return aktuell;
  };
  const text = (t: string) => {
    if (!t) return;
    ziel().laeufe.push({ text: t, fett: stil.fett > 0, kursiv: stil.kursiv > 0, unter: stil.unter > 0, farbe: stil.farben.filter(Boolean).at(-1) ?? null });
  };
  for (const [teil] of html.matchAll(/<\/?[a-z]+[^>]*>|[^<]+/gi)) {
    const tag = teil.match(/^<(\/?)([a-z]+)([^>]*)>$/i);
    if (!tag) {
      text(entschluesseln(teil));
      continue;
    }
    const [, zu, nameRoh, attr] = tag;
    const name = nameRoh.toLowerCase();
    if (name === "b" || name === "strong") stil.fett += zu ? -1 : 1;
    else if (name === "i" || name === "em") stil.kursiv += zu ? -1 : 1;
    else if (name === "u") stil.unter += zu ? -1 : 1;
    else if (name === "span") {
      if (zu) {
        const s = stil.spans.pop();
        if (s?.farbe) stil.farben.pop();
        if (s?.fett) stil.fett--;
      } else {
        const farbe = attr.match(/color\s*:\s*(#[0-9a-f]{3,6}|rgb\([^)]*\))/i)?.[1] ?? null;
        const fett = /font-weight\s*:\s*(bold|[6-9]00)/i.test(attr);
        stil.spans.push({ farbe: !!farbe, fett });
        if (farbe) stil.farben.push(farbe);
        if (fett) stil.fett++;
      }
    } else if (name === "br") text("\n");
    else if (name === "ul" || name === "ol") {
      if (zu) listen.pop();
      else listen.push({ geordnet: name === "ol", n: 0 });
      aktuell = null;
    } else if (name === "li") {
      if (zu) aktuell = null;
      else {
        const l = listen.at(-1);
        const marker = l?.geordnet ? `${++l.n}.` : "•";
        aktuell = { art: "punkt", marker, tiefe: Math.max(0, listen.length - 1), laeufe: [] };
        bloecke.push(aktuell);
      }
    } else if (name === "p") {
      const a = aktuell as Block | null;
      if (a?.art === "punkt") {
        // weiterer Absatz im selben Listenpunkt
        if (!zu && a.laeufe.length) text("\n");
      } else if (zu) aktuell = null;
      else {
        aktuell = { art: "absatz", laeufe: [] };
        bloecke.push(aktuell);
      }
    }
  }
  return bloecke.filter((b) => b.laeufe.some((l) => l.text.trim()));
}

const laufStil = (l: Lauf) => ({
  ...(l.fett ? { fontWeight: 600 as const } : {}),
  ...(l.kursiv ? { fontStyle: "italic" as const } : {}),
  ...(l.unter ? { textDecoration: "underline" as const } : {}),
  ...(l.farbe ? { color: l.farbe } : {}),
});

/** Formatierte Beschreibung im PDF (Grundfarbe und Abstand wie bisher die reine Textbeschreibung) */
export function RichPdf({ html, farbe }: { html: string | null | undefined; farbe: string }) {
  if (!html) return null;
  const bloecke = htmlBloecke(html);
  if (!bloecke.length) return null;
  return (
    <View style={{ marginTop: 1 }}>
      {bloecke.map((b, i) =>
        b.art === "absatz" ? (
          <Text key={i} style={{ color: farbe }}>
            {b.laeufe.map((l, j) => (
              <Text key={j} style={laufStil(l)}>{l.text}</Text>
            ))}
          </Text>
        ) : (
          <View key={i} style={{ flexDirection: "row", paddingLeft: b.tiefe * 10 }}>
            <Text style={{ width: b.marker.length > 1 ? 14 : 9, color: farbe }}>{b.marker}</Text>
            <Text style={{ flex: 1, color: farbe }}>
              {b.laeufe.map((l, j) => (
                <Text key={j} style={laufStil(l)}>{l.text}</Text>
              ))}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}
