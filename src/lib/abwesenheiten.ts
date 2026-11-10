import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { arbeitstageImJahr, type AbwesenheitStatus } from "@/lib/team";
import { plusTage } from "@/lib/woche";
import { berlinNachUtc } from "@/lib/zeit";

export type Abwesenheit = {
  id: string;
  art: string;
  von: string;
  bis: string;
  status: AbwesenheitStatus;
  notiz: string | null;
  created_at: string;
  mitarbeiter: { id: string; name: string; kuerzel: string; urlaubsanspruch_tage: number | null };
};

const FELDER = "id, art, von, bis, status, notiz, created_at, mitarbeiter:mitarbeiter_id(id, name, kuerzel, urlaubsanspruch_tage)";

export type Urlaubskonto = { anspruch: number; genehmigt: number; beantragt: number; rest: number };

/** Urlaubskonto eines Jahres aus den Urlaubs-Abwesenheiten (Arbeitstage Mo–Fr) */
export function urlaubskonto(anspruch: number, liste: Pick<Abwesenheit, "art" | "von" | "bis" | "status">[], jahr: number): Urlaubskonto {
  const urlaub = liste.filter((a) => a.art === "urlaub");
  const genehmigt = urlaub.filter((a) => a.status === "genehmigt").reduce((s, a) => s + arbeitstageImJahr(a.von, a.bis, jahr), 0);
  const beantragt = urlaub.filter((a) => a.status === "beantragt").reduce((s, a) => s + arbeitstageImJahr(a.von, a.bis, jahr), 0);
  return { anspruch, genehmigt, beantragt, rest: anspruch - genehmigt - beantragt };
}

/** Einsätze eines Mitarbeiters, die einen Zeitraum (ganze Tage, Berlin) berühren */
export async function eingeplantIm(mitarbeiterId: string, von: string, bis: string) {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase
    .from("einsatz_monteur")
    .select("einsatz:einsatz_id!inner(id, beginn, ende, auftrag:auftrag_id(id, nummer, kunde:kunde_id(name)))")
    .eq("mitarbeiter_id", mitarbeiterId)
    .lt("einsatz.beginn", berlinNachUtc(`${plusTage(bis, 1)}T00:00`)!)
    .gt("einsatz.ende", berlinNachUtc(`${von}T00:00`)!)
    .returns<{ einsatz: { id: string; auftrag: { id: string; nummer: string; kunde: { name: string } | null } | null } }[]>();
  return (data ?? []).map((x) => ({ id: x.einsatz.id, auftrag: x.einsatz.auftrag }));
}

/** Seite „Abwesenheiten“: offene Anträge (mit Planungskonflikten), alle Abwesenheiten des Jahres, Urlaubskonten */
export async function ladeAbwesenheiten(jahr: number, mitarbeiter: string) {
  const { supabase } = await pruefeSitzung();
  let alle = supabase.from("abwesenheit").select(FELDER).lte("von", `${jahr}-12-31`).gte("bis", `${jahr}-01-01`);
  if (mitarbeiter) alle = alle.eq("mitarbeiter_id", mitarbeiter);
  const [jahrListe, offene, aktive, einstellung] = await Promise.all([
    alle.order("von", { ascending: false }).limit(1000).returns<Abwesenheit[]>(),
    supabase.from("abwesenheit").select(FELDER).eq("status", "beantragt").order("von").limit(200).returns<Abwesenheit[]>(),
    supabase.from("mitarbeiter").select("id, name, kuerzel, urlaubsanspruch_tage").eq("aktiv", true).order("name"),
    supabase.from("einstellung").select("urlaubsanspruch_tage").maybeSingle(),
  ]);
  if (jahrListe.error) throw new Error(`Abwesenheiten konnten nicht geladen werden: ${jahrListe.error.message}`);
  const standard = einstellung.data?.urlaubsanspruch_tage ?? 30;
  const liste = jahrListe.data ?? [];

  // Für Urlaubskonten alle Urlaube des Jahres aller Mitarbeiter (unabhängig vom Filter)
  const { data: urlaube } = await supabase.from("abwesenheit").select("mitarbeiter_id, art, von, bis, status").eq("art", "urlaub").lte("von", `${jahr}-12-31`).gte("bis", `${jahr}-01-01`);
  const jeMitarbeiter = new Map<string, { art: string; von: string; bis: string; status: AbwesenheitStatus }[]>();
  for (const u of urlaube ?? []) jeMitarbeiter.set(u.mitarbeiter_id, [...(jeMitarbeiter.get(u.mitarbeiter_id) ?? []), u as { art: string; von: string; bis: string; status: AbwesenheitStatus }]);
  const konten = (aktive.data ?? []).map((m) => ({ mitarbeiter: m, konto: urlaubskonto(m.urlaubsanspruch_tage ?? standard, jeMitarbeiter.get(m.id) ?? [], jahr) }));

  const offeneMitKonflikt = await Promise.all(
    (offene.data ?? []).map(async (a) => {
      const j = Number(a.von.slice(0, 4));
      // Resturlaub nach Genehmigung: Anspruch minus genehmigt minus dieser Antrag (nur für das angezeigte Jahr)
      const genehmigte = (jeMitarbeiter.get(a.mitarbeiter.id) ?? []).filter((u) => u.status === "genehmigt");
      const kontoVorher = j === jahr ? urlaubskonto(a.mitarbeiter.urlaubsanspruch_tage ?? standard, genehmigte, j) : null;
      return {
        ...a,
        eingeplant: await eingeplantIm(a.mitarbeiter.id, a.von, a.bis),
        restDanach: a.art === "urlaub" && kontoVorher ? kontoVorher.rest - arbeitstageImJahr(a.von, a.bis, j) : null,
      };
    }),
  );

  return { liste, offene: offeneMitKonflikt, konten, mitarbeiter: aktive.data ?? [], standard };
}
