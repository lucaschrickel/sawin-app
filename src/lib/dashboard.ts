import "server-only";
import { getCustomer } from "@/customers";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeBestellungen, ladeLieferanten, ladeNochNichtBestellt } from "@/lib/einkauf";
import { auftragBestellstatus, type AuftragBestellstatus } from "@/lib/einkauf-status";
import { ladeKalender } from "@/lib/kalender";
import { ladeEinsaetze, type TafelEinsatz } from "@/lib/montageplan";
import { PRUEFTERMINE, pruefAmpel } from "@/lib/pruefung";
import { rund } from "@/lib/beleg-summen";
import { anzeigeStatus, auftragFinanzen, type BelegKurz } from "@/lib/belege-status";
import { AUFTRAG_PHASEN, type AuftragPhase } from "@/lib/status";
import { kalenderwoche, montagVon, plusTage } from "@/lib/woche";
import { berlinNachUtc, heuteBerlin, utcNachBerlinLokal } from "@/lib/zeit";

/**
 * Daten der drei Dashboard-Ansichten (CLAUDE.md „Dashboard“). Alles wird aus den vorhandenen Modulen berechnet,
 * nichts gespeichert. Kennzahlen aus Belegen (Auftragsbestand, Forderungen, Angebotsquote, Auftragswert) folgen
 * mit dem Beleg-Modul und sind bis dahin Platzhalter.
 */

export type DashboardAnsicht = "gf" | "montage" | "einkauf";
export const DASHBOARD_ANSICHTEN: { wert: DashboardAnsicht; text: string }[] = [
  { wert: "gf", text: "Geschäftsführung" },
  { wert: "montage", text: "Montage" },
  { wert: "einkauf", text: "Einkauf" },
];

export type Hinweis = { titel: string; info: string; href: string; ton: "red" | "amber" | "blue" | "gray" };
type Zeit = { heute: string; jetzt: string; montag: string };

const zeit = (): Zeit => {
  const heute = heuteBerlin();
  return { heute, jetzt: utcNachBerlinLokal(new Date().toISOString()), montag: montagVon(heute) };
};
const utc = (lokalerTag: string) => berlinNachUtc(`${lokalerTag}T00:00`)!;
const vorname = (n: string) => n.split(" ")[0];
const mehrzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;

async function ladeNamen() {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("mitarbeiter").select("id, name, ist_monteur").eq("aktiv", true).order("name");
  return data ?? [];
}

/** Einsätze ab heute mit Konflikten (Überschneidung, Abwesenheit, Werkstatt) im geladenen Zeitraum */
async function konfliktIds(vonUtc: string, bisUtc: string) {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.rpc("einsatz_konflikte", { p_von: vonUtc, p_bis: bisUtc });
  return new Set(((data as { einsatz_id: string }[] | null) ?? []).map((k) => k.einsatz_id));
}

/** Fällige Prüftermine der Fahrzeuge (≤ 30 Tage), älteste zuerst */
async function faelligeFahrzeugtermine(heute: string) {
  const { supabase } = await pruefeSitzung();
  const grenze = plusTage(heute, 30);
  const { data } = await supabase
    .from("fahrzeug")
    .select("id, kennzeichen, tuev_am, service_am, uvv_am")
    .or(`tuev_am.lte.${grenze},service_am.lte.${grenze},uvv_am.lte.${grenze}`)
    .returns<{ id: string; kennzeichen: string; tuev_am: string | null; service_am: string | null; uvv_am: string | null }[]>();
  return (data ?? [])
    .flatMap((f) =>
      PRUEFTERMINE.flatMap(([feld, text]) => {
        const a = pruefAmpel(f[feld], heute);
        return a && a.tage <= 30 ? [{ id: f.id, kennzeichen: f.kennzeichen, pruefung: text, tage: a.tage }] : [];
      }),
    )
    .sort((a, b) => a.tage - b.tage);
}

const tageText = (n: number) => (n < 0 ? "überfällig" : n === 0 ? "heute" : `in ${n} ${n === 1 ? "Tag" : "Tagen"}`);

/** „Braucht Aufmerksamkeit“ – nur was jetzt zu tun ist, je Thema eine Zeile */
async function ladeHinweise(z: Zeit, einsaetze: TafelEinsatz[], konflikte: Set<string>): Promise<Hinweis[]> {
  const { supabase } = await pruefeSitzung();
  const [abw, tickets, pruef, wv, aufgaben, bestellungen, fahrzeuge, namen] = await Promise.all([
    supabase.from("abwesenheit").select("mitarbeiter_id, art, von").eq("status", "beantragt").order("von"),
    supabase.from("service_ticket").select("id, nummer, thema").eq("status", "neu").order("nummer"),
    supabase.from("auftrag").select("id, nummer, pruefhinweis, kunde:kunde_id(name)").not("pruefhinweis", "is", null).returns<{ id: string; nummer: string; pruefhinweis: string; kunde: { name: string } | null }[]>(),
    supabase.from("anfrage").select("id, titel").is("archiv", null).lte("wiedervorlage", z.heute).order("wiedervorlage"),
    supabase.from("aufgabe").select("id, titel, faellig").neq("status", "erledigt").lte("faellig", z.heute).order("faellig"),
    ladeBestellungen({ ansicht: "offen", q: "" }),
    faelligeFahrzeugtermine(z.heute),
    ladeNamen(),
  ]);
  const name = new Map(namen.map((m) => [m.id, m.name]));
  const liste = (xs: string[]) => xs.slice(0, 3).join(" · ") + (xs.length > 3 ? ` · +${xs.length - 3}` : "");
  const h: Hinweis[] = [];
  const a = abw.data ?? [];
  if (a.length) h.push({ titel: `${mehrzahl(a.length, "Abwesenheit", "Abwesenheiten")} zur Genehmigung`, info: liste(a.map((x) => `${vorname(name.get(x.mitarbeiter_id) ?? "")} ab ${x.von.slice(8, 10)}.${x.von.slice(5, 7)}.`)), href: "/abwesenheiten", ton: "amber" });
  const vp = einsaetze.filter((e) => !e.fest && e.ende >= z.jetzt);
  if (vp.length) h.push({ titel: `${mehrzahl(vp.length, "Einsatz", "Einsätze")} vorgeplant, noch nicht freigegeben`, info: liste(vp.map((e) => `${e.bezug?.nummer ?? ""} ${e.bezug?.kunde ?? ""}`.trim())), href: "/montageplan", ton: "gray" });
  const kf = einsaetze.filter((e) => konflikte.has(e.id) && e.ende >= z.jetzt);
  if (kf.length) h.push({ titel: `${mehrzahl(kf.length, "Einsatz", "Einsätze")} mit Konflikt`, info: liste(kf.map((e) => e.bezug?.nummer ?? "Einsatz")), href: `/montageplan?woche=${montagVon(kf[0].beginn.slice(0, 10))}`, ton: "red" });
  const at = aufgaben.data ?? [];
  if (at.length) h.push({ titel: `${mehrzahl(at.length, "Aufgabe", "Aufgaben")} fällig`, info: liste(at.map((x) => x.titel)), href: "/aufgaben", ton: at.some((x) => x.faellig! < z.heute) ? "red" : "amber" });
  const t = tickets.data ?? [];
  if (t.length) h.push({ titel: t.length === 1 ? "1 neues Service-Ticket" : `${t.length} neue Service-Tickets`, info: liste(t.map((x) => `${x.nummer} ${x.thema}`)), href: "/service?status=neu", ton: "blue" });
  const ueb = bestellungen.liste.filter((b) => b.abgeleitet === "ueberfaellig");
  if (ueb.length) h.push({ titel: `${mehrzahl(ueb.length, "Bestellung", "Bestellungen")} überfällig`, info: liste(ueb.map((b) => `${b.nummer} ${b.lieferant?.name ?? ""}`)), href: "/bestellungen", ton: "red" });
  if (fahrzeuge.length) h.push({ titel: `${mehrzahl(fahrzeuge.length, "Fahrzeugtermin", "Fahrzeugtermine")} fällig`, info: liste(fahrzeuge.map((f) => `${f.kennzeichen} ${f.pruefung} ${tageText(f.tage)}`)), href: "/fahrzeuge", ton: fahrzeuge.some((f) => f.tage < 0) ? "red" : "amber" });
  for (const p of pruef.data ?? []) h.push({ titel: `Prüfhinweis bei ${p.nummer}`, info: `${p.kunde?.name ?? ""} · ${p.pruefhinweis.length > 60 ? `${p.pruefhinweis.slice(0, 60)}…` : p.pruefhinweis}`, href: `/auftraege/${p.id}`, ton: "amber" });
  const w = wv.data ?? [];
  if (w.length) h.push({ titel: `${mehrzahl(w.length, "Anfrage", "Anfragen")} zur Wiedervorlage`, info: liste(w.map((x) => x.titel)), href: w.length === 1 ? `/anfragen/${w[0].id}` : "/anfragen", ton: "gray" });
  return h;
}

/** Termine eines Tages für die Zeitachse (ohne Abwesenheiten, die stehen in der Kopfzeile) */
async function termineAm(tag: string, namen: Map<string, string>) {
  const { eintraege } = await ladeKalender({ von: tag, bis: tag, aus: ["abwesenheit"], mitarbeiter: [] });
  return eintraege.map((e) => ({ ...e, team: e.mitarbeiter.map((m) => namen.get(m) ?? "").filter(Boolean) }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Geschäftsführung
// ---------------------------------------------------------------------------------------------------------------------
export async function ladeGeschaeftsfuehrung() {
  const { supabase } = await pruefeSitzung();
  const z = zeit();
  const c = getCustomer();
  const [anfragen, auftraege, einsaetze, abwesenheiten, namenListe, belegDaten] = await Promise.all([
    supabase.from("anfrage").select("id, herkunft, eingang, archiv").limit(5000).returns<{ id: string; herkunft: string | null; eingang: string; archiv: string | null }[]>(),
    supabase.from("auftrag").select("id, phase").neq("phase", "abgeschlossen").returns<{ id: string; phase: AuftragPhase }[]>(),
    ladeEinsaetze(utc(z.montag), utc(plusTage(z.montag, 42))),
    supabase.from("abwesenheit").select("id, mitarbeiter_id, status, von, bis").in("status", ["beantragt", "genehmigt"]).gte("bis", z.heute),
    ladeNamen(),
    supabase
      .from("beleg")
      .select("id, art, nummer, status, datum, kette_id, vorgaenger_id, titel, summe_brutto, gueltig_bis, teil, faellig_am, offen_betrag, abschlag_nr, auftrag_id")
      .in("art", ["angebot", "auftragsbestaetigung", "abschlagsrechnung", "rechnung", "gutschrift"])
      .neq("status", "entwurf")
      .limit(20000)
      .returns<(BelegKurz & { auftrag_id: string | null })[]>(),
  ]);
  const namen = new Map(namenListe.map((m) => [m.id, m.name]));
  const [konflikte, termine] = await Promise.all([konfliktIds(utc(z.heute), utc(plusTage(z.montag, 42))), termineAm(z.heute, namen)]);

  // Belege: Auftragsbestand (noch nicht berechnet), offene Forderungen, Angebotsquote, Auftragswert je Monat
  const belege = (belegDaten.data ?? []).map((b) => ({ ...b, summe_brutto: Number(b.summe_brutto), offen_betrag: b.offen_betrag == null ? null : Number(b.offen_betrag) }));
  const jeAuftrag = new Map<string, typeof belege>();
  for (const b of belege) if (b.auftrag_id) jeAuftrag.set(b.auftrag_id, [...(jeAuftrag.get(b.auftrag_id) ?? []), b]);
  const finanzen = [...jeAuftrag.values()].map((bs) => auftragFinanzen(bs)).filter((x) => x.ab);
  const forderungen = belege.filter((b) => (b.art === "rechnung" || b.art === "abschlagsrechnung") && b.status === "offen" && (b.offen_betrag ?? b.summe_brutto) > 0);
  const ueberfaellig = forderungen.filter((b) => anzeigeStatus(b, [b], z.heute).key === "ueberfaellig");
  const vor12 = plusTage(z.heute, -365);
  const angebote = belege.filter((b) => b.art === "angebot" && b.datum >= vor12);
  const angenommen = angebote.filter((b) => b.status === "angenommen").length;
  const abgelehnt = angebote.filter((b) => b.status === "abgelehnt").length;
  const monate = [5, 4, 3, 2, 1, 0].map((i) => {
    const d = new Date(Date.UTC(Number(z.heute.slice(0, 4)), Number(z.heute.slice(5, 7)) - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const abs = belege.filter((b) => b.art === "auftragsbestaetigung");
  const jeMonat = monate.map((m) => {
    const im = abs.filter((b) => b.datum.slice(0, 7) === m);
    return { monat: m, wert: rund(im.reduce((x, b) => x + b.summe_brutto, 0)), anzahl: im.length };
  });
  const hinweise = await ladeHinweise(z, einsaetze, konflikte);

  // Anfragen: offen, neu je Woche (6 Wochen bis heute), Herkunft über alle Anfragen
  const alleAnfragen = anfragen.data ?? [];
  const anfragenJeWoche = [5, 4, 3, 2, 1, 0].map((i) => {
    const von = plusTage(z.montag, -7 * i);
    return alleAnfragen.filter((a) => a.eingang >= von && a.eingang < plusTage(von, 7)).length;
  });
  const zaehler = new Map<string, number>();
  for (const a of alleAnfragen) if (a.herkunft) zaehler.set(a.herkunft, (zaehler.get(a.herkunft) ?? 0) + 1);
  const mitHerkunft = [...zaehler.values()].reduce((x, y) => x + y, 0);
  const herkunft = [...zaehler.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n, anteil: mitHerkunft ? n / mitHerkunft : 0 }));
  const online = alleAnfragen.filter((a) => a.herkunft && c.herkunftOnline.includes(a.herkunft)).length;

  // Montagen (Aufträge) der nächsten 14 Tage und je Woche
  const montagen = einsaetze.filter((e) => e.bezug?.art === "auftrag");
  const in14 = montagen.filter((e) => e.ende >= z.jetzt && e.beginn < `${plusTage(z.heute, 14)}T00:00`);
  const naechste = in14.find((e) => e.ende >= z.jetzt) ?? null;
  const montagenJeWoche = [0, 1, 2, 3, 4, 5].map((i) => {
    const von = plusTage(z.montag, 7 * i);
    return montagen.filter((e) => e.beginn >= `${von}T00:00` && e.beginn < `${plusTage(von, 7)}T00:00`).length;
  });

  // Team heute
  const abw = abwesenheiten.data ?? [];
  const abwesendHeute = abw.filter((a) => a.status === "genehmigt" && a.von <= z.heute && a.bis >= z.heute);
  const teamGroesse = namenListe.length;
  const anwesendProzent = teamGroesse ? Math.round(((teamGroesse - new Set(abwesendHeute.map((a) => a.mitarbeiter_id)).size) / teamGroesse) * 100) : 100;
  const einsaetzeHeute = einsaetze.filter((e) => e.beginn < `${plusTage(z.heute, 1)}T00:00` && e.ende > `${z.heute}T00:00`);
  const teamHeute = [...new Set(einsaetzeHeute.flatMap((e) => e.monteure))].map((m) => vorname(namen.get(m) ?? "")).filter(Boolean);
  const naechste14 = einsaetze.filter((e) => e.ende >= z.jetzt && e.beginn < `${plusTage(z.heute, 14)}T00:00`);
  const freigegebenProzent = naechste14.length ? Math.round((naechste14.filter((e) => e.fest).length / naechste14.length) * 100) : 100;

  const phasen = AUFTRAG_PHASEN.filter((p) => p !== "abgeschlossen").map((p) => ({ phase: p, n: (auftraege.data ?? []).filter((a) => a.phase === p).length }));

  return {
    heute: z.heute,
    anfragen: { offen: alleAnfragen.filter((a) => !a.archiv).length, neuDieseWoche: anfragenJeWoche[5], jeWoche: anfragenJeWoche },
    auftraegeOffen: (auftraege.data ?? []).length,
    montagen: { in14: in14.length, naechste, jeWoche: montagenJeWoche },
    herkunft: { liste: herkunft, onlineProzent: alleAnfragen.length ? Math.round((online / alleAnfragen.length) * 100) : 0, gesamt: alleAnfragen.length, online: c.herkunftOnline },
    abwesenheiten: { zurGenehmigung: abw.filter((a) => a.status === "beantragt").length, anwesendProzent, abwesendHeute: abwesendHeute.map((a) => vorname(namen.get(a.mitarbeiter_id) ?? "")) },
    einsaetzeHeute: { n: einsaetzeHeute.length, team: teamHeute, freigegebenProzent },
    termine,
    hinweise,
    phasen,
    belege: {
      bestand: rund(finanzen.reduce((x, f) => x + f.bestand, 0)),
      bestandAuftraege: finanzen.filter((f) => f.bestand > 0).length,
      forderungen: rund(forderungen.reduce((x, b) => x + (b.offen_betrag ?? b.summe_brutto), 0)),
      forderungenAnzahl: forderungen.length,
      ueberfaellig: ueberfaellig.length,
      quote: { angenommen, abgelehnt, prozent: angenommen + abgelehnt ? Math.round((angenommen / (angenommen + abgelehnt)) * 100) : null },
      jeMonat,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Montage
// ---------------------------------------------------------------------------------------------------------------------
export async function ladeMontage() {
  const { supabase } = await pruefeSitzung();
  const z = zeit();
  const ende = plusTage(z.montag, 42);
  const [einsaetze, auftraege, tickets, abwesenheiten, namenListe, fahrzeuge] = await Promise.all([
    ladeEinsaetze(utc(z.montag), utc(ende)),
    supabase
      .from("auftrag")
      .select("id, nummer, phase, noch_nicht_bestellt, liefertermin, kunde:kunde_id(name), einsaetze:einsatz(id), bestellzeilen:bestellzeile(geliefert, bestellung:bestellung_id(liefer_kw, liefer_jahr))")
      .in("phase", ["bestellung", "montage", "reklamation", "abnahme"])
      .returns<{ id: string; nummer: string; phase: AuftragPhase; noch_nicht_bestellt: string | null; liefertermin: string | null; kunde: { name: string } | null; einsaetze: { id: string }[]; bestellzeilen: { geliefert: boolean; bestellung: { liefer_kw: number | null; liefer_jahr: number | null } | null }[] }[]>(),
    supabase.from("service_ticket").select("id, einsaetze:einsatz(id)").in("status", ["neu", "eingeplant", "in_arbeit"]).returns<{ id: string; einsaetze: { id: string }[] }[]>(),
    supabase.from("abwesenheit").select("id, mitarbeiter_id, art, status, von, bis").in("status", ["beantragt", "genehmigt"]).lte("von", plusTage(z.montag, 13)).gte("bis", z.heute).order("von"),
    ladeNamen(),
    faelligeFahrzeugtermine(z.heute),
  ]);
  const namen = new Map(namenListe.map((m) => [m.id, m.name]));
  const [konflikte, termine] = await Promise.all([konfliktIds(utc(z.heute), utc(ende)), termineAm(z.heute, namen)]);

  const woche = einsaetze.filter((e) => e.beginn < `${plusTage(z.montag, 7)}T00:00`);
  const vorgeplant = einsaetze.filter((e) => !e.fest && e.ende >= z.jetzt);
  const mitKonflikt = einsaetze.filter((e) => konflikte.has(e.id) && e.ende >= z.jetzt);
  const a = auftraege.data ?? [];
  const ungeplantAuftraege = a.filter((x) => !x.einsaetze.length).length;
  const ungeplantTickets = (tickets.data ?? []).filter((t) => !t.einsaetze.length).length;
  const morgen = `${plusTage(z.heute, 1)}T00:00`;
  const alsNaechstes = einsaetze.filter((e) => e.beginn >= morgen).slice(0, 8);

  // Ware für Montagen der nächsten 3 Wochen: Bestellstatus noch nicht „Ware eingetroffen“
  const nachAuftrag = new Map(a.map((x) => [x.id, x]));
  const grenze = `${plusTage(z.heute, 21)}T00:00`;
  const gesehen = new Set<string>();
  const ware: { auftragId: string; nummer: string; kunde: string; beginn: string; status: AuftragBestellstatus; lieferKw: string | null }[] = [];
  for (const e of einsaetze) {
    if (e.bezug?.art !== "auftrag" || e.beginn < `${z.heute}T00:00` || e.beginn >= grenze || gesehen.has(e.bezug.id)) continue;
    gesehen.add(e.bezug.id);
    const x = nachAuftrag.get(e.bezug.id);
    if (!x) continue;
    const status = auftragBestellstatus(x.bestellzeilen, x.noch_nicht_bestellt, x.phase);
    if (status === "abgeschlossen") continue;
    const offen = x.bestellzeilen.filter((b) => !b.geliefert && b.bestellung?.liefer_kw).map((b) => b.bestellung!).sort((p, q) => p.liefer_jahr! - q.liefer_jahr! || p.liefer_kw! - q.liefer_kw!);
    ware.push({ auftragId: x.id, nummer: x.nummer, kunde: x.kunde?.name ?? "", beginn: e.beginn, status, lieferKw: offen[0] ? `KW ${offen[0].liefer_kw}` : null });
  }

  return {
    heute: z.heute,
    kw: kalenderwoche(z.heute),
    woche: { n: woche.length, freigegeben: woche.filter((e) => e.fest).length, vorgeplant: woche.filter((e) => !e.fest).length },
    vorgeplant,
    konflikte: mitKonflikt,
    ungeplant: { auftraege: ungeplantAuftraege, tickets: ungeplantTickets },
    termine: termine.filter((t) => t.art === "montage" || t.art === "service"),
    alsNaechstes,
    abwesenheiten: (abwesenheiten.data ?? []).map((x) => ({ ...x, name: namen.get(x.mitarbeiter_id) ?? "" })),
    ware,
    fahrzeuge,
    namen: Object.fromEntries(namen),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Einkauf
// ---------------------------------------------------------------------------------------------------------------------
export async function ladeEinkauf() {
  const z = zeit();
  const kw = kalenderwoche(z.heute);
  const jahr = Number(z.heute.slice(0, 4));
  const [{ liste: offen }, fehlt, lieferanten] = await Promise.all([ladeBestellungen({ ansicht: "offen", q: "" }), ladeNochNichtBestellt(), ladeLieferanten("")]);
  const nachKw = [...offen].sort((a, b) => (a.liefer_jahr ?? 9999) - (b.liefer_jahr ?? 9999) || (a.liefer_kw ?? 99) - (b.liefer_kw ?? 99));
  return {
    heute: z.heute,
    kw,
    jahr,
    offen: nachKw,
    offenePositionen: offen.reduce((n, b) => n + b.zeilen.filter((x) => !x.geliefert).length, 0),
    dieseWoche: offen.filter((b) => b.liefer_kw === kw && b.liefer_jahr === jahr).length,
    ueberfaellig: offen.filter((b) => b.abgeleitet === "ueberfaellig"),
    ohneAb: offen.filter((b) => !b.lieferanten_ab_nummer),
    fehlt,
    lieferanten,
  };
}
