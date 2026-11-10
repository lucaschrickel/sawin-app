import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { suchbegriff } from "@/lib/kunden";
import { stunden, type AbwesenheitStatus } from "@/lib/team";
import { montagVon, plusTage } from "@/lib/woche";
import { berlinNachUtc, heuteBerlin, utcNachBerlinLokal } from "@/lib/zeit";

export type Mitarbeiter = {
  id: string;
  name: string;
  kuerzel: string;
  rolle: string | null;
  telefon: string | null;
  ist_monteur: boolean;
  aktiv: boolean;
  urlaubsanspruch_tage: number | null;
};
const FELDER = "id, name, kuerzel, rolle, telefon, ist_monteur, aktiv, urlaubsanspruch_tage";

export type MitarbeiterFilter = { nurMonteure: boolean; inaktive: boolean; q: string };

/** Liste mit Stunden der laufenden Woche und heutiger Abwesenheit */
export async function ladeMitarbeiterListe(f: MitarbeiterFilter) {
  const { supabase } = await pruefeSitzung();
  const heute = heuteBerlin();
  const montag = montagVon(heute);
  let a = supabase.from("mitarbeiter").select(FELDER);
  if (f.nurMonteure) a = a.eq("ist_monteur", true);
  if (!f.inaktive) a = a.eq("aktiv", true);
  const q = suchbegriff(f.q);
  if (q) a = a.or(["name", "kuerzel", "rolle", "telefon"].map((s) => `${s}.ilike.%${q}%`).join(","));
  const [liste, zeiten, abwesend] = await Promise.all([
    a.order("aktiv", { ascending: false }).order("name").returns<Mitarbeiter[]>(),
    supabase.from("zeitbuchung").select("mitarbeiter_id, beginn, ende, pause_min").gte("datum", montag).lte("datum", plusTage(montag, 6)),
    supabase.from("abwesenheit").select("mitarbeiter_id, art, status").lte("von", heute).gte("bis", heute).neq("status", "abgelehnt"),
  ]);
  const woche = new Map<string, number>();
  for (const z of zeiten.data ?? []) woche.set(z.mitarbeiter_id, (woche.get(z.mitarbeiter_id) ?? 0) + stunden(z.beginn, z.ende, z.pause_min));
  const heuteWeg = new Map((abwesend.data ?? []).map((x) => [x.mitarbeiter_id, { art: x.art as string, status: x.status as AbwesenheitStatus }]));
  return {
    liste: (liste.data ?? []).map((m) => ({ ...m, stundenWoche: woche.get(m.id) ?? 0, heuteAbwesend: heuteWeg.get(m.id) ?? null })),
    montag,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ein Mitarbeiter mit Einsätzen (diese und nächste Woche), Abwesenheiten des Jahres und Benutzerkonto */
export async function ladeMitarbeiter(id: string) {
  if (!UUID.test(id)) return null;
  const { supabase } = await pruefeSitzung();
  const { data: m } = await supabase.from("mitarbeiter").select(FELDER).eq("id", id).maybeSingle<Mitarbeiter>();
  if (!m) return null;
  const heute = heuteBerlin();
  const montag = montagVon(heute);
  const jahr = Number(heute.slice(0, 4));
  const [einsaetze, abwesenheiten, konto, einstellung] = await Promise.all([
    supabase
      .from("einsatz_monteur")
      .select("einsatz:einsatz_id!inner(id, beginn, ende, fest, auftrag:auftrag_id(id, nummer, titel, kunde:kunde_id(name)))")
      .eq("mitarbeiter_id", id)
      .gte("einsatz.ende", berlinNachUtc(`${montag}T00:00`)!)
      .lt("einsatz.beginn", berlinNachUtc(`${plusTage(montag, 14)}T00:00`)!)
      .returns<{ einsatz: { id: string; beginn: string; ende: string; fest: boolean; auftrag: { id: string; nummer: string; titel: string; kunde: { name: string } | null } | null } }[]>(),
    supabase.from("abwesenheit").select("id, art, von, bis, status, notiz").eq("mitarbeiter_id", id).lte("von", `${jahr}-12-31`).gte("bis", `${jahr}-01-01`).order("von", { ascending: false }),
    supabase.from("benutzer").select("id, name, email").eq("mitarbeiter_id", id).maybeSingle(),
    supabase.from("einstellung").select("urlaubsanspruch_tage").maybeSingle(),
  ]);
  return {
    mitarbeiter: m,
    einsaetze: (einsaetze.data ?? [])
      .map((x) => ({ ...x.einsatz, beginnLokal: utcNachBerlinLokal(x.einsatz.beginn), endeLokal: utcNachBerlinLokal(x.einsatz.ende) }))
      .sort((x, y) => x.beginn.localeCompare(y.beginn)),
    abwesenheiten: (abwesenheiten.data ?? []) as { id: string; art: string; von: string; bis: string; status: AbwesenheitStatus; notiz: string | null }[],
    benutzer: konto.data,
    anspruchStandard: einstellung.data?.urlaubsanspruch_tage ?? 30,
    montag,
    jahr,
  };
}
