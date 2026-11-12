import "server-only";
import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { BelegDetail } from "@/lib/belege";
import { BELEGART_TEXT } from "@/lib/belege-status";
import { datum, eur } from "@/lib/format";
import { F, mitSchrift } from "./beleg-pdf";

/*
  Kopfbeleg: übernommener Beleg ohne Positionen (Airtable hatte nur Nummer, Datum und Beträge). Statt einer leeren
  Vorschau zeigt die App eine Seite mit den Kopfdaten und dem Verweis auf das Original in Lexware. Dieses PDF wird nie
  heruntergeladen oder versendet.
*/

const st = StyleSheet.create({
  seite: { fontSize: 10, paddingTop: 56, paddingHorizontal: 56, color: F.ink },
  titel: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  hinweis: { color: F.muted, marginBottom: 24 },
  zeile: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: F.line, paddingVertical: 6 },
  feld: { width: 150, color: F.muted },
  link: { color: F.sand, marginTop: 24 },
});

export async function kopfbelegPdf(d: BelegDetail, statusText: string): Promise<Buffer> {
  const b = d.beleg;
  const zeilen: [string, string][] = [
    ["Belegart", BELEGART_TEXT[b.art]],
    ["Nummer", b.nummer ?? "–"],
    ["Datum", b.datum ? datum(b.datum) : "–"],
    ["Kunde", b.kunde?.name ?? b.adresse_name ?? "–"],
    ["Titel", b.titel ?? "–"],
    ["Netto", eur(Number(b.summe_netto ?? 0))],
    ["Brutto", eur(Number(b.summe_brutto ?? 0))],
    ["Status", statusText],
  ];
  return mitSchrift((familie) => (
    <Document title={`${b.nummer ?? ""} (übernommen)`}>
      <Page size="A4" style={[st.seite, { fontFamily: familie }]}>
        <View style={{ lineHeight: 1.5 }}>
          <Text style={st.titel}>{`${BELEGART_TEXT[b.art]} ${b.nummer ?? ""}`}</Text>
          <Text style={st.hinweis}>Aus der bisherigen Ablage übernommen. Positionen und Original-PDF liegen in Lexware.</Text>
          {zeilen.map(([k, v]) => (
            <View key={k} style={st.zeile}>
              <Text style={st.feld}>{k}</Text>
              <Text>{v}</Text>
            </View>
          ))}
          {b.lexware_link ? (
            <Link src={b.lexware_link} style={st.link}>
              Original in Lexware öffnen
            </Link>
          ) : null}
        </View>
      </Page>
    </Document>
  ));
}
