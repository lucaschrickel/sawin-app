import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { feiertageImZeitraum } from "@/lib/feiertage";
import { ladeBundesland } from "@/lib/montageplan";
import { ABWESENHEIT_TEXT } from "@/lib/montageplan-text";
import { plusTage } from "@/lib/woche";
import { berlinNachUtc, utcNachBerlinLokal } from "@/lib/zeit";

/*
  Wochenplan je Monteur oder Kolonne (CLAUDE.md „Wochenplan je Monteur“): alle freigegebenen Einsätze beider Pläne
  einer Woche mit Kunde, Adresse, Telefon, Zeit, Auftrag bzw. Ticket, Team, Fahrzeug und Hinweis; dazu Feiertage und
  genehmigte Abwesenheiten. Vorgeplante Einsätze erscheinen nicht.
*/

export type WochenplanEinsatz = {
  id: string;
  /** Ortszeit Berlin „YYYY-MM-DDTHH:MM“ */
  beginn: string;
  ende: string;
  nummer: string;
  art: "auftrag" | "ticket";
  titel: string;
  kunde: string;
  telefon: string | null;
  adresse: string;
  team: string[];
  /** Personen des Plans in diesem Einsatz (bei einer Kolonne) */
  beteiligt: string[];
  fahrzeug: string | null;
  ressource: string | null;
  hinweis: string | null;
};
export type WochenplanTag = { datum: string; feiertag: string | null; abwesend: { name: string; art: string }[]; einsaetze: WochenplanEinsatz[] };
export type Wochenplan = { titel: string; kolonne: boolean; personen: string[]; montag: string; tage: WochenplanTag[]; fahrzeug: string | null };

type Kunde = { name: string; telefon: string | null; strasse: string | null; plz: string | null; ort: string | null } | null;
type Roh = {
  id: string;
  beginn: string;
  ende: string;
  hinweis: string | null;
  fahrzeug: { kennzeichen: string } | null;
  ressource: { name: string } | null;
  team: { mitarbeiter_id: string }[];
  auftrag: { nummer: string; titel: string; objekt: string | null; kunde: Kunde } | null;
  ticket: { nummer: string; thema: string; objekt: string | null; problem: string | null; kunde: Kunde } | null;
};

const adresseVon = (objekt: string | null | undefined, k: Kunde) =>
  objekt?.trim() || [k?.strasse, [k?.plz, k?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** Wochenplan laden; null, wenn Monteur bzw. Kolonne nicht gefunden */
export async function ladeWochenplan(montag: string, wer: { monteur: string } | { kolonne: string }): Promise<Wochenplan | null> {
  const { supabase } = await pruefeSitzung();
  let titel: string;
  let personen: { id: string; name: string }[];
  let fahrzeug: string | null = null;
  if ("kolonne" in wer) {
    const { data: k } = await supabase
      .from("kolonne")
      .select("name, fahrzeug:stammfahrzeug_id(kennzeichen), mitglieder:kolonne_mitglied(reihenfolge, mitarbeiter:mitarbeiter_id(id, name, aktiv))")
      .eq("id", wer.kolonne)
      .maybeSingle<{ name: string; fahrzeug: { kennzeichen: string } | null; mitglieder: { reihenfolge: number; mitarbeiter: { id: string; name: string; aktiv: boolean } | null }[] }>();
    if (!k) return null;
    titel = k.name;
    fahrzeug = k.fahrzeug?.kennzeichen ?? null;
    personen = k.mitglieder
      .sort((a, b) => a.reihenfolge - b.reihenfolge)
      .map((m) => m.mitarbeiter)
      .filter((m): m is { id: string; name: string; aktiv: boolean } => !!m?.aktiv);
  } else {
    const { data: m } = await supabase.from("mitarbeiter").select("id, name").eq("id", wer.monteur).maybeSingle<{ id: string; name: string }>();
    if (!m) return null;
    titel = m.name;
    personen = [m];
  }
  const ids = personen.map((p) => p.id);
  const samstag = plusTage(montag, 5);
  const von = berlinNachUtc(`${montag}T00:00`)!;
  const bis = berlinNachUtc(`${plusTage(montag, 7)}T00:00`)!;

  const [{ data: roh }, { data: abw }, land] = await Promise.all([
    ids.length
      ? supabase
          .from("einsatz")
          .select(
            "id, beginn, ende, hinweis, fahrzeug:fahrzeug_id(kennzeichen), ressource:ressource_id(name), team:einsatz_monteur(mitarbeiter_id), filter:einsatz_monteur!inner(mitarbeiter_id), auftrag:auftrag_id(nummer, titel, objekt, kunde:kunde_id(name, telefon, strasse, plz, ort)), ticket:ticket_id(nummer, thema, objekt, problem, kunde:kunde_id(name, telefon, strasse, plz, ort))",
          )
          .eq("fest", true)
          .in("filter.mitarbeiter_id", ids)
          .lt("beginn", bis)
          .gt("ende", von)
          .order("beginn")
          .returns<Roh[]>()
      : Promise.resolve({ data: [] as Roh[] }),
    ids.length
      ? supabase.from("abwesenheit").select("mitarbeiter_id, art, von, bis").eq("status", "genehmigt").in("mitarbeiter_id", ids).lte("von", samstag).gte("bis", montag)
      : Promise.resolve({ data: [] as { mitarbeiter_id: string; art: string; von: string; bis: string }[] }),
    ladeBundesland(),
  ]);

  const alle = new Map<string, string>();
  const teamIds = [...new Set((roh ?? []).flatMap((e) => e.team.map((t) => t.mitarbeiter_id)))];
  if (teamIds.length) {
    const { data: namen } = await supabase.from("mitarbeiter").select("id, name").in("id", teamIds);
    for (const n of namen ?? []) alle.set(n.id, n.name);
  }
  const einsaetze: WochenplanEinsatz[] = (roh ?? []).map((e) => {
    const b = e.auftrag ?? e.ticket;
    const kunde = (e.auftrag?.kunde ?? e.ticket?.kunde) as Kunde;
    const team = e.team.map((t) => t.mitarbeiter_id);
    return {
      id: e.id,
      beginn: utcNachBerlinLokal(e.beginn),
      ende: utcNachBerlinLokal(e.ende),
      nummer: b?.nummer ?? "",
      art: e.auftrag ? "auftrag" : "ticket",
      titel: e.auftrag?.titel ?? e.ticket?.thema ?? "",
      kunde: kunde?.name ?? "",
      telefon: kunde?.telefon ?? null,
      adresse: adresseVon(b?.objekt, kunde),
      team: team.map((t) => alle.get(t) ?? "?"),
      beteiligt: team.filter((t) => ids.includes(t)).map((t) => alle.get(t) ?? "?"),
      fahrzeug: e.fahrzeug?.kennzeichen ?? null,
      ressource: e.ressource?.name ?? null,
      hinweis: [e.hinweis, e.ticket?.problem].filter(Boolean).join(" · ") || null,
    };
  });

  const feiertage = new Map(feiertageImZeitraum(montag, samstag, land).map((f) => [f.datum, f.name]));
  const name = new Map(personen.map((p) => [p.id, p.name]));
  const tage: WochenplanTag[] = Array.from({ length: 6 }, (_, i) => plusTage(montag, i)).map((datum) => ({
    datum,
    feiertag: feiertage.get(datum) ?? null,
    abwesend: (abw ?? []).filter((a) => a.von <= datum && a.bis >= datum).map((a) => ({ name: name.get(a.mitarbeiter_id) ?? "", art: ABWESENHEIT_TEXT[a.art] ?? a.art })),
    einsaetze: einsaetze.filter((e) => e.beginn.slice(0, 10) <= datum && e.ende.slice(0, 10) >= datum && !(e.ende.slice(0, 10) === datum && e.ende.slice(11) === "00:00")),
  }));
  // Samstag nur, wenn dort etwas steht
  const mitSamstag = tage[5].einsaetze.length > 0 || tage[5].abwesend.length > 0;
  return { titel, kolonne: "kolonne" in wer, personen: personen.map((p) => p.name), montag, tage: mitSamstag ? tage : tage.slice(0, 5), fahrzeug };
}
