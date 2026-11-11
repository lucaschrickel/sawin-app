import "server-only";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { LogoPfade } from "@/customers/types";
import { kalenderwoche } from "@/lib/woche";
import type { Wochenplan, WochenplanEinsatz } from "@/lib/wochenplan";
import { F, Logo, schriften } from "./beleg-pdf";

/*
  Wochenplan als PDF, A4 quer, zum Ausdrucken für die Monteure (CLAUDE.md „Wochenplan je Monteur“). Je Tag eine
  Gruppe; je Einsatz eine Zeile mit Zeit, Kunde und Adresse, Auftrag bzw. Ticket, Team und Fahrzeug, Hinweis.
  Tabellenkopf und Fuß auf jeder Seite, eine Zeile wird nie getrennt. Papier bleibt immer hell.
*/

const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const datum = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const kurz = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
const wochentag = (d: string) => WOCHENTAG[new Date(`${d}T12:00:00Z`).getUTCDay()];

const SP = { tag: 92, zeit: 78, kunde: 205, auftrag: 175, team: 135 } as const;

const st = StyleSheet.create({
  seite: { fontFamily: "Inter", fontSize: 9.4, lineHeight: 1.4, color: F.ink, paddingTop: 30, paddingBottom: 46, paddingHorizontal: 34 },
  kopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  titel: { fontSize: 17, fontWeight: 700, textAlign: "right", lineHeight: 1.25, marginBottom: 4 },
  klein: { fontSize: 8.2, color: F.muted },
  th: { fontSize: 7, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: F.muted, paddingHorizontal: 5, paddingBottom: 5 },
  thZeile: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: F.ink },
  zeile: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: F.line },
  zelle: { paddingHorizontal: 5, paddingVertical: 6 },
  fett: { fontWeight: 600 },
  fuss: { position: "absolute", bottom: 20, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", fontSize: 7.4, color: F.muted, borderTopWidth: 0.6, borderTopColor: F.line, paddingTop: 6 },
});

/** Zeit eines Einsatzes an einem Tag: über mehrere Tage „ab 07:00“, „ganztägig“, „bis 15:00“ */
function zeitAmTag(e: WochenplanEinsatz, tag: string) {
  const b = e.beginn.slice(0, 10);
  const en = e.ende.slice(0, 10);
  const vonZeit = e.beginn.slice(11, 16);
  const bisZeit = e.ende.slice(11, 16);
  if (b === tag && en === tag) return `${vonZeit}–${bisZeit}`;
  if (b === tag) return `ab ${vonZeit}`;
  if (en === tag) return `bis ${bisZeit}`;
  return "ganztägig";
}

function Spalten({ tag, zeit, kunde, auftrag, team, hinweis }: { tag: React.ReactNode; zeit: React.ReactNode; kunde: React.ReactNode; auftrag: React.ReactNode; team: React.ReactNode; hinweis: React.ReactNode }) {
  return (
    <>
      <View style={[st.zelle, { width: SP.tag }]}>{tag}</View>
      <View style={[st.zelle, { width: SP.zeit }]}>{zeit}</View>
      <View style={[st.zelle, { width: SP.kunde }]}>{kunde}</View>
      <View style={[st.zelle, { width: SP.auftrag }]}>{auftrag}</View>
      <View style={[st.zelle, { width: SP.team }]}>{team}</View>
      <View style={[st.zelle, { flex: 1 }]}>{hinweis}</View>
    </>
  );
}

function WochenplanDokument({ plan, logo, stand }: { plan: Wochenplan; logo: LogoPfade; stand: string }) {
  const letzter = plan.tage.at(-1)!.datum;
  return (
    <Document title={`Wochenplan ${plan.titel} KW ${kalenderwoche(plan.montag)}`} author="Plantafel">
      <Page size="A4" orientation="landscape" style={st.seite}>
        <View style={st.kopf} fixed>
          <View>
            <Logo l={logo} breite={150} />
            <Text style={[st.klein, { marginTop: 5 }]}>Wochenplan · nur freigegebene Einsätze</Text>
          </View>
          <View>
            <Text style={st.titel}>{plan.titel}</Text>
            <Text style={[st.klein, { textAlign: "right" }]}>
              KW {kalenderwoche(plan.montag)} · {kurz(plan.montag)} – {datum(letzter)}
            </Text>
            {plan.kolonne && (
              <Text style={[st.klein, { textAlign: "right" }]}>
                {plan.personen.join(", ")}
                {plan.fahrzeug ? ` · Fahrzeug ${plan.fahrzeug}` : ""}
              </Text>
            )}
          </View>
        </View>

        <View style={st.thZeile} fixed>
          <Spalten
            tag={<Text style={st.th}>Tag</Text>}
            zeit={<Text style={st.th}>Zeit</Text>}
            kunde={<Text style={st.th}>Kunde und Adresse</Text>}
            auftrag={<Text style={st.th}>Auftrag</Text>}
            team={<Text style={st.th}>{plan.kolonne ? "Team und Fahrzeug" : "Mit und Fahrzeug"}</Text>}
            hinweis={<Text style={st.th}>Hinweis</Text>}
          />
        </View>

        {plan.tage.map((t) => {
          const tagZelle = (
            <>
              <Text style={st.fett}>{wochentag(t.datum)}</Text>
              <Text style={st.klein}>{kurz(t.datum)}</Text>
            </>
          );
          const besonders = [t.feiertag ? `Feiertag: ${t.feiertag}` : "", ...t.abwesend.map((a) => (plan.kolonne ? `${a.name}: ${a.art}` : a.art))].filter(Boolean);
          if (!t.einsaetze.length) {
            return (
              <View key={t.datum} style={[st.zeile, { minHeight: 34 }]} wrap={false}>
                <Spalten
                  tag={tagZelle}
                  zeit={<Text />}
                  kunde={<Text style={t.feiertag ? [st.fett, { color: F.wasser }] : besonders.length ? st.fett : st.klein}>{besonders.length ? besonders.join(" · ") : "frei / Lager"}</Text>}
                  auftrag={<Text />}
                  team={<Text />}
                  hinweis={<Text />}
                />
              </View>
            );
          }
          return t.einsaetze.map((e, i) => {
            const mit = plan.kolonne ? e.team : e.team.filter((n) => !e.beteiligt.includes(n));
            return (
              <View key={`${t.datum}-${e.id}`} style={[st.zeile, i > 0 ? { borderTopWidth: 0 } : {}]} wrap={false}>
                <Spalten
                  tag={i === 0 ? (
                    <>
                      {tagZelle}
                      {besonders.map((b) => <Text key={b} style={[st.klein, { color: F.wasser }]}>{b}</Text>)}
                    </>
                  ) : <Text />}
                  zeit={<Text style={st.fett}>{zeitAmTag(e, t.datum)}</Text>}
                  kunde={
                    <>
                      <Text style={st.fett}>{e.kunde}</Text>
                      {e.adresse ? <Text>{e.adresse}</Text> : null}
                      {e.telefon ? <Text style={st.klein}>Tel. {e.telefon}</Text> : null}
                    </>
                  }
                  auftrag={
                    <>
                      <Text style={st.fett}>{e.art === "ticket" ? "Service " : ""}{e.nummer}</Text>
                      <Text>{e.titel}</Text>
                    </>
                  }
                  team={
                    <>
                      <Text>{mit.length ? mit.join(", ") : plan.kolonne ? "" : "allein"}</Text>
                      {e.fahrzeug ? <Text style={st.klein}>Fahrzeug {e.fahrzeug}</Text> : null}
                      {e.ressource ? <Text style={st.klein}>{e.ressource}</Text> : null}
                    </>
                  }
                  hinweis={<Text>{e.hinweis ?? ""}</Text>}
                />
              </View>
            );
          });
        })}

        <View style={st.fuss} fixed>
          <Text>Stand {stand} · Änderungen meldet das Büro telefonisch.</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function wochenplanPdf(plan: Wochenplan, logo: LogoPfade, stand: string): Promise<Buffer> {
  schriften();
  return renderToBuffer(<WochenplanDokument plan={plan} logo={logo} stand={stand} />);
}
