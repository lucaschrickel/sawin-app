import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import type { AnfrageStatus } from "@/lib/anfragen-status";
import { suchbegriff } from "@/lib/kunden";

export type AnfrageZeile = {
  id: string;
  nummer: string;
  titel: string;
  status: AnfrageStatus;
  archiv: "gewonnen" | "verloren" | null;
  verlust_grund: string | null;
  archiviert_am: string | null;
  objekt: string | null;
  herkunft: string | null;
  produkte: string[];
  geschaetzter_wert: number | null;
  wiedervorlage: string | null;
  aufmass_termin: string | null;
  eingang: string;
  zustaendig_id: string | null;
  kunde: { id: string; name: string } | null;
};

export type Anfrage = AnfrageZeile & {
  kunde_id: string;
  beschreibung: string | null;
  notiz: string | null;
  nachtrag_zu: string | null;
};

const ZEILE =
  "id, nummer, titel, status, archiv, verlust_grund, archiviert_am, objekt, herkunft, produkte, geschaetzter_wert, wiedervorlage, aufmass_termin, eingang, zustaendig_id, kunde:kunde_id(id, name)";

export type AnfragenFilter = { ansicht: "offen" | "archiv"; status: AnfrageStatus | ""; q: string; meine: boolean };

/** Anfragen für Liste und Board (offen) bzw. Archiv; Anzahl je Status für die Filter. */
export async function ladeAnfragen(f: AnfragenFilter) {
  const { supabase, benutzer } = await pruefeSitzung();
  const q = suchbegriff(f.q);
  let kundenIds: string[] = [];
  if (q) {
    const { data } = await supabase.from("kunde").select("id").ilike("name", `%${q}%`).limit(200);
    kundenIds = (data ?? []).map((k) => k.id);
  }
  const basis = (felder: string) => {
    let a = supabase.from("anfrage").select(felder);
    a = f.ansicht === "archiv" ? a.not("archiv", "is", null) : a.is("archiv", null);
    if (f.meine) a = a.eq("zustaendig_id", benutzer.id);
    if (q) {
      const bedingungen = ["titel", "objekt", "herkunft", "beschreibung", "nummer"].map((s) => `${s}.ilike.%${q}%`);
      if (kundenIds.length) bedingungen.push(`kunde_id.in.(${kundenIds.join(",")})`);
      a = a.or(bedingungen.join(","));
    }
    return a;
  };

  let liste = basis(ZEILE);
  if (f.status && f.ansicht === "offen") liste = liste.eq("status", f.status);
  liste = f.ansicht === "archiv" ? liste.order("archiviert_am", { ascending: false }) : liste.order("eingang", { ascending: false }).order("nummer", { ascending: false });
  const [ergebnis, stati] = await Promise.all([
    liste.limit(500).returns<AnfrageZeile[]>(),
    f.ansicht === "offen" ? basis("status").limit(2000).returns<{ status: AnfrageStatus }[]>() : Promise.resolve({ data: [] as { status: AnfrageStatus }[] }),
  ]);
  if (ergebnis.error) throw new Error(`Anfragen konnten nicht geladen werden: ${ergebnis.error.message}`);
  const anzahl: Record<string, number> = { alle: 0 };
  for (const s of stati.data ?? []) {
    anzahl.alle += 1;
    anzahl[s.status] = (anzahl[s.status] ?? 0) + 1;
  }
  return { liste: ergebnis.data ?? [], anzahl };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HistorieEintrag = { zeit: string; wer: string | null; text: string; art: "ereignis" | "notiz" | "telefonat" };

/** Eine Anfrage mit Kunde, Auftrag, Historie (Audit-Log und Notizen). */
export async function ladeAnfrage(id: string) {
  if (!UUID.test(id)) return null;
  const { supabase } = await pruefeSitzung();
  const { data: q } = await supabase
    .from("anfrage")
    .select(`${ZEILE.replace("kunde:kunde_id(id, name)", "kunde_id, beschreibung, notiz, nachtrag_zu")}`)
    .eq("id", id)
    .maybeSingle<Omit<Anfrage, "kunde">>();
  if (!q) return null;

  const [kunde, lieferadressen, auftrag, historie, notizen] = await Promise.all([
    supabase.from("kunde").select("id, name, nummer, telefon, email, strasse, plz, ort, herkunft").eq("id", q.kunde_id).maybeSingle(),
    supabase.from("kunde_lieferadresse").select("bezeichnung, strasse, plz, ort").eq("kunde_id", q.kunde_id).is("alt_seit", null).order("reihenfolge"),
    supabase.from("auftrag").select("id, nummer").eq("anfrage_id", id).maybeSingle(),
    supabase.rpc("historie", { p_tabelle: "anfrage", p_id: id }),
    supabase.from("historie_notiz").select("id, art, text, created_at, created_by").eq("anfrage_id", id).order("created_at", { ascending: false }),
  ]);
  return {
    anfrage: { ...q, kunde: kunde.data ? { id: kunde.data.id, name: kunde.data.name } : null } as Anfrage,
    kunde: kunde.data,
    lieferadressen: lieferadressen.data ?? [],
    auftrag: auftrag.data,
    historie: historieText(historie.data ?? [], notizen.data ?? [], await benutzerNamen()),
  };
}

const FELDER: Record<string, string> = {
  titel: "Kurzbezeichnung",
  objekt: "Objekt",
  beschreibung: "Beschreibung",
  herkunft: "Herkunft",
  produkte: "Produkte",
  geschaetzter_wert: "geschätzter Wert",
  zustaendig_id: "Zuständig",
  wiedervorlage: "Wiedervorlage",
  aufmass_termin: "Aufmaß-Termin",
  notiz: "interne Notiz",
  kunde_id: "Kunde",
};
const STATUS: Record<string, string> = {
  neu: "Neu",
  in_klaerung: "In Klärung",
  aufmass: "Aufmaß",
  angebot_erstellen: "Angebot erstellen",
  angebot_versendet: "Angebot versendet",
};

type AuditZeile = { zeit: string; benutzer_name: string | null; aktion: string; geaendert: string[] | null; vorher: Record<string, unknown> | null; nachher: Record<string, unknown> | null };

/** Audit-Log und Notizen als lesbare Historie, neueste zuerst. */
function historieText(audit: AuditZeile[], notizen: { art: string; text: string; created_at: string; created_by: string | null }[], namen: Map<string, string>): HistorieEintrag[] {
  const ereignisse: HistorieEintrag[] = audit.flatMap((e) => {
    if (e.aktion === "insert") return [{ zeit: e.zeit, wer: e.benutzer_name, text: "Anfrage angelegt", art: "ereignis" as const }];
    if (e.aktion !== "update" || !e.geaendert) return [];
    const texte: string[] = [];
    if (e.geaendert.includes("status")) texte.push(`Status: ${STATUS[String(e.vorher?.status)] ?? e.vorher?.status} → ${STATUS[String(e.nachher?.status)] ?? e.nachher?.status}`);
    if (e.geaendert.includes("archiv")) {
      const neu = e.nachher?.archiv;
      texte.push(neu === "gewonnen" ? "Gewonnen" : neu === "verloren" ? `Verloren${e.nachher?.verlust_grund ? `: ${e.nachher.verlust_grund}` : ""}` : "Aus dem Archiv wiederhergestellt");
    }
    const sonst = e.geaendert.filter((g) => FELDER[g]).map((g) => FELDER[g]);
    if (sonst.length) texte.push(`Geändert: ${sonst.join(", ")}`);
    return texte.map((text) => ({ zeit: e.zeit, wer: e.benutzer_name, text, art: "ereignis" as const }));
  });
  const eigene: HistorieEintrag[] = notizen.map((n) => ({
    zeit: n.created_at,
    wer: n.created_by ? (namen.get(n.created_by) ?? null) : null,
    text: n.text,
    art: n.art === "telefonat" ? "telefonat" : "notiz",
  }));
  return [...ereignisse, ...eigene].sort((a, b) => b.zeit.localeCompare(a.zeit));
}

/** Aktive Benutzer für „Zuständig“ */
export async function ladeBenutzerAuswahl() {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("benutzer").select("id, name").eq("aktiv", true).order("name");
  return data ?? [];
}
async function benutzerNamen() {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("benutzer").select("id, name");
  return new Map((data ?? []).map((b) => [b.id, b.name]));
}

/** Anfragen und Aufträge eines Kunden (Kundenseite) */
export async function ladeZumKunden(kundeId: string) {
  const { supabase } = await pruefeSitzung();
  const [anfragen, auftraege] = await Promise.all([
    supabase.from("anfrage").select("id, nummer, titel, status, archiv, eingang").eq("kunde_id", kundeId).order("eingang", { ascending: false }),
    supabase.from("auftrag").select("id, nummer, titel, phase, created_at").eq("kunde_id", kundeId).order("created_at", { ascending: false }),
  ]);
  return { anfragen: anfragen.data ?? [], auftraege: auftraege.data ?? [] };
}
