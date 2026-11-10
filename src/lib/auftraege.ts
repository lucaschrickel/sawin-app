import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { suchbegriff } from "@/lib/kunden";
import { AUFTRAG_PHASE_TEXT, MONTAGESTATUS_TEXT, type AuftragPhase, type Montagestatus } from "@/lib/status";

export type EinsatzKurz = { id: string; beginn: string; ende: string; fest: boolean };

export type AuftragZeile = {
  id: string;
  nummer: string;
  titel: string;
  objekt: string | null;
  phase: AuftragPhase;
  montagestatus: Montagestatus;
  produkte: string[];
  liefertermin: string | null;
  zustaendig_id: string | null;
  warten_auf_kunde: boolean;
  pruefhinweis: string | null;
  noch_nicht_bestellt: string | null;
  created_at: string;
  kunde: { id: string; name: string } | null;
  einsaetze: EinsatzKurz[];
  /** Bestellzeilen des Auftrags (für den abgeleiteten Bestellstatus) */
  bestellzeilen: { geliefert: boolean }[];
};

export type Auftrag = AuftragZeile & {
  kunde_id: string;
  anfrage_id: string | null;
  nachtrag_zu: string | null;
  herkunft: string | null;
  bemerkung: string | null;
  abgeschlossen_am: string | null;
};

const ZEILE =
  "id, nummer, titel, objekt, phase, montagestatus, produkte, liefertermin, zustaendig_id, warten_auf_kunde, pruefhinweis, noch_nicht_bestellt, created_at, kunde:kunde_id(id, name), einsaetze:einsatz(id, beginn, ende, fest), bestellzeilen:bestellzeile(geliefert)";

/** Nächster Montagetermin (ab heute), sonst der letzte; null ohne Einsatz */
export function montageTermin(einsaetze: EinsatzKurz[]): EinsatzKurz | null {
  if (!einsaetze.length) return null;
  const jetzt = new Date().toISOString();
  const sortiert = [...einsaetze].sort((a, b) => a.beginn.localeCompare(b.beginn));
  return sortiert.find((e) => e.ende >= jetzt) ?? sortiert.at(-1)!;
}

export type AuftraegeFilter = { phase: AuftragPhase | ""; q: string; meine: boolean; abgeschlossene: boolean; produkt: string };

/** Aufträge für Liste und Pipeline; Anzahl je Phase für die Filter. */
export async function ladeAuftraege(f: AuftraegeFilter) {
  const { supabase, benutzer } = await pruefeSitzung();
  const q = suchbegriff(f.q);
  let kundenIds: string[] = [];
  if (q) {
    const { data } = await supabase.from("kunde").select("id").ilike("name", `%${q}%`).limit(200);
    kundenIds = (data ?? []).map((k) => k.id);
  }
  const basis = (felder: string) => {
    let a = supabase.from("auftrag").select(felder);
    if (!f.abgeschlossene) a = a.neq("phase", "abgeschlossen");
    if (f.meine) a = a.eq("zustaendig_id", benutzer.id);
    if (f.produkt) a = a.contains("produkte", [f.produkt]);
    if (q) {
      const bedingungen = ["nummer", "titel", "objekt", "bemerkung"].map((s) => `${s}.ilike.%${q}%`);
      if (kundenIds.length) bedingungen.push(`kunde_id.in.(${kundenIds.join(",")})`);
      a = a.or(bedingungen.join(","));
    }
    return a;
  };
  let liste = basis(ZEILE);
  if (f.phase) liste = liste.eq("phase", f.phase);
  const [ergebnis, phasen] = await Promise.all([
    liste.order("nummer", { ascending: false }).limit(500).returns<AuftragZeile[]>(),
    basis("phase").limit(5000).returns<{ phase: AuftragPhase }[]>(),
  ]);
  if (ergebnis.error) throw new Error(`Aufträge konnten nicht geladen werden: ${ergebnis.error.message}`);
  const anzahl: Record<string, number> = { alle: 0 };
  for (const p of phasen.data ?? []) {
    anzahl.alle += 1;
    anzahl[p.phase] = (anzahl[p.phase] ?? 0) + 1;
  }
  return { liste: ergebnis.data ?? [], anzahl };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EinsatzMitTeam = EinsatzKurz & { hinweis: string | null; monteure: { id: string; name: string; kuerzel: string }[] };
export type HistorieEintrag = { zeit: string; wer: string | null; text: string; art: "ereignis" | "notiz" | "telefonat" };

/** Ein Auftrag mit Kunde, Anfrage, Einsätzen, Nachträgen und Historie */
export async function ladeAuftrag(id: string) {
  if (!UUID.test(id)) return null;
  const { supabase } = await pruefeSitzung();
  const { data: a } = await supabase
    .from("auftrag")
    .select(`${ZEILE.replace(", einsaetze:einsatz(id, beginn, ende, fest)", "")}, kunde_id, anfrage_id, nachtrag_zu, herkunft, bemerkung, abgeschlossen_am`)
    .eq("id", id)
    .maybeSingle<Omit<Auftrag, "einsaetze">>();
  if (!a) return null;

  const [kunde, anfrage, einsaetze, ursprung, nachtraege, historie, notizen, namen] = await Promise.all([
    supabase.from("kunde").select("id, name, nummer, telefon, email").eq("id", a.kunde_id).maybeSingle(),
    a.anfrage_id ? supabase.from("anfrage").select("id, nummer, titel").eq("id", a.anfrage_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase
      .from("einsatz")
      .select("id, beginn, ende, fest, hinweis, team:einsatz_monteur(mitarbeiter:mitarbeiter_id(id, name, kuerzel))")
      .eq("auftrag_id", id)
      .order("beginn")
      .returns<(EinsatzKurz & { hinweis: string | null; team: { mitarbeiter: { id: string; name: string; kuerzel: string } | null }[] })[]>(),
    a.nachtrag_zu ? supabase.from("auftrag").select("id, nummer, titel").eq("id", a.nachtrag_zu).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("auftrag").select("id, nummer, titel, phase").eq("nachtrag_zu", id).order("nummer"),
    supabase.rpc("historie", { p_tabelle: "auftrag", p_id: id }),
    supabase.from("historie_notiz").select("art, text, created_at, created_by").eq("auftrag_id", id).order("created_at", { ascending: false }),
    benutzerNamen(),
  ]);
  const liste: EinsatzMitTeam[] = (einsaetze.data ?? []).map(({ team, ...e }) => ({
    ...e,
    monteure: team.flatMap((t) => (t.mitarbeiter ? [t.mitarbeiter] : [])),
  }));
  return {
    auftrag: { ...a, einsaetze: liste } as Auftrag,
    kunde: kunde.data,
    anfrage: anfrage.data,
    einsaetze: liste,
    ursprung: ursprung.data,
    nachtraege: nachtraege.data ?? [],
    historie: historieText(historie.data ?? [], notizen.data ?? [], namen),
  };
}

const FELDER: Record<string, string> = {
  titel: "Titel",
  objekt: "Objekt",
  herkunft: "Herkunft",
  produkte: "Produkte",
  zustaendig_id: "Zuständig",
  bemerkung: "Bemerkung",
  noch_nicht_bestellt: "Noch nicht bestellt",
};

type AuditZeile = { zeit: string; benutzer_name: string | null; aktion: string; geaendert: string[] | null; vorher: Record<string, unknown> | null; nachher: Record<string, unknown> | null };

const datum = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join(".") : null);

function historieText(audit: AuditZeile[], notizen: { art: string; text: string; created_at: string; created_by: string | null }[], namen: Map<string, string>): HistorieEintrag[] {
  const ereignisse: HistorieEintrag[] = audit.flatMap((e) => {
    if (e.aktion === "insert") return [{ zeit: e.zeit, wer: e.benutzer_name, text: "Auftrag angelegt", art: "ereignis" as const }];
    if (e.aktion !== "update" || !e.geaendert) return [];
    const g = e.geaendert;
    const texte: string[] = [];
    if (g.includes("deleted_at")) texte.push("Auftrag gelöscht");
    if (g.includes("phase")) {
      const v = AUFTRAG_PHASE_TEXT[e.vorher?.phase as AuftragPhase] ?? e.vorher?.phase;
      const n = AUFTRAG_PHASE_TEXT[e.nachher?.phase as AuftragPhase] ?? e.nachher?.phase;
      texte.push(`Phase: ${v} → ${n}`);
    }
    if (g.includes("montagestatus")) texte.push(`Montagestatus: ${MONTAGESTATUS_TEXT[e.nachher?.montagestatus as Montagestatus] ?? e.nachher?.montagestatus}`);
    if (g.includes("liefertermin")) texte.push(datum(e.nachher?.liefertermin) ? `Liefertermin ${datum(e.nachher?.liefertermin)}` : "Liefertermin entfernt");
    if (g.includes("warten_auf_kunde")) texte.push(e.nachher?.warten_auf_kunde ? "Warten auf Kunde" : "Warten auf Kunde beendet");
    if (g.includes("pruefhinweis") && !e.nachher?.pruefhinweis) texte.push("Prüfhinweis geprüft und entfernt");
    const sonst = g.filter((x) => FELDER[x]).map((x) => FELDER[x]);
    if (sonst.length) texte.push(`Geändert: ${sonst.join(", ")}`);
    return texte.map((text) => ({ zeit: e.zeit, wer: e.benutzer_name, text, art: "ereignis" as const }));
  });
  const eigene: HistorieEintrag[] = notizen.map((n) => ({
    zeit: n.created_at,
    wer: n.created_by ? (namen.get(n.created_by) ?? null) : null,
    text: n.text,
    art: n.art === "telefonat" ? "telefonat" : "notiz",
  }));
  return [...ereignisse, ...eigene].sort((x, y) => y.zeit.localeCompare(x.zeit));
}

async function benutzerNamen() {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("benutzer").select("id, name");
  return new Map((data ?? []).map((b) => [b.id, b.name]));
}
