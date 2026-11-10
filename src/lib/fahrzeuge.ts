import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { zuTafelEinsatz } from "@/lib/montageplan";
import { berlinNachUtc, heuteBerlin } from "@/lib/zeit";

export type Fahrzeug = {
  id: string;
  kennzeichen: string;
  typ: string | null;
  km_stand: number | null;
  hinweise: string | null;
  tuev_am: string | null;
  service_am: string | null;
  uvv_am: string | null;
};
export type Werkstatt = { id: string; von: string; bis: string; notiz: string | null };

const FELDER = "id, kennzeichen, typ, km_stand, hinweise, tuev_am, service_am, uvv_am";

/** Liste mit nächstem Einsatz und laufenden bzw. kommenden Werkstattterminen */
export async function ladeFahrzeuge() {
  const { supabase } = await pruefeSitzung();
  const heute = heuteBerlin();
  const jetzt = berlinNachUtc(`${heute}T00:00`)!;
  const [liste, einsaetze, werkstatt] = await Promise.all([
    supabase.from("fahrzeug").select(FELDER).order("kennzeichen").returns<Fahrzeug[]>(),
    supabase.from("einsatz").select("fahrzeug_id, beginn").not("fahrzeug_id", "is", null).gte("ende", jetzt).order("beginn"),
    supabase.from("fahrzeug_werkstatt").select("id, fahrzeug_id, von, bis, notiz").gte("bis", heute).order("von"),
  ]);
  const naechster = new Map<string, string>();
  for (const e of einsaetze.data ?? []) if (e.fahrzeug_id && !naechster.has(e.fahrzeug_id)) naechster.set(e.fahrzeug_id, e.beginn);
  const ws = new Map<string, Werkstatt[]>();
  for (const w of werkstatt.data ?? []) ws.set(w.fahrzeug_id, [...(ws.get(w.fahrzeug_id) ?? []), w]);
  return (liste.data ?? []).map((f) => ({ ...f, naechsterEinsatz: naechster.get(f.id) ?? null, werkstatt: ws.get(f.id) ?? [] }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ein Fahrzeug mit Werkstattterminen und Einsätzen (ab heute, höchstens 20) */
export async function ladeFahrzeug(id: string) {
  if (!UUID.test(id)) return null;
  const { supabase } = await pruefeSitzung();
  const { data: f } = await supabase.from("fahrzeug").select(FELDER).eq("id", id).maybeSingle<Fahrzeug>();
  if (!f) return null;
  const jetzt = berlinNachUtc(`${heuteBerlin()}T00:00`)!;
  const [werkstatt, einsaetze] = await Promise.all([
    supabase.from("fahrzeug_werkstatt").select("id, von, bis, notiz").eq("fahrzeug_id", id).order("von", { ascending: false }).returns<Werkstatt[]>(),
    supabase
      .from("einsatz")
      .select("id, beginn, ende, fest, hinweis, fahrzeug_id, team:einsatz_monteur(mitarbeiter_id), auftrag:auftrag_id(id, nummer, titel, phase, kunde:kunde_id(name)), ticket:ticket_id(id, nummer, thema, art, kunde:kunde_id(name))")
      .eq("fahrzeug_id", id)
      .gte("ende", jetzt)
      .order("beginn")
      .limit(20),
  ]);
  return {
    fahrzeug: f,
    werkstatt: werkstatt.data ?? [],
    einsaetze: ((einsaetze.data ?? []) as unknown as Parameters<typeof zuTafelEinsatz>[0][]).map(zuTafelEinsatz),
  };
}
