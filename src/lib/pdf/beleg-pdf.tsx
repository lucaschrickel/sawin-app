import "server-only";
import path from "node:path";
import { Document, Font, G, Page, Path, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { LogoPfade } from "@/customers/types";
import { belegSummen, type Summen } from "@/lib/beleg-summen";
import { RichPdf } from "./rich-text";
import { HINWEIS_13B, HINWEIS_STEUERFREI, htmlZuText, zahlungsbedingungFuellen } from "@/lib/beleg-typen";
import { BELEGART_TEXT, NUMMER_LABEL, type Belegart } from "@/lib/belege-status";
import { eur } from "@/lib/format";

/*
  Beleg-PDF im Design der Demo (docHtml): Logo und Firmenzeile, Empfänger, Belegdaten, Titel, Positionen,
  Summen, Steuerhinweis, Texte, Fuß mit Firmendaten auf jeder Seite. A4, Tabellenkopf auf jeder Seite, eine Position
  wird nie getrennt, „ENTWURF“ auf jeder Seite. Papier bleibt immer hell: feste helle Farben (wie die hellen Tokens).
*/

const SCHRIFT = path.join(process.cwd(), "node_modules/@fontsource/inter/files");
let registriert = false;
function schriften() {
  if (registriert) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(SCHRIFT, "inter-latin-400-normal.woff") },
      { src: path.join(SCHRIFT, "inter-latin-600-normal.woff"), fontWeight: 600 },
      { src: path.join(SCHRIFT, "inter-latin-700-normal.woff"), fontWeight: 700 },
      { src: path.join(SCHRIFT, "inter-latin-400-italic.woff"), fontStyle: "italic" },
      { src: path.join(SCHRIFT, "inter-latin-600-italic.woff"), fontWeight: 600, fontStyle: "italic" },
      { src: path.join(SCHRIFT, "inter-latin-700-italic.woff"), fontWeight: 700, fontStyle: "italic" },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  registriert = true;
}

// Helle Werte wie in src/styles/tokens.css (Papier)
const F = { ink: "#171717", ink3: "#4b4f55", muted: "#5f646b", line: "#e9e6e1", lineStrong: "#d9d3ca", logoInk: "#2E2B28", sand: "#8a6140", wasser: "#A33A2E" };

const st = StyleSheet.create({
  seite: { fontFamily: "Inter", fontSize: 10, lineHeight: 1.5, color: F.ink, paddingTop: 42, paddingBottom: 78, paddingHorizontal: 54 },
  zeile: { flexDirection: "row", justifyContent: "space-between" },
  klein: { fontSize: 8.6, color: F.muted },
  absender: { fontSize: 7.4, color: F.muted, textDecoration: "underline", marginBottom: 6 },
  datenZeile: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  datenName: { color: F.muted, width: 92, textAlign: "right" },
  datenWert: { width: 92 },
  titel: { fontSize: 15, fontWeight: 700, marginTop: 30 },
  th: { fontSize: 7, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 5, paddingBottom: 6 },
  td: { paddingHorizontal: 5, paddingVertical: 7 },
  posZeile: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: F.line },
  summenZeile: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  fuss: { position: "absolute", bottom: 28, left: 54, right: 54, flexDirection: "row", gap: 18, borderTopWidth: 0.6, borderTopColor: F.line, paddingTop: 8, fontSize: 7, color: F.muted, lineHeight: 1.45 },
});

export type PdfFirma = {
  firma_name: string | null;
  firma_zusatz: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  website: string | null;
  ust_id: string | null;
  steuernummer: string | null;
  handelsregister: string | null;
  geschaeftsfuehrung: string | null;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
};

export type PdfBeleg = {
  art: Belegart;
  nummer: string | null;
  version: number;
  datum: string;
  kundennummer: string | null;
  bezug_nummer: string | null;
  adresse_name: string | null;
  adresse_zusatz: string | null;
  adresse_strasse: string | null;
  adresse_plz: string | null;
  adresse_ort: string | null;
  adresse_land: string | null;
  titel: string | null;
  bauvorhaben: string | null;
  objekt: string | null;
  einleitung: string | null;
  lieferbedingungen: string | null;
  nachbemerkung: string | null;
  zahlungsbedingung_text: string | null;
  zahlungsziel_tage: number | null;
  skontoziel_tage: number | null;
  skonto_prozent: number | null;
  steuerart: "standard" | "bauleistung_13b" | "steuerfrei";
  preise_brutto: boolean;
  gesamtrabatt_prozent: number;
  gueltig_bis: string | null;
  liefertermin: string | null;
  leistung_von: string | null;
  leistung_bis: string | null;
  /** Zahlungsbestätigung: bestätigte Zahlung, Rechnung und Restbetrag (keine Positionen, keine Umsatzsteuer) */
  bestaetigung?: { datum: string; betrag: number; zahlungsart: string; rechnung: { art: Belegart; nummer: string | null; datum: string; summe_brutto: number }; rest: number } | null;
};

export type PdfPosition = {
  typ: "artikel" | "text";
  titel: string;
  beschreibung_html: string | null;
  optional: boolean;
  menge: number;
  einheit: string | null;
  einzelpreis: number;
  rabatt_prozent: number;
  steuersatz: number;
  /** Abzug eines Abschlags in der Schlussrechnung (ohne Gesamtrabatt) */
  abzug_beleg_id?: string | null;
};

const tag = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const menge = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 3 });
const zeilen = (...t: (string | null | undefined)[]) => t.filter((x): x is string => !!x && !!x.trim());

function Logo({ l, breite }: { l: LogoPfade; breite: number }) {
  const [, , w, h] = l.viewBoxVoll.split(" ").map(Number);
  return (
    <Svg viewBox={l.viewBoxVoll} style={{ width: breite, height: (breite * h) / w }}>
      {l.flaechen.map((p, i) => (
        <Path key={`f${i}`} d={p.d} fill={p.fill} />
      ))}
      <G>
        {l.striche.map((p, i) => (
          <Path key={`s${i}`} d={p.d} fill="none" stroke={F.logoInk} strokeWidth={p.breite} />
        ))}
      </G>
      {l.wortmarke.map((p, i) => (
        <Path key={`w${i}`} d={p.d} fill={p.fill === "ink" ? F.logoInk : p.fill} />
      ))}
    </Svg>
  );
}

function Daten({ name, wert }: { name: string; wert: string }) {
  return (
    <View style={st.datenZeile}>
      <Text style={st.datenName}>{name}</Text>
      <Text style={st.datenWert}>{wert}</Text>
    </View>
  );
}

function Absatz({ text, fett }: { text: string | null; fett?: boolean }) {
  if (!text?.trim()) return null;
  return <Text style={{ marginTop: 12, fontWeight: fett ? 600 : 400 }}>{text.trim()}</Text>;
}

/** Spalten der Positionstabelle (Breiten in pt, Bezeichnung nimmt den Rest) */
function spalten(preise: boolean, rabatt: boolean, ust: boolean) {
  return { pos: 30, menge: 62, ep: preise ? 70 : 0, rabatt: preise && rabatt ? 40 : 0, ust: preise && ust ? 36 : 0, gesamt: preise ? 72 : 0 };
}

function BelegDokument({ b, positionen, firma, logo, entwurf }: { b: PdfBeleg; positionen: PdfPosition[]; firma: PdfFirma; logo: LogoPfade; entwurf: boolean }) {
  const zb = b.art === "zahlungsbestaetigung";
  const preise = b.art !== "lieferschein" && !zb;
  const s: Summen = belegSummen(positionen.map((p) => ({ ...p, abzug: !!p.abzug_beleg_id })), b);
  const mitRabatt = positionen.some((p) => p.typ === "artikel" && p.rabatt_prozent > 0);
  const saetze = new Set(positionen.filter((p) => p.typ === "artikel").map((p) => p.steuersatz));
  const sp = spalten(preise, mitRabatt, !s.ohne_steuer && saetze.size > 1);
  const nummer = b.nummer ?? (["rechnung", "abschlagsrechnung", "gutschrift"].includes(b.art) ? "vergibt Lexware beim Fertigstellen" : "wird beim Fertigstellen vergeben");
  const firmaZeile = zeilen(firma.firma_name, [firma.strasse, zeilen(firma.plz, firma.ort).join(" ")].filter(Boolean).join(" · ")).join(" · ");
  const zusatz: [string, string][] = [];
  if (b.art === "angebot" && b.gueltig_bis) zusatz.push(["Gültig bis", tag(b.gueltig_bis)]);
  if (b.art === "auftragsbestaetigung" && (b.leistung_von || b.leistung_bis))
    zusatz.push(["Liefer-/Montagezeit", b.leistung_von && b.leistung_bis && b.leistung_von !== b.leistung_bis ? `${tag(b.leistung_von)} – ${tag(b.leistung_bis)}` : tag(b.leistung_von || b.leistung_bis)]);
  if (b.art === "lieferschein" && b.liefertermin) zusatz.push(["Lieferdatum", tag(b.liefertermin)]);
  if (b.art === "teil_ab" && b.liefertermin) zusatz.push(["Liefertermin", tag(b.liefertermin)]);
  if (["rechnung", "abschlagsrechnung", "gutschrift"].includes(b.art) && (b.leistung_von || b.leistung_bis))
    zusatz.push(["Leistungsdatum", b.leistung_von && b.leistung_bis && b.leistung_von !== b.leistung_bis ? `${tag(b.leistung_von)} – ${tag(b.leistung_bis)}` : tag(b.leistung_von || b.leistung_bis)]);
  const zahlung =
    preise && b.zahlungsbedingung_text
      ? zahlungsbedingungFuellen(b.zahlungsbedingung_text, { datum: b.datum, brutto: s.brutto, zahlungsziel: b.zahlungsziel_tage, skontoziel: b.skontoziel_tage, skonto: b.skonto_prozent })
      : null;
  const preisKopf = s.brutto_eingabe ? "Einzel brutto" : "Einzel netto";

  return (
    <Document title={`${BELEGART_TEXT[b.art]} ${b.nummer ?? "Entwurf"}`} author={firma.firma_name ?? undefined} creator={firma.firma_name ?? undefined} producer="Sawin-App">
      <Page size="A4" style={st.seite}>
        {entwurf && (
          <View fixed style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 96, fontWeight: 700, color: F.wasser, opacity: 0.1, transform: "rotate(-28deg)" }}>ENTWURF</Text>
          </View>
        )}

        {/* Kopf: Logo und Firmenzeile, rechts E-Mail und Website */}
        <View style={st.zeile}>
          <View>
            <Logo l={logo} breite={177} />
            <Text style={[st.klein, { marginTop: 6 }]}>{zeilen(firma.strasse, zeilen(firma.plz, firma.ort).join(" "), firma.telefon).join(" · ")}</Text>
          </View>
          <View style={{ alignItems: "flex-end", paddingTop: 4 }}>
            {zeilen(firma.email, firma.website).map((t) => (
              <Text key={t} style={st.klein}>{t}</Text>
            ))}
          </View>
        </View>

        {/* Empfänger und Belegdaten */}
        <View style={[st.zeile, { marginTop: 36 }]}>
          <View style={{ width: 250 }}>
            {firmaZeile ? <Text style={st.absender}>{firmaZeile}</Text> : null}
            <Text style={{ fontWeight: 600 }}>{b.adresse_name ?? ""}</Text>
            {zeilen(b.adresse_zusatz, b.adresse_strasse, zeilen(b.adresse_plz, b.adresse_ort).join(" "), b.adresse_land && b.adresse_land !== "Deutschland" ? b.adresse_land : null).map((t, i) => (
              <Text key={i}>{t}</Text>
            ))}
          </View>
          <View style={{ fontSize: 9.4 }}>
            <Daten name={NUMMER_LABEL[b.art]} wert={nummer} />
            {b.version > 1 && <Daten name="Version" wert={String(b.version)} />}
            <Daten name="Datum" wert={tag(b.datum)} />
            {b.kundennummer && <Daten name="Kunden-Nr." wert={b.kundennummer} />}
            {b.bezug_nummer && b.art !== "auftragsbestaetigung" && b.art !== "angebot" && <Daten name="Auftrag" wert={b.bezug_nummer} />}
            {zusatz.map(([n, w]) => (
              <Daten key={n} name={n} wert={w} />
            ))}
          </View>
        </View>

        <Text style={st.titel}>{zeilen(b.titel || BELEGART_TEXT[b.art], b.nummer).join(" ")}</Text>
        {(b.bauvorhaben || b.objekt) && (
          <Text style={{ marginTop: 3, color: F.ink3 }}>
            {zeilen(b.bauvorhaben ? `Bauvorhaben: ${b.bauvorhaben}` : null, b.objekt ? `${b.art === "lieferschein" ? "Lieferanschrift" : "Objekt"}: ${b.objekt}` : null).join(" · ")}
          </Text>
        )}
        <Absatz text={b.einleitung} />

        {zb && b.bestaetigung && (
          <View style={{ marginTop: 18 }}>
            <Text>Wir bestätigen den Eingang folgender Zahlung:</Text>
            <View style={{ marginTop: 10, width: 330 }}>
              {(
                [
                  [`Zu ${BELEGART_TEXT[b.bestaetigung.rechnung.art]}`, `${b.bestaetigung.rechnung.nummer ?? ""} vom ${tag(b.bestaetigung.rechnung.datum)}`],
                  [`Betrag der ${BELEGART_TEXT[b.bestaetigung.rechnung.art]}`, eur(b.bestaetigung.rechnung.summe_brutto)],
                  ["Zahlungseingang am", tag(b.bestaetigung.datum)],
                  ["Zahlungsart", b.bestaetigung.zahlungsart],
                ] as [string, string][]
              ).map(([n, w]) => (
                <View key={n} style={st.summenZeile}>
                  <Text style={{ color: F.ink3 }}>{n}</Text>
                  <Text>{w}</Text>
                </View>
              ))}
              <View style={[st.summenZeile, { borderTopWidth: 1.4, borderTopColor: F.ink, marginTop: 4, paddingTop: 5 }]}>
                <Text style={{ fontWeight: 700, fontSize: 12 }}>Gezahlter Betrag</Text>
                <Text style={{ fontWeight: 700, fontSize: 12 }}>{eur(b.bestaetigung.betrag)}</Text>
              </View>
              <View style={st.summenZeile}>
                <Text style={{ color: F.ink3 }}>Restbetrag</Text>
                <Text>{eur(b.bestaetigung.rest)}</Text>
              </View>
            </View>
            <Absatz fett text="Diese Zahlungsbestätigung ist keine Rechnung." />
          </View>
        )}

        {/* Positionen */}
        {!zb && (
        <View style={{ marginTop: 18 }}>
          <View fixed style={{ flexDirection: "row", borderBottomWidth: 1.4, borderBottomColor: F.ink }}>
            <Text style={[st.th, { width: sp.pos }]}>Pos.</Text>
            <Text style={[st.th, { flex: 1 }]}>Bezeichnung</Text>
            <Text style={[st.th, { width: sp.menge, textAlign: "right" }]}>Menge</Text>
            {sp.ep > 0 && <Text style={[st.th, { width: sp.ep, textAlign: "right" }]}>{preisKopf}</Text>}
            {sp.rabatt > 0 && <Text style={[st.th, { width: sp.rabatt, textAlign: "right" }]}>Rabatt</Text>}
            {sp.ust > 0 && <Text style={[st.th, { width: sp.ust, textAlign: "right" }]}>USt</Text>}
            {sp.gesamt > 0 && <Text style={[st.th, { width: sp.gesamt, textAlign: "right" }]}>Gesamt</Text>}
          </View>
          {(() => {
            const nummern = positionen.reduce<(number | null)[]>((acc, p) => [...acc, p.typ === "artikel" ? acc.filter((x) => x !== null).length + 1 : null], []);
            return positionen.map((p, i) => {
              const nr = nummern[i];
              const beschreibung = p.beschreibung_html && htmlZuText(p.beschreibung_html) ? p.beschreibung_html : null;
              if (p.typ === "text")
                return (
                  <View key={i} wrap={false} style={st.posZeile}>
                    <Text style={[st.td, { width: sp.pos }]} />
                    <View style={[st.td, { flex: 1 }]}>
                      {p.titel ? <Text style={{ fontWeight: 600, color: F.ink3 }}>{p.titel}</Text> : null}
                      <RichPdf html={beschreibung} farbe={F.ink3} />
                    </View>
                  </View>
                );
              const betrag = s.zeilen[i] ?? 0;
              return (
                <View key={i} wrap={false} style={st.posZeile}>
                  <Text style={[st.td, { width: sp.pos, color: F.muted }]}>{nr}</Text>
                  <View style={[st.td, { flex: 1 }]}>
                    {p.optional && <Text style={{ fontSize: 6.6, fontWeight: 700, letterSpacing: 0.8, color: F.sand }}>OPTIONAL</Text>}
                    <Text style={{ fontWeight: 600 }}>{p.titel}</Text>
                    <RichPdf html={beschreibung} farbe={F.ink3} />
                  </View>
                  <Text style={[st.td, { width: sp.menge, textAlign: "right" }]}>{`${menge(p.menge)} ${p.einheit ?? ""}`.trim()}</Text>
                  {sp.ep > 0 && <Text style={[st.td, { width: sp.ep, textAlign: "right" }]}>{eur(p.einzelpreis)}</Text>}
                  {sp.rabatt > 0 && <Text style={[st.td, { width: sp.rabatt, textAlign: "right" }]}>{p.rabatt_prozent ? `${menge(p.rabatt_prozent)} %` : ""}</Text>}
                  {sp.ust > 0 && <Text style={[st.td, { width: sp.ust, textAlign: "right" }]}>{`${menge(p.steuersatz)} %`}</Text>}
                  {sp.gesamt > 0 && <Text style={[st.td, { width: sp.gesamt, textAlign: "right" }]}>{p.optional ? `(${eur(betrag)})` : eur(betrag)}</Text>}
                </View>
              );
            });
          })()}
        </View>
        )}

        {/* Summen */}
        {preise && (
          <View wrap={false} style={{ marginTop: 12, marginLeft: "auto", width: 240 }}>
            {s.rabatt !== 0 && (
              <>
                <View style={st.summenZeile}>
                  <Text>Zwischensumme</Text>
                  <Text>{eur(s.zwischensumme)}</Text>
                </View>
                <View style={st.summenZeile}>
                  <Text>Gesamtrabatt {menge(b.gesamtrabatt_prozent)} %</Text>
                  <Text>{eur(-s.rabatt)}</Text>
                </View>
              </>
            )}
            <View style={st.summenZeile}>
              <Text>Summe netto</Text>
              <Text>{eur(s.netto)}</Text>
            </View>
            {s.ohne_steuer ? (
              <View style={st.summenZeile}>
                <Text>{b.steuerart === "bauleistung_13b" ? "USt (§ 13b UStG)" : "USt"}</Text>
                <Text>{eur(0)}</Text>
              </View>
            ) : (
              s.steuern.map((z) => (
                <View key={z.satz} style={st.summenZeile}>
                  <Text>zzgl. USt {menge(z.satz)} %</Text>
                  <Text>{eur(z.steuer)}</Text>
                </View>
              ))
            )}
            <View style={[st.summenZeile, { borderTopWidth: 1.4, borderTopColor: F.ink, marginTop: 4, paddingTop: 5 }]}>
              <Text style={{ fontWeight: 700, fontSize: 12 }}>{["rechnung", "abschlagsrechnung"].includes(b.art) ? "Rechnungsbetrag" : "Gesamtbetrag"}</Text>
              <Text style={{ fontWeight: 700, fontSize: 12 }}>{eur(s.brutto)}</Text>
            </View>
          </View>
        )}

        {preise && b.steuerart !== "standard" && <Absatz fett text={b.steuerart === "bauleistung_13b" ? HINWEIS_13B : HINWEIS_STEUERFREI} />}
        {(b.art === "auftragsbestaetigung" || b.art === "teil_ab") && <Absatz text={b.lieferbedingungen} />}
        {!zb && <Absatz text={zahlung} />}
        <Absatz text={b.nachbemerkung} />
        <View wrap={false} style={{ marginTop: 18 }}>
          <Text>Mit freundlichen Grüßen</Text>
          <Text style={{ marginTop: 2 }}>{firma.firma_name ?? ""}</Text>
        </View>

        {/* Fuß mit Firmendaten auf jeder Seite */}
        <View fixed style={st.fuss}>
          <View style={{ flex: 1 }}>
            <Text>{zeilen(firma.firma_name, firma.geschaeftsfuehrung ? `Inhaber: ${firma.geschaeftsfuehrung}` : null).join(" · ")}</Text>
            <Text>{zeilen(firma.strasse, zeilen(firma.plz, firma.ort).join(" ")).join(" · ")}</Text>
            {firma.handelsregister ? <Text>{firma.handelsregister}</Text> : null}
          </View>
          <View style={{ flex: 1 }}>
            {firma.bank_name ? <Text>{firma.bank_name}</Text> : null}
            <Text>{zeilen(firma.iban ? `IBAN ${firma.iban}` : null, firma.bic ? `BIC ${firma.bic}` : null).join(" · ")}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {firma.ust_id ? <Text>USt-IdNr. {firma.ust_id}</Text> : null}
            {firma.steuernummer ? <Text>Steuernr. {firma.steuernummer}</Text> : null}
          </View>
        </View>
        {/* Seitenzahl als eigenes Element: ein render-Text innerhalb der Fußzeile ließe den Fuß verschwinden */}
        <Text fixed style={{ position: "absolute", bottom: 14, left: 54, right: 54, textAlign: "right", fontSize: 7, color: F.muted }} render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </Page>
    </Document>
  );
}

export async function belegPdf(daten: { b: PdfBeleg; positionen: PdfPosition[]; firma: PdfFirma; logo: LogoPfade; entwurf: boolean }): Promise<Buffer> {
  schriften();
  return renderToBuffer(<BelegDokument {...daten} />);
}

/** Dateiname wie in CLAUDE.md: <Nummer>[_V<n>]_<Belegart>.pdf */
export function pdfDateiname(b: { art: Belegart; nummer: string | null; version: number }): string {
  const art = BELEGART_TEXT[b.art].replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/[^A-Za-z-]/g, "");
  return `${b.nummer ?? "Entwurf"}${b.version > 1 ? `_V${b.version}` : ""}_${art}.pdf`;
}
