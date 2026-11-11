import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomer } from "@/customers";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import type { Firma } from "@/lib/belege";
import { checklisteFuer, elementeSumme, type AufmassZeile, type FormularStatus, type FormularTyp } from "./formular-logik";

/*
  Formulare & Protokolle laden (CLAUDE.md „Formulare & Protokolle“). Gelesen wird mit den Rechten des Benutzers (RLS).
  Formulare hängen an einer Anfrage (nur Aufmaß), einem Auftrag oder einem Ticket. Die Ablage (PDF nachziehen, wenn der
  Ordner einer Anfrage mit dem ersten Angebot entsteht) liest im Hintergrund mit der Service-Rolle (db übergeben).
*/

type Db = SupabaseClient;
const verbindung = async (db?: Db) => db ?? (await pruefeSitzung()).supabase;

export type FormularBezug = { anfrage_id?: string; auftrag_id?: string; ticket_id?: string };
export type FormularDatei = { id: string; name: string; web_url: string | null; status: string; quelle: string };
export type FormularListe = {
  id: string;
  typ: FormularTyp;
  status: FormularStatus;
  datum: string;
  created_at: string;
  elemente: number;
  dateien: FormularDatei[];
};

export async function ladeFormulare(b: FormularBezug): Promise<FormularListe[]> {
  const { supabase } = await pruefeSitzung();
  const spalte = b.auftrag_id ? "auftrag_id" : b.ticket_id ? "ticket_id" : "anfrage_id";
  const wert = (b.auftrag_id ?? b.ticket_id ?? b.anfrage_id)!;
  const { data } = await supabase
    .from("formular")
    .select("id, typ, status, datum, created_at, aufmass_zeile(anzahl)")
    .eq(spalte, wert)
    .order("datum", { ascending: false })
    .order("created_at", { ascending: false });
  const liste = (data ?? []) as unknown as (Omit<FormularListe, "elemente" | "dateien"> & { aufmass_zeile: { anzahl: number }[] })[];
  const ids = liste.map((f) => f.id);
  const { data: dateien } = ids.length
    ? await supabase.from("ablage_datei").select("id, name, web_url, status, quelle, formular_id").in("formular_id", ids).neq("status", "upload").order("created_at")
    : { data: [] };
  return liste.map(({ aufmass_zeile, ...f }) => ({
    ...f,
    elemente: elementeSumme(aufmass_zeile ?? []),
    dateien: ((dateien ?? []) as (FormularDatei & { formular_id: string })[]).filter((d) => d.formular_id === f.id),
  }));
}

export type FormularKopf = {
  id: string;
  typ: FormularTyp;
  status: FormularStatus;
  datum: string;
  hinweise: string | null;
  created_by: string | null;
  updated_at: string;
  bezug: { art: "anfrage" | "auftrag" | "ticket"; id: string; nummer: string; titel: string; objekt: string | null; href: string; archiviert: boolean };
  kunde: { id: string; name: string; strasse: string | null; plz: string | null; ort: string | null; telefon: string | null } | null;
};

const KUNDE = "kunde:kunde_id(id, name, strasse, plz, ort, telefon)";

/** Formular mit Bezug und Kunde */
export async function ladeFormular(id: string, db?: Db): Promise<FormularKopf | null> {
  const supabase = await verbindung(db);
  const { data: f } = await supabase.from("formular").select("id, typ, status, datum, hinweise, created_by, updated_at, anfrage_id, auftrag_id, ticket_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!f) return null;
  type K = FormularKopf["kunde"];
  let bezug: FormularKopf["bezug"];
  let kunde: K = null;
  if (f.auftrag_id) {
    const { data: a } = await supabase.from("auftrag").select(`id, nummer, titel, objekt, phase, ${KUNDE}`).eq("id", f.auftrag_id).single<{ id: string; nummer: string; titel: string; objekt: string | null; phase: string; kunde: K }>();
    bezug = { art: "auftrag", id: a!.id, nummer: a!.nummer, titel: a!.titel, objekt: a!.objekt, href: `/auftraege/${a!.id}?reiter=formulare`, archiviert: false };
    kunde = a!.kunde;
  } else if (f.ticket_id) {
    const { data: t } = await supabase.from("service_ticket").select(`id, nummer, thema, objekt, ${KUNDE}`).eq("id", f.ticket_id).single<{ id: string; nummer: string; thema: string; objekt: string | null; kunde: K }>();
    bezug = { art: "ticket", id: t!.id, nummer: t!.nummer, titel: t!.thema, objekt: t!.objekt, href: `/service/${t!.id}?reiter=formulare`, archiviert: false };
    kunde = t!.kunde;
  } else {
    const { data: q } = await supabase.from("anfrage").select(`id, nummer, titel, objekt, archiv, ${KUNDE}`).eq("id", f.anfrage_id!).single<{ id: string; nummer: string; titel: string; objekt: string | null; archiv: string | null; kunde: K }>();
    bezug = { art: "anfrage", id: q!.id, nummer: q!.nummer, titel: q!.titel, objekt: q!.objekt, href: `/anfragen/${q!.id}`, archiviert: !!q!.archiv };
    kunde = q!.kunde;
  }
  return { id: f.id, typ: f.typ, status: f.status, datum: f.datum, hinweise: f.hinweise, created_by: f.created_by, updated_at: f.updated_at, bezug, kunde };
}

/** Zeilen eines Aufmaßblatts als Eingabe (Zahlen als Text) */
export async function ladeAufmassZeilen(formularId: string, db?: Db): Promise<AufmassZeile[]> {
  const supabase = await verbindung(db);
  const { data } = await supabase
    .from("aufmass_zeile")
    .select("id, raum, element, breite_mm, hoehe_mm, anzahl, anschlag, bemerkung")
    .eq("formular_id", formularId)
    .is("deleted_at", null)
    .order("reihenfolge");
  const s = (v: unknown) => (v == null ? "" : String(v));
  return (data ?? []).map((z) => ({ id: z.id, raum: s(z.raum), element: s(z.element), breite_mm: s(z.breite_mm), hoehe_mm: s(z.hoehe_mm), anzahl: s(z.anzahl || 1), anschlag: s(z.anschlag), bemerkung: s(z.bemerkung) }));
}

export type FormularDruck = {
  formular: FormularKopf;
  firma: Firma;
  zeilen: AufmassZeile[];
  erfasser: string | null;
  /** Leistungen laut AB (Titel der Artikelpositionen) des Auftrags bzw. des Ursprungsauftrags des Tickets */
  ab: { nummer: string; leistungen: string[] } | null;
  checkliste: { produkt: string; punkte: string[] }[];
  problem: string | null;
};

/** Alles für das PDF eines Formulars */
export async function ladeFormularDruck(id: string, db?: Db): Promise<FormularDruck | null> {
  const supabase = await verbindung(db);
  const formular = await ladeFormular(id, supabase);
  if (!formular) return null;
  const [firma, zeilen, erfasser] = await Promise.all([
    supabase
      .from("einstellung")
      .select("firma_name, firma_zusatz, strasse, plz, ort, land, telefon, email, website, ust_id, steuernummer, handelsregister, geschaeftsfuehrung, bank_name, iban, bic, angebot_gueltig_tage")
      .maybeSingle()
      .then((r) => (r.data ?? { land: "Deutschland", angebot_gueltig_tage: 30 }) as Firma),
    formular.typ === "aufmass" ? ladeAufmassZeilen(id, supabase) : Promise.resolve([]),
    formular.created_by ? supabase.from("benutzer").select("name").eq("id", formular.created_by).maybeSingle().then((r) => (r.data?.name as string | undefined) ?? null) : Promise.resolve(null),
  ]);
  let auftragId: string | null = formular.bezug.art === "auftrag" ? formular.bezug.id : null;
  let problem: string | null = null;
  let produkte: string[] = [];
  if (formular.bezug.art === "ticket") {
    const { data: t } = await supabase.from("service_ticket").select("auftrag_id, problem").eq("id", formular.bezug.id).single();
    auftragId = t?.auftrag_id ?? null;
    problem = t?.problem ?? null;
  }
  if (formular.bezug.art === "anfrage") {
    const { data: q } = await supabase.from("anfrage").select("produkte").eq("id", formular.bezug.id).single();
    produkte = q?.produkte ?? [];
  }
  let ab: FormularDruck["ab"] = null;
  if (auftragId) {
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase.from("auftrag").select("produkte").eq("id", auftragId).single(),
      supabase.from("beleg").select("id, nummer").eq("auftrag_id", auftragId).eq("art", "auftragsbestaetigung").neq("status", "entwurf").is("deleted_at", null).maybeSingle(),
    ]);
    produkte = a?.produkte ?? [];
    if (b) {
      const { data: pos } = await supabase.from("beleg_position").select("typ, titel, menge, einheit, optional").eq("beleg_id", b.id).is("deleted_at", null).order("reihenfolge");
      ab = {
        nummer: b.nummer,
        leistungen: (pos ?? [])
          .filter((p) => p.typ === "artikel" && !p.optional && p.titel)
          .map((p) => `${Number(p.menge).toLocaleString("de-DE")} ${p.einheit ?? ""} ${p.titel}`.replace(/\s+/g, " ").trim()),
      };
    }
  }
  return { formular, firma, zeilen, erfasser, ab, checkliste: checklisteFuer(produkte, getCustomer().checklisten), problem };
}
