import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import type { AuftragPhase } from "@/lib/status";
import type { Konflikt } from "@/lib/montageplan-text";
import { arbeitstage, plusTage } from "@/lib/woche";
import { berlinNachUtc, utcNachBerlinLokal } from "@/lib/zeit";

export type Monteur = { id: string; name: string; kuerzel: string };
export type TafelEinsatz = {
  id: string;
  /** Ortszeit Berlin „YYYY-MM-DDTHH:MM“ */
  beginn: string;
  ende: string;
  fest: boolean;
  hinweis: string | null;
  monteure: string[];
  auftrag: { id: string; nummer: string; titel: string; phase: AuftragPhase; kunde: string; objekt: string | null } | null;
};
export type TafelAbwesenheit = { id: string; mitarbeiter_id: string; art: string; von: string; bis: string; status: "beantragt" | "genehmigt" };

/** Arbeitszeit aus den Einstellungen in vollen Stunden (Standard 7 bis 16 Uhr) */
export async function ladeArbeitszeit() {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("einstellung").select("arbeitszeit_von, arbeitszeit_bis").maybeSingle();
  return { von: Number(data?.arbeitszeit_von?.slice(0, 2) ?? 7), bis: Number(data?.arbeitszeit_bis?.slice(0, 2) ?? 16) };
}

/** Alles für die Plantafel einer Woche (Montag bis Freitag) */
export async function ladeTafel(montag: string) {
  const { supabase } = await pruefeSitzung();
  const tage = arbeitstage(montag);
  const von = berlinNachUtc(`${montag}T00:00`)!;
  const bis = berlinNachUtc(`${plusTage(montag, 7)}T00:00`)!;

  const [zeit, monteure, einsaetze, abwesenheiten, konflikte] = await Promise.all([
    ladeArbeitszeit(),
    supabase.from("mitarbeiter").select("id, name, kuerzel").eq("ist_monteur", true).eq("aktiv", true).order("reihenfolge").order("name").returns<Monteur[]>(),
    supabase
      .from("einsatz")
      .select("id, beginn, ende, fest, hinweis, team:einsatz_monteur(mitarbeiter_id), auftrag:auftrag_id(id, nummer, titel, phase, objekt, kunde:kunde_id(name))")
      .lt("beginn", bis)
      .gt("ende", von)
      .not("auftrag_id", "is", null)
      .order("beginn")
      .returns<
        {
          id: string;
          beginn: string;
          ende: string;
          fest: boolean;
          hinweis: string | null;
          team: { mitarbeiter_id: string }[];
          auftrag: { id: string; nummer: string; titel: string; phase: AuftragPhase; objekt: string | null; kunde: { name: string } | null } | null;
        }[]
      >(),
    supabase
      .from("abwesenheit")
      .select("id, mitarbeiter_id, art, von, bis, status")
      .in("status", ["beantragt", "genehmigt"])
      .lte("von", tage[4])
      .gte("bis", tage[0])
      .returns<TafelAbwesenheit[]>(),
    supabase.rpc("einsatz_konflikte", { p_von: von, p_bis: bis }).returns<Konflikt[]>(),
  ]);
  if (einsaetze.error) throw new Error(`Einsätze konnten nicht geladen werden: ${einsaetze.error.message}`);

  return {
    raster: { tage, ...zeit },
    monteure: monteure.data ?? [],
    einsaetze: (einsaetze.data ?? []).map<TafelEinsatz>((e) => ({
      id: e.id,
      beginn: utcNachBerlinLokal(e.beginn),
      ende: utcNachBerlinLokal(e.ende),
      fest: e.fest,
      hinweis: e.hinweis,
      monteure: e.team.map((t) => t.mitarbeiter_id),
      auftrag: e.auftrag
        ? { id: e.auftrag.id, nummer: e.auftrag.nummer, titel: e.auftrag.titel, phase: e.auftrag.phase, objekt: e.auftrag.objekt, kunde: e.auftrag.kunde?.name ?? "" }
        : null,
    })),
    abwesenheiten: abwesenheiten.data ?? [],
    konflikte: (konflikte.data as Konflikt[] | null) ?? [],
  };
}
