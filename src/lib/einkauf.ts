import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { bestellStatus, type BestellStatus } from "@/lib/einkauf-status";
import { suchbegriff } from "@/lib/kunden";
import { heuteBerlin } from "@/lib/zeit";

export type Kontakt = { id: string; name: string; funktion: string | null; handy: string | null; telefon: string | null; email: string | null };
export type Lieferant = {
  id: string;
  name: string;
  produktgruppen: string[];
  konfigurator_url: string | null;
  haendlerportal_url: string | null;
  unsere_kundennummer: string | null;
  lieferzeit: string | null;
  telefon: string | null;
  notiz: string | null;
  kontakte: Kontakt[];
};
const LIEFERANT = "id, name, produktgruppen, konfigurator_url, haendlerportal_url, unsere_kundennummer, lieferzeit, telefon, notiz, kontakte:lieferant_kontakt(id, name, funktion, handy, telefon, email, reihenfolge)";

export type BestellZeile = { id: string; artikeltext: string; menge: number; geliefert: boolean; auftrag: { id: string; nummer: string; titel: string; kunde: string } | null };
export type Bestellung = {
  id: string;
  nummer: string;
  bestelldatum: string;
  lieferanten_ab_nummer: string | null;
  liefer_kw: number | null;
  liefer_jahr: number | null;
  status: "bestellt" | "bestaetigt";
  notiz: string | null;
  /** Stand der Bestellung (die Bestellmaske lädt nach dem Speichern neu) */
  updated_at: string;
  lieferant: { id: string; name: string } | null;
  zeilen: BestellZeile[];
  abgeleitet: BestellStatus;
};
const BESTELLUNG =
  "id, nummer, bestelldatum, lieferanten_ab_nummer, liefer_kw, liefer_jahr, status, notiz, updated_at, lieferant:lieferant_id(id, name), zeilen:bestellzeile(id, artikeltext, menge, geliefert, reihenfolge, auftrag:auftrag_id(id, nummer, titel, kunde:kunde_id(name)))";

type RohZeile = Omit<BestellZeile, "auftrag"> & { reihenfolge: number; auftrag: { id: string; nummer: string; titel: string; kunde: { name: string } | null } | null };
type RohBestellung = Omit<Bestellung, "zeilen" | "abgeleitet"> & { zeilen: RohZeile[] };

const zuBestellung = (b: RohBestellung, heute: string): Bestellung => {
  const zeilen = [...b.zeilen]
    .sort((x, y) => x.reihenfolge - y.reihenfolge)
    .map((z) => ({ id: z.id, artikeltext: z.artikeltext, menge: Number(z.menge), geliefert: z.geliefert, auftrag: z.auftrag ? { id: z.auftrag.id, nummer: z.auftrag.nummer, titel: z.auftrag.titel, kunde: z.auftrag.kunde?.name ?? "" } : null }));
  return { ...b, zeilen, abgeleitet: bestellStatus({ ...b, zeilen }, heute) };
};
const sortiereKontakte = <T extends { kontakte: (Kontakt & { reihenfolge?: number })[] }>(l: T) => ({ ...l, kontakte: [...l.kontakte].sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0)) });

/** Lieferanten mit Ansprechpartnern, Anzahl offener Bestellungen und (nur mit Recht) Konditionen */
export async function ladeLieferanten(q: string) {
  const { supabase } = await pruefeSitzung();
  const s = suchbegriff(q);
  let a = supabase.from("lieferant").select(LIEFERANT);
  if (s) a = a.or(["name", "unsere_kundennummer", "notiz"].map((f) => `${f}.ilike.%${s}%`).join(","));
  const [liste, bestellungen, konditionen] = await Promise.all([
    a.order("name").returns<Lieferant[]>(),
    supabase.from("bestellung").select("lieferant_id, zeilen:bestellzeile(geliefert)").returns<{ lieferant_id: string; zeilen: { geliefert: boolean }[] }[]>(),
    supabase.from("lieferant_kondition").select("lieferant_id, text"),
  ]);
  const offen = new Map<string, number>();
  for (const b of bestellungen.data ?? []) if (!b.zeilen.length || b.zeilen.some((z) => !z.geliefert)) offen.set(b.lieferant_id, (offen.get(b.lieferant_id) ?? 0) + 1);
  const kond = new Map((konditionen.data ?? []).map((k) => [k.lieferant_id, k.text]));
  return (liste.data ?? []).map((l) => ({ ...sortiereKontakte(l), offeneBestellungen: offen.get(l.id) ?? 0, kondition: kond.get(l.id) ?? null }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ladeLieferant(id: string) {
  if (!UUID.test(id)) return null;
  const { supabase, benutzer } = await pruefeSitzung();
  const { data: l } = await supabase.from("lieferant").select(LIEFERANT).eq("id", id).maybeSingle<Lieferant>();
  if (!l) return null;
  const heute = heuteBerlin();
  const [bestellungen, kondition] = await Promise.all([
    supabase.from("bestellung").select(BESTELLUNG).eq("lieferant_id", id).order("bestelldatum", { ascending: false }).returns<RohBestellung[]>(),
    supabase.from("lieferant_kondition").select("id, text").eq("lieferant_id", id).maybeSingle(),
  ]);
  return {
    lieferant: sortiereKontakte(l),
    bestellungen: (bestellungen.data ?? []).map((b) => zuBestellung(b, heute)),
    kondition: kondition.data,
    darfKonditionen: benutzer.konditionen,
  };
}

export type BestellFilter = { ansicht: "offen" | "geliefert" | "alle"; q: string };

/** Bestellungen mit abgeleitetem Status; Anzahl je Ansicht */
export async function ladeBestellungen(f: BestellFilter) {
  const { supabase } = await pruefeSitzung();
  const heute = heuteBerlin();
  const { data, error } = await supabase.from("bestellung").select(BESTELLUNG).order("bestelldatum", { ascending: false }).order("nummer", { ascending: false }).limit(1000).returns<RohBestellung[]>();
  if (error) throw new Error(`Bestellungen konnten nicht geladen werden: ${error.message}`);
  const alle = (data ?? []).map((b) => zuBestellung(b, heute));
  const s = suchbegriff(f.q).toLowerCase();
  const gesucht = s
    ? alle.filter((b) => [b.nummer, b.lieferant?.name, b.lieferanten_ab_nummer, ...b.zeilen.flatMap((z) => [z.artikeltext, z.auftrag?.nummer, z.auftrag?.kunde])].some((x) => x?.toLowerCase().includes(s)))
    : alle;
  const anzahl = { offen: gesucht.filter((b) => b.abgeleitet !== "geliefert").length, geliefert: gesucht.filter((b) => b.abgeleitet === "geliefert").length, alle: gesucht.length };
  const liste = f.ansicht === "alle" ? gesucht : gesucht.filter((b) => (f.ansicht === "geliefert") === (b.abgeleitet === "geliefert"));
  return { liste, anzahl };
}

export async function ladeBestellung(id: string) {
  if (!UUID.test(id)) return null;
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("bestellung").select(BESTELLUNG).eq("id", id).maybeSingle<RohBestellung>();
  if (!data) return null;
  const { data: kontakte } = data.lieferant
    ? await supabase.from("lieferant_kontakt").select("id, name, funktion, handy, telefon, email").eq("lieferant_id", data.lieferant.id).order("reihenfolge")
    : { data: [] };
  const { data: lieferant } = data.lieferant
    ? await supabase.from("lieferant").select("konfigurator_url, haendlerportal_url, unsere_kundennummer, telefon").eq("id", data.lieferant.id).maybeSingle()
    : { data: null };
  return { bestellung: zuBestellung(data, heuteBerlin()), kontakte: (kontakte ?? []) as Kontakt[], lieferant };
}

/** Auswahl für den Bestell-Dialog: Lieferanten und offene Aufträge (mit „Noch nicht bestellt“) */
export async function ladeBestellAuswahl() {
  const { supabase } = await pruefeSitzung();
  const [lieferanten, auftraege] = await Promise.all([
    supabase.from("lieferant").select("id, name").order("name"),
    supabase
      .from("auftrag")
      .select("id, nummer, titel, noch_nicht_bestellt, kunde:kunde_id(name)")
      .neq("phase", "abgeschlossen")
      .order("nummer", { ascending: false })
      .limit(500)
      .returns<{ id: string; nummer: string; titel: string; noch_nicht_bestellt: string | null; kunde: { name: string } | null }[]>(),
  ]);
  return {
    lieferanten: lieferanten.data ?? [],
    auftraege: (auftraege.data ?? []).map((a) => ({ id: a.id, nummer: a.nummer, titel: a.titel, kunde: a.kunde?.name ?? "", nochNichtBestellt: a.noch_nicht_bestellt })),
  };
}

/** Offene Aufträge mit „Noch nicht bestellt“ (Bestellungen, Dashboard Einkauf) */
export async function ladeNochNichtBestellt() {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase
    .from("auftrag")
    .select("id, nummer, titel, noch_nicht_bestellt, kunde:kunde_id(name)")
    .neq("phase", "abgeschlossen")
    .not("noch_nicht_bestellt", "is", null)
    .order("nummer", { ascending: false })
    .returns<{ id: string; nummer: string; titel: string; noch_nicht_bestellt: string; kunde: { name: string } | null }[]>();
  return (data ?? []).filter((a) => a.noch_nicht_bestellt.trim());
}

/** Bestellzeilen eines Auftrags mit Kopfdaten (Auftragsseite) */
export async function ladeBestellzeilenZuAuftrag(auftragId: string) {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase
    .from("bestellzeile")
    .select("id, artikeltext, menge, geliefert, bestellung:bestellung_id(id, nummer, liefer_kw, liefer_jahr, status, lieferant:lieferant_id(id, name))")
    .eq("auftrag_id", auftragId)
    .order("created_at")
    .returns<{ id: string; artikeltext: string; menge: number; geliefert: boolean; bestellung: { id: string; nummer: string; liefer_kw: number | null; liefer_jahr: number | null; status: string; lieferant: { id: string; name: string } | null } | null }[]>();
  return (data ?? []).filter((z) => z.bestellung);
}
