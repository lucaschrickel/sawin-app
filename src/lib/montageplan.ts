import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { feiertageImZeitraum } from "@/lib/feiertage";
import type { Konflikt } from "@/lib/montageplan-text";
import { gruppenOrdnen, pipelineStufe, stufeDatum, type PipelineAuftrag, type PipelineStufe, type TafelKolonne } from "@/lib/plantafel-logik";
import type { AuftragPhase } from "@/lib/status";
import { arbeitstageWochen, plusTage } from "@/lib/woche";
import { berlinNachUtc, utcNachBerlinLokal } from "@/lib/zeit";

export type Plan = "montage" | "service";
export type Monteur = { id: string; name: string; kuerzel: string };
export type TafelFahrzeug = { id: string; kennzeichen: string; typ: string | null; tuev_am: string | null; service_am: string | null; uvv_am: string | null };
/** Bezug eines Einsatzes: Auftrag (Montageplan) oder Service-Ticket (Service-Plan) */
export type EinsatzBezug = { art: "auftrag" | "ticket"; id: string; nummer: string; titel: string; kunde: string; reklamation: boolean };
export type TafelEinsatz = {
  id: string;
  /** Ortszeit Berlin „YYYY-MM-DDTHH:MM“ */
  beginn: string;
  ende: string;
  fest: boolean;
  hinweis: string | null;
  monteure: string[];
  fahrzeug_id: string | null;
  ressource_id: string | null;
  /** Token der Planungspalette (plan-1 … plan-10), frei gewählte Farbe (#RRGGBB) oder null = Standard nach Typ */
  farbe: string | null;
  bezug: EinsatzBezug | null;
};
export type TafelRessource = { id: string; name: string; notiz: string | null };
/** Auftrag ohne Montagetermin in der Pipeline des Montageplans */
export type PipelineEintrag = PipelineAuftrag & {
  id: string;
  nummer: string;
  titel: string;
  kunde: string;
  abschlaege_gesamt: number;
  stufe: PipelineStufe;
  datum: string;
};
export type TafelAbwesenheit = { id: string; mitarbeiter_id: string; art: string; von: string; bis: string; status: "beantragt" | "genehmigt" };

/** Arbeitszeit aus den Einstellungen in vollen Stunden (Standard 7 bis 16 Uhr) */
export async function ladeArbeitszeit() {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("einstellung").select("arbeitszeit_von, arbeitszeit_bis").maybeSingle();
  return { von: Number(data?.arbeitszeit_von?.slice(0, 2) ?? 7), bis: Number(data?.arbeitszeit_bis?.slice(0, 2) ?? 16) };
}

/** Bundesland für die Feiertage */
export async function ladeBundesland() {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("einstellung").select("bundesland").maybeSingle();
  return data?.bundesland ?? "NI";
}

type RohEinsatz = {
  id: string;
  beginn: string;
  ende: string;
  fest: boolean;
  hinweis: string | null;
  fahrzeug_id: string | null;
  ressource_id?: string | null;
  farbe?: string | null;
  team: { mitarbeiter_id: string }[];
  auftrag: { id: string; nummer: string; titel: string; phase: AuftragPhase; kunde: { name: string } | null } | null;
  ticket: { id: string; nummer: string; thema: string; art: string; kunde: { name: string } | null } | null;
};
const EINSATZ_FELDER =
  "id, beginn, ende, fest, hinweis, fahrzeug_id, ressource_id, farbe, team:einsatz_monteur(mitarbeiter_id), auftrag:auftrag_id(id, nummer, titel, phase, kunde:kunde_id(name)), ticket:ticket_id(id, nummer, thema, art, kunde:kunde_id(name))";

export const zuTafelEinsatz = (e: RohEinsatz): TafelEinsatz => ({
  id: e.id,
  beginn: utcNachBerlinLokal(e.beginn),
  ende: utcNachBerlinLokal(e.ende),
  fest: e.fest,
  hinweis: e.hinweis,
  monteure: e.team.map((t) => t.mitarbeiter_id),
  fahrzeug_id: e.fahrzeug_id,
  ressource_id: e.ressource_id ?? null,
  farbe: e.farbe ?? null,
  bezug: e.auftrag
    ? { art: "auftrag", id: e.auftrag.id, nummer: e.auftrag.nummer, titel: e.auftrag.titel, kunde: e.auftrag.kunde?.name ?? "", reklamation: e.auftrag.phase === "reklamation" }
    : e.ticket
      ? { art: "ticket", id: e.ticket.id, nummer: e.ticket.nummer, titel: e.ticket.thema, kunde: e.ticket.kunde?.name ?? "", reklamation: e.ticket.art === "reklamation" }
      : null,
});

/** Einsätze, die einen Zeitraum berühren (beide Pläne), z. B. für Kalender und Plantafel */
export async function ladeEinsaetze(vonUtc: string, bisUtc: string) {
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.from("einsatz").select(EINSATZ_FELDER).lt("beginn", bisUtc).gt("ende", vonUtc).order("beginn").returns<RohEinsatz[]>();
  if (error) throw new Error(`Einsätze konnten nicht geladen werden: ${error.message}`);
  return (data ?? []).map(zuTafelEinsatz);
}

/** Aktive Fahrzeuge für den Termin-Dialog */
export async function ladeFahrzeugAuswahl() {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("fahrzeug").select("id, kennzeichen, typ, tuev_am, service_am, uvv_am").order("kennzeichen").returns<TafelFahrzeug[]>();
  return data ?? [];
}

/**
 * Alles für die Plantafel: 1 Woche (Stundenraster) oder 4 Wochen (tagesgenau), jeweils Montag bis Freitag.
 * Einsätze beider Pläne: der andere erscheint als „belegt“. Kolonnen, weitere Ressourcen, Reihenfolge der Gruppen.
 */
export async function ladeTafel(montag: string, wochen: 1 | 4 = 1) {
  const { supabase } = await pruefeSitzung();
  const tage = arbeitstageWochen(montag, wochen);
  const von = berlinNachUtc(`${montag}T00:00`)!;
  const bis = berlinNachUtc(`${plusTage(montag, 7 * wochen)}T00:00`)!;

  const [zeit, land, monteure, einsaetze, abwesenheiten, konflikte, fahrzeuge, kolonnen, ressourcen, einstellung] = await Promise.all([
    ladeArbeitszeit(),
    ladeBundesland(),
    supabase.from("mitarbeiter").select("id, name, kuerzel").eq("ist_monteur", true).eq("aktiv", true).order("reihenfolge").order("name").returns<Monteur[]>(),
    ladeEinsaetze(von, bis),
    supabase
      .from("abwesenheit")
      .select("id, mitarbeiter_id, art, von, bis, status")
      .in("status", ["beantragt", "genehmigt"])
      .lte("von", tage.at(-1)!)
      .gte("bis", tage[0])
      .returns<TafelAbwesenheit[]>(),
    supabase.rpc("einsatz_konflikte", { p_von: von, p_bis: bis }).returns<Konflikt[]>(),
    ladeFahrzeugAuswahl(),
    supabase
      .from("kolonne")
      .select("id, name, stammfahrzeug_id, reihenfolge, mitglieder:kolonne_mitglied(mitarbeiter_id, reihenfolge, created_at)")
      .order("reihenfolge")
      .order("name")
      .returns<{ id: string; name: string; stammfahrzeug_id: string | null; mitglieder: { mitarbeiter_id: string; reihenfolge: number; created_at: string }[] }[]>(),
    supabase.from("ressource").select("id, name, notiz").order("reihenfolge").order("name").returns<TafelRessource[]>(),
    supabase.from("einstellung").select("plantafel_gruppen").maybeSingle<{ plantafel_gruppen: string[] | null }>(),
  ]);

  const aktiv = new Set((monteure.data ?? []).map((m) => m.id));
  const kol: TafelKolonne[] = (kolonnen.data ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    stammfahrzeug_id: k.stammfahrzeug_id,
    mitglieder: [...k.mitglieder]
      .sort((a, b) => a.reihenfolge - b.reihenfolge || a.created_at.localeCompare(b.created_at))
      .map((m) => m.mitarbeiter_id)
      .filter((m) => aktiv.has(m)),
  }));

  return {
    raster: { tage, ...zeit, tagesgenau: wochen === 4 },
    monteure: monteure.data ?? [],
    einsaetze,
    abwesenheiten: abwesenheiten.data ?? [],
    konflikte: (konflikte.data as Konflikt[] | null) ?? [],
    fahrzeuge,
    feiertage: feiertageImZeitraum(tage[0], tage.at(-1)!, land),
    kolonnen: kol,
    ressourcen: ressourcen.data ?? [],
    gruppen: gruppenOrdnen(einstellung.data?.plantafel_gruppen ?? null, kol.map((k) => k.id)),
  };
}

type RohPipeline = PipelineAuftrag & {
  id: string;
  nummer: string;
  titel: string;
  kunde: { name: string } | null;
  einsaetze: { id: string }[];
  abschlaege: { status: string }[];
};

/**
 * Auftrags-Pipeline (CLAUDE.md „Planungszeilen im Montageplan“): offene Aufträge ohne Montagetermin mit Liefertermin
 * oder Stufen-Datum, je in genau einer Stufe. ohneTermin: offene Aufträge ohne Einsatz und ohne Datum (Hinweis oben).
 */
export async function ladePipeline(): Promise<{ eintraege: PipelineEintrag[]; ohneTermin: { id: string; nummer: string; kunde: string }[] }> {
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase
    .from("auftrag")
    .select(
      "id, nummer, titel, liefertermin, warten_auf_kunde, stufe_lieferung_datum, stufe_abschlag_datum, stufe_warten_datum, kunde:kunde_id(name), einsaetze:einsatz(id), abschlaege:beleg(status)",
    )
    .in("phase", ["bestellung", "montage", "reklamation"])
    .eq("abschlaege.art", "abschlagsrechnung")
    .neq("abschlaege.status", "entwurf")
    .order("nummer")
    .returns<Omit<RohPipeline, "abschlaege_bezahlt">[]>();
  if (error) throw new Error(`Pipeline konnte nicht geladen werden: ${error.message}`);
  const eintraege: PipelineEintrag[] = [];
  const ohneTermin: { id: string; nummer: string; kunde: string }[] = [];
  for (const a of data ?? []) {
    if (a.einsaetze.length) continue;
    const p: PipelineAuftrag = { ...a, abschlaege_bezahlt: a.abschlaege.filter((x) => x.status === "bezahlt").length };
    const stufe = pipelineStufe(p);
    const datum = stufeDatum(p, stufe);
    if (!datum) {
      ohneTermin.push({ id: a.id, nummer: a.nummer, kunde: a.kunde?.name ?? "" });
      continue;
    }
    eintraege.push({ ...p, id: a.id, nummer: a.nummer, titel: a.titel, kunde: a.kunde?.name ?? "", abschlaege_gesamt: a.abschlaege.length, stufe, datum });
  }
  return { eintraege, ohneTermin };
}
