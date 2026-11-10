import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { feiertageImZeitraum } from "@/lib/feiertage";
import type { Konflikt } from "@/lib/montageplan-text";
import type { AuftragPhase } from "@/lib/status";
import { arbeitstage, plusTage } from "@/lib/woche";
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
  bezug: EinsatzBezug | null;
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
  team: { mitarbeiter_id: string }[];
  auftrag: { id: string; nummer: string; titel: string; phase: AuftragPhase; kunde: { name: string } | null } | null;
  ticket: { id: string; nummer: string; thema: string; art: string; kunde: { name: string } | null } | null;
};
const EINSATZ_FELDER =
  "id, beginn, ende, fest, hinweis, fahrzeug_id, team:einsatz_monteur(mitarbeiter_id), auftrag:auftrag_id(id, nummer, titel, phase, kunde:kunde_id(name)), ticket:ticket_id(id, nummer, thema, art, kunde:kunde_id(name))";

export const zuTafelEinsatz = (e: RohEinsatz): TafelEinsatz => ({
  id: e.id,
  beginn: utcNachBerlinLokal(e.beginn),
  ende: utcNachBerlinLokal(e.ende),
  fest: e.fest,
  hinweis: e.hinweis,
  monteure: e.team.map((t) => t.mitarbeiter_id),
  fahrzeug_id: e.fahrzeug_id,
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

/** Alles für die Plantafel einer Woche (Montag bis Freitag). Einsätze beider Pläne: der andere erscheint als „belegt“. */
export async function ladeTafel(montag: string) {
  const { supabase } = await pruefeSitzung();
  const tage = arbeitstage(montag);
  const von = berlinNachUtc(`${montag}T00:00`)!;
  const bis = berlinNachUtc(`${plusTage(montag, 7)}T00:00`)!;

  const [zeit, land, monteure, einsaetze, abwesenheiten, konflikte, fahrzeuge] = await Promise.all([
    ladeArbeitszeit(),
    ladeBundesland(),
    supabase.from("mitarbeiter").select("id, name, kuerzel").eq("ist_monteur", true).eq("aktiv", true).order("reihenfolge").order("name").returns<Monteur[]>(),
    ladeEinsaetze(von, bis),
    supabase
      .from("abwesenheit")
      .select("id, mitarbeiter_id, art, von, bis, status")
      .in("status", ["beantragt", "genehmigt"])
      .lte("von", tage[4])
      .gte("bis", tage[0])
      .returns<TafelAbwesenheit[]>(),
    supabase.rpc("einsatz_konflikte", { p_von: von, p_bis: bis }).returns<Konflikt[]>(),
    ladeFahrzeugAuswahl(),
  ]);

  return {
    raster: { tage, ...zeit },
    monteure: monteure.data ?? [],
    einsaetze,
    abwesenheiten: abwesenheiten.data ?? [],
    konflikte: (konflikte.data as Konflikt[] | null) ?? [],
    fahrzeuge,
    feiertage: feiertageImZeitraum(tage[0], tage[4], land),
  };
}
