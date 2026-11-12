import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";

export type KundeZeile = {
  id: string;
  nummer: string;
  name: string;
  typ: "privat" | "firma";
  ansprechpartner: string | null;
  ort: string | null;
  telefon: string | null;
  herkunft: string | null;
};

export type Kunde = KundeZeile & {
  anrede: string | null;
  bauleister_13b: boolean;
  strasse: string | null;
  plz: string | null;
  land: string;
  email: string | null;
  notiz: string | null;
  lexware_kontakt_id: string | null;
  lexware_seit: string | null;
};

export type Lieferadresse = {
  id: string;
  bezeichnung: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  alt_seit: string | null;
};

export const KUNDEN_JE_SEITE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Suchbegriff für PostgREST-Filter entschärfen (Trennzeichen, Klammern, Platzhalter entfernen). */
export const suchbegriff = (q: string) => q.replace(/[,()"\\%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const SUCHSPALTEN = ["name", "nummer", "ansprechpartner", "strasse", "plz", "ort", "telefon", "email"];

export type ListenFilter = { q: string; typ: "" | "privat" | "firma"; herkunft: string; seite: number };

/** Kundenliste mit Suche, Filter und Seiten. Anzahl je Typ für die Filter (zur aktuellen Suche). */
export async function ladeKundenListe(f: ListenFilter) {
  const { supabase } = await pruefeSitzung();
  const q = suchbegriff(f.q);
  const basis = (felder: string, head = false) => {
    let abfrage = supabase.from("kunde").select(felder, { count: "exact", head });
    if (q) abfrage = abfrage.or(SUCHSPALTEN.map((s) => `${s}.ilike.%${q}%`).join(","));
    if (f.herkunft) abfrage = abfrage.eq("herkunft", f.herkunft);
    return abfrage;
  };

  let liste = basis("id, nummer, name, typ, ansprechpartner, ort, telefon, herkunft");
  if (f.typ) liste = liste.eq("typ", f.typ);
  const von = (f.seite - 1) * KUNDEN_JE_SEITE;
  const [ergebnis, alle, privat, firma] = await Promise.all([
    liste.order("name").order("nummer").range(von, von + KUNDEN_JE_SEITE - 1).returns<KundeZeile[]>(),
    basis("id", true),
    basis("id", true).eq("typ", "privat"),
    basis("id", true).eq("typ", "firma"),
  ]);
  if (ergebnis.error) throw new Error(`Kunden konnten nicht geladen werden: ${ergebnis.error.message}`);
  return {
    liste: ergebnis.data ?? [],
    gesamt: ergebnis.count ?? 0,
    anzahl: { alle: alle.count ?? 0, privat: privat.count ?? 0, firma: firma.count ?? 0 },
  };
}

/** Ein Kunde mit Lieferadressen und (nur mit Recht) Konditionen. null, wenn es ihn nicht gibt oder er gelöscht ist. */
export async function ladeKunde(id: string) {
  if (!UUID.test(id)) return null;
  const { supabase, benutzer } = await pruefeSitzung();
  const [k, la, kond] = await Promise.all([
    supabase
      .from("kunde")
      .select("id, nummer, name, typ, anrede, bauleister_13b, ansprechpartner, herkunft, strasse, plz, ort, land, telefon, email, notiz, lexware_kontakt_id, lexware_seit")
      .eq("id", id)
      .maybeSingle<Kunde>(),
    supabase
      .from("kunde_lieferadresse")
      .select("id, bezeichnung, strasse, plz, ort, alt_seit")
      .eq("kunde_id", id)
      .order("reihenfolge")
      .returns<Lieferadresse[]>(),
    benutzer.konditionen
      ? supabase.from("kunde_kondition").select("text").eq("kunde_id", id).maybeSingle<{ text: string }>()
      : Promise.resolve({ data: null }),
  ]);
  if (!k.data) return null;
  return {
    kunde: k.data,
    lieferadressen: la.data ?? [],
    konditionen: benutzer.konditionen ? { text: kond.data?.text ?? "" } : null,
  };
}

/** „Musterstraße 1, 38518 Gifhorn“ */
export const adresseText = (a: { strasse: string | null; plz: string | null; ort: string | null }) =>
  [a.strasse, [a.plz, a.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
