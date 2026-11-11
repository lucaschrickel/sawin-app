import "server-only";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { LogoPfade } from "@/customers/types";
import { FORMULAR_TEXT, mm } from "@/lib/formular-logik";
import type { FormularDruck } from "@/lib/formulare";
import { FORMULAR_UNTERORDNER } from "@/lib/onedrive/schema";
import { F, Logo, schriften } from "./beleg-pdf";

/*
  Formulare als PDF, A4 hoch (CLAUDE.md „Formulare & Protokolle“, „Druck und PDF“): Aufmaßblatt (Tabelle der Elemente)
  und die Vorlagen Montageprotokoll, Servicebericht, Übergabeprotokoll zum Ausfüllen von Hand (Kunde, Objekt, Leistungen
  aus der AB, Checkliste je Produkt, Unterschriftsfelder). Kopf, Tabellenkopf und Fuß auf jeder Seite, eine Zeile wird
  nie getrennt. Papier bleibt immer hell. Keine Seitenzahl: react-pdf 4 zeigt render-Texte nicht, solange die Seite eine
  lineHeight hat (geprüft 12.11.2026; betrifft auch die Seitenzahl der Beleg-PDFs).
*/

const datum = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const SP = { pos: 26, raum: 88, element: 92, breite: 54, hoehe: 54, anzahl: 46, anschlag: 62 } as const;

const st = StyleSheet.create({
  seite: { fontFamily: "Inter", fontSize: 9.6, lineHeight: 1.45, color: F.ink, paddingTop: 34, paddingBottom: 62, paddingHorizontal: 46 },
  kopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  klein: { fontSize: 8, color: F.muted },
  titel: { fontSize: 19, fontWeight: 700, marginTop: 16 },
  bloecke: { flexDirection: "row", gap: 24, marginTop: 12, marginBottom: 10 },
  block: { flex: 1 },
  fett: { fontWeight: 600 },
  h3: { fontSize: 10.4, fontWeight: 700, marginTop: 12, marginBottom: 5 },
  th: { fontSize: 7, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: F.muted, paddingHorizontal: 4, paddingBottom: 5 },
  thZeile: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: F.ink },
  zeile: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: F.line },
  td: { paddingHorizontal: 4, paddingVertical: 6 },
  r: { textAlign: "right" },
  linie: { borderBottomWidth: 0.8, borderBottomColor: F.lineStrong, height: 22 },
  check: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 3.5 },
  box: { width: 9, height: 9, borderWidth: 0.9, borderColor: F.ink3 },
  fuss: { position: "absolute", bottom: 22, left: 46, right: 46, flexDirection: "row", justifyContent: "space-between", fontSize: 7.2, color: F.muted, borderTopWidth: 0.6, borderTopColor: F.line, paddingTop: 6 },
});

function Linie({ text }: { text?: string }) {
  return (
    <View wrap={false}>
      <View style={st.linie} />
      {text ? <Text style={[st.klein, { fontSize: 7.2, marginTop: 2 }]}>{text}</Text> : null}
    </View>
  );
}

function Feld({ text, breite = 1 }: { text: string; breite?: number }) {
  return (
    <View style={{ flex: breite, marginBottom: 6 }}>
      <Linie text={text} />
    </View>
  );
}

function Kaestchen({ text }: { text: string }) {
  return (
    <View style={st.check} wrap={false}>
      <View style={st.box} />
      <Text>{text}</Text>
    </View>
  );
}

function Unterschriften() {
  return (
    <View style={{ flexDirection: "row", gap: 22, marginTop: 26 }} wrap={false}>
      <Feld text="Ort, Datum" />
      <Feld text="Unterschrift Kunde" />
      <Feld text="Unterschrift Monteur" />
    </View>
  );
}

function Leistungen({ d, titel }: { d: FormularDruck; titel: string }) {
  return (
    <View>
      <Text style={st.h3}>
        {titel}
        {d.ab ? ` ${d.ab.nummer}` : ""}
      </Text>
      {d.ab?.leistungen.length ? (
        d.ab.leistungen.map((l, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 6, marginBottom: 2 }} wrap={false}>
            <Text style={{ width: 16, color: F.muted }}>{i + 1}.</Text>
            <Text style={{ flex: 1 }}>{l}</Text>
          </View>
        ))
      ) : (
        <>
          <Linie />
          <Linie />
        </>
      )}
    </View>
  );
}

function Checkliste({ d, ohneTitel }: { d: FormularDruck; ohneTitel?: boolean }) {
  if (!d.checkliste.length) return ohneTitel ? null : <Text style={st.h3}>Checkliste</Text>;
  return (
    <View>
      <Text style={st.h3}>Checkliste</Text>
      {d.checkliste.map((c) => (
        <View key={c.produkt} style={{ marginBottom: 4 }}>
          {d.checkliste.length > 1 && <Text style={[st.klein, st.fett, { marginBottom: 3 }]}>{c.produkt}</Text>}
          {c.punkte.map((p) => (
            <Kaestchen key={p} text={p} />
          ))}
        </View>
      ))}
    </View>
  );
}

type Acht = [React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode];
function Spalten({ z }: { z: Acht }) {
  return (
    <>
      <View style={[st.td, { width: SP.pos }]}>{z[0]}</View>
      <View style={[st.td, { width: SP.raum }]}>{z[1]}</View>
      <View style={[st.td, { width: SP.element }]}>{z[2]}</View>
      <View style={[st.td, { width: SP.breite }]}>{z[3]}</View>
      <View style={[st.td, { width: SP.hoehe }]}>{z[4]}</View>
      <View style={[st.td, { width: SP.anzahl }]}>{z[5]}</View>
      <View style={[st.td, { width: SP.anschlag }]}>{z[6]}</View>
      <View style={[st.td, { flex: 1 }]}>{z[7]}</View>
    </>
  );
}

function Aufmass({ d }: { d: FormularDruck }) {
  const zahl = (v: string) => {
    const n = mm(v);
    return n ? n.toLocaleString("de-DE") : "";
  };
  return (
    <View>
      <View style={st.thZeile} fixed>
        <Spalten
          z={[
            <Text key="0" style={st.th}>Pos.</Text>,
            <Text key="1" style={st.th}>Raum</Text>,
            <Text key="2" style={st.th}>Element</Text>,
            <Text key="3" style={[st.th, st.r]}>Breite</Text>,
            <Text key="4" style={[st.th, st.r]}>Höhe</Text>,
            <Text key="5" style={[st.th, st.r]}>Anzahl</Text>,
            <Text key="6" style={st.th}>Anschlag</Text>,
            <Text key="7" style={st.th}>Bemerkung</Text>,
          ]}
        />
      </View>
      {d.zeilen.map((z, i) => (
        <View key={z.id} style={st.zeile} wrap={false}>
          <Spalten
            z={[
              <Text key="0" style={{ color: F.muted }}>{i + 1}</Text>,
              <Text key="1">{z.raum}</Text>,
              <Text key="2" style={st.fett}>{z.element}</Text>,
              <Text key="3" style={st.r}>{zahl(z.breite_mm)}</Text>,
              <Text key="4" style={st.r}>{zahl(z.hoehe_mm)}</Text>,
              <Text key="5" style={st.r}>{mm(z.anzahl) ?? 1}</Text>,
              <Text key="6">{z.anschlag}</Text>,
              <Text key="7">{z.bemerkung}</Text>,
            ]}
          />
        </View>
      ))}
      {!d.zeilen.length && <Text style={[st.klein, { marginTop: 8 }]}>Noch keine Elemente erfasst.</Text>}
      {d.formular.hinweise && (
        <View style={{ marginTop: 16 }} wrap={false}>
          <Text style={st.fett}>Hinweise zur Baustelle</Text>
          <Text>{d.formular.hinweise}</Text>
        </View>
      )}
      <Text style={[st.klein, { marginTop: 14 }]}>
        Maße in mm (Rohbau-Lichtmaß){d.erfasser ? ` · aufgenommen von ${d.erfasser}` : ""} am {datum(d.formular.datum)}
      </Text>
    </View>
  );
}

function Montageprotokoll({ d }: { d: FormularDruck }) {
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 18, marginTop: 4 }}>
        <Feld text="Datum" />
        <Feld text="Beginn" />
        <Feld text="Ende" />
        <Feld text="Monteure" breite={2} />
      </View>
      <Leistungen d={d} titel="Leistungen laut Auftragsbestätigung" />
      <Checkliste d={d} ohneTitel />
      {!d.checkliste.length && <Text style={st.h3}>Checkliste</Text>}
      <Kaestchen text="Arbeiten erledigt" />
      <Kaestchen text="Baustelle besenrein übergeben" />
      <View wrap={false}>
        <Text style={st.h3}>Mängel / offene Punkte</Text>
        <Linie />
        <Linie />
        <Linie />
        <Unterschriften />
      </View>
    </View>
  );
}

function Servicebericht({ d }: { d: FormularDruck }) {
  return (
    <View>
      <Text style={st.h3}>Gemeldetes Problem</Text>
      <Text>{d.problem?.trim() || d.formular.bezug.titel}</Text>
      <View style={{ flexDirection: "row", gap: 18, marginTop: 8 }}>
        <Feld text="Datum" />
        <Feld text="Ankunft" />
        <Feld text="Abfahrt" />
        <Feld text="Monteur" breite={2} />
      </View>
      {d.ab && <Leistungen d={d} titel="Leistungen laut Auftragsbestätigung" />}
      <Checkliste d={d} ohneTitel />
      <Text style={st.h3}>Durchgeführte Arbeiten</Text>
      <Linie />
      <Linie />
      <Linie />
      <Text style={st.h3}>Material</Text>
      <Linie />
      <Linie />
      <View wrap={false}>
        <Text style={st.h3}>Abrechnung</Text>
        <View style={{ flexDirection: "row", gap: 22 }}>
          <Kaestchen text="Garantie" />
          <Kaestchen text="Kulanz" />
          <Kaestchen text="Kostenpflichtig" />
        </View>
        <View style={{ flexDirection: "row", gap: 22 }}>
          <Kaestchen text="Problem behoben" />
          <Kaestchen text="Folgeeinsatz nötig" />
        </View>
        <Unterschriften />
      </View>
    </View>
  );
}

function Uebergabeprotokoll({ d }: { d: FormularDruck }) {
  return (
    <View>
      <Leistungen d={d} titel="Übergebene Leistungen laut Auftragsbestätigung" />
      <Checkliste d={d} ohneTitel />
      <Text style={st.h3}>Abnahme</Text>
      <Kaestchen text="Leistung ohne Mängel abgenommen" />
      <Kaestchen text="Abnahme mit folgenden Mängeln:" />
      <Linie />
      <Linie />
      <View wrap={false} style={{ marginTop: 10 }}>
        <Kaestchen text="Einweisung in Bedienung und Pflege erfolgt" />
        <Kaestchen text="Unterlagen, Schlüssel und Handsender übergeben" />
        <Unterschriften />
      </View>
    </View>
  );
}

function FormularDokument({ d, logo }: { d: FormularDruck; logo: LogoPfade }) {
  const f = d.formular;
  const k = f.kunde;
  const firma = d.firma;
  const bezugText = f.bezug.art === "ticket" ? "Service-Ticket" : f.bezug.art === "anfrage" ? "Anfrage" : "Auftrag";
  const entwurf = f.typ === "aufmass" && f.status === "entwurf";
  return (
    <Document title={`${FORMULAR_TEXT[f.typ]} ${f.bezug.nummer}`} author={firma.firma_name ?? undefined} creator={firma.firma_name ?? undefined} producer="Sawin-App">
      <Page size="A4" style={st.seite}>
        {entwurf && (
          <View fixed style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 96, fontWeight: 700, color: F.wasser, opacity: 0.1, transform: "rotate(-28deg)" }}>ENTWURF</Text>
          </View>
        )}
        <View fixed={f.typ === "aufmass"}>
          <View style={st.kopf}>
            <View>
              <Logo l={logo} breite={170} />
              <Text style={[st.klein, { marginTop: 5 }]}>{[firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" "), firma.telefon].filter(Boolean).join(" · ")}</Text>
            </View>
            <Text style={[st.klein, { fontSize: 9 }]}>{f.bezug.nummer}</Text>
          </View>
          <Text style={st.titel}>{FORMULAR_TEXT[f.typ]}</Text>
          <View style={st.bloecke}>
            <View style={st.block}>
              <Text style={st.klein}>Kunde</Text>
              <Text style={st.fett}>{k?.name ?? ""}</Text>
              <Text>{f.bezug.objekt || [k?.strasse, [k?.plz, k?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</Text>
              {k?.telefon && <Text>Tel. {k.telefon}</Text>}
            </View>
            <View style={st.block}>
              <Text style={st.klein}>{bezugText}</Text>
              <Text style={st.fett}>{f.bezug.nummer}</Text>
              <Text>{f.bezug.titel}</Text>
            </View>
          </View>
        </View>

        {f.typ === "aufmass" ? <Aufmass d={d} /> : f.typ === "montageprotokoll" ? <Montageprotokoll d={d} /> : f.typ === "servicebericht" ? <Servicebericht d={d} /> : <Uebergabeprotokoll d={d} />}

        <View style={st.fuss} fixed>
          <Text>{[firma.firma_name, firma.website, f.bezug.art !== "ticket" ? `Ablage: OneDrive › ${FORMULAR_UNTERORDNER[f.typ]}` : null].filter(Boolean).join(" · ")}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function formularPdf(d: FormularDruck, logo: LogoPfade): Promise<Buffer> {
  schriften();
  return renderToBuffer(<FormularDokument d={d} logo={logo} />);
}
