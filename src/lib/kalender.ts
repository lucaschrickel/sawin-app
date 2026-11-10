import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { feiertageImZeitraum } from "@/lib/feiertage";
import { KALENDER_ARTEN, type KalenderArt, type KalenderEintrag, type TerminDaten } from "@/lib/kalender-text";
import { ladeBundesland, ladeEinsaetze } from "@/lib/montageplan";
import { ABWESENHEIT_TEXT } from "@/lib/team";
import { plusTage } from "@/lib/woche";
import { berlinNachUtc, utcNachBerlinLokal } from "@/lib/zeit";

type Filter = { von: string; bis: string; aus: KalenderArt[]; mitarbeiter: string[] };

type RohTermin = {
  id: string;
  titel: string;
  art: "beratung" | "intern";
  datum: string;
  beginn: string;
  ende: string;
  ort: string | null;
  notiz: string | null;
  team: { mitarbeiter_id: string }[];
  kunde: { id: string; name: string } | null;
  anfrage: { id: string; titel: string } | null;
  auftrag: { id: string; nummer: string; titel: string } | null;
};

/** Alle Einträge des Kalenders im Zeitraum: Einsätze (Montage, Service), Aufmaß-Termine, eigene Termine, Abwesenheiten */
export async function ladeKalender(f: Filter) {
  const { supabase } = await pruefeSitzung();
  const vonUtc = berlinNachUtc(`${f.von}T00:00`)!;
  const bisUtc = berlinNachUtc(`${plusTage(f.bis, 1)}T00:00`)!;
  const [einsaetze, aufmasse, termine, abwesenheiten, mitarbeiter, benutzer, land] = await Promise.all([
    ladeEinsaetze(vonUtc, bisUtc),
    supabase.from("anfrage").select("id, titel, objekt, aufmass_termin, zustaendig_id, kunde:kunde_id(name)").gte("aufmass_termin", vonUtc).lt("aufmass_termin", bisUtc).returns<
      { id: string; titel: string; objekt: string | null; aufmass_termin: string; zustaendig_id: string | null; kunde: { name: string } | null }[]
    >(),
    supabase
      .from("termin")
      .select("id, titel, art, datum, beginn, ende, ort, notiz, team:termin_mitarbeiter(mitarbeiter_id), kunde:kunde_id(id, name), anfrage:anfrage_id(id, titel), auftrag:auftrag_id(id, nummer, titel)")
      .gte("datum", f.von)
      .lte("datum", f.bis)
      .returns<RohTermin[]>(),
    supabase.from("abwesenheit").select("id, mitarbeiter_id, art, von, bis, status").neq("status", "abgelehnt").lte("von", f.bis).gte("bis", f.von),
    supabase.from("mitarbeiter").select("id, name, kuerzel").eq("aktiv", true).order("name"),
    supabase.from("benutzer").select("id, mitarbeiter_id"),
    ladeBundesland(),
  ]);
  const name = new Map((mitarbeiter.data ?? []).map((m) => [m.id, m.name]));
  const mitarbeiterVon = new Map((benutzer.data ?? []).map((b) => [b.id, b.mitarbeiter_id]));

  const alle: KalenderEintrag[] = [
    ...einsaetze.map<KalenderEintrag>((e) => ({
      schluessel: `e-${e.id}`,
      art: e.bezug?.art === "ticket" ? "service" : "montage",
      titel: e.bezug?.kunde || e.bezug?.nummer || "Einsatz",
      unter: e.bezug ? `${e.bezug.nummer} · ${e.bezug.titel}` : null,
      beginn: e.beginn,
      ende: e.ende,
      ganztags: false,
      mitarbeiter: e.monteure,
      href: e.bezug ? (e.bezug.art === "auftrag" ? `/auftraege/${e.bezug.id}` : `/service/${e.bezug.id}`) : null,
      termin: null,
      vorgeplant: !e.fest,
      beantragt: false,
    })),
    ...(aufmasse.data ?? []).map<KalenderEintrag>((a) => {
      const beginn = utcNachBerlinLokal(a.aufmass_termin);
      const ende = utcNachBerlinLokal(new Date(Date.parse(a.aufmass_termin) + 90 * 60000).toISOString());
      const ma = a.zustaendig_id ? mitarbeiterVon.get(a.zustaendig_id) : null;
      return {
        schluessel: `a-${a.id}`,
        art: "aufmass",
        titel: a.kunde?.name ?? a.titel,
        unter: [a.titel, a.objekt].filter(Boolean).join(" · "),
        beginn,
        ende,
        ganztags: false,
        mitarbeiter: ma ? [ma] : [],
        href: `/anfragen/${a.id}`,
        termin: null,
        vorgeplant: false,
        beantragt: false,
      };
    }),
    ...(termine.data ?? []).map<KalenderEintrag>((t) => {
      const termin: TerminDaten = {
        id: t.id,
        titel: t.titel,
        art: t.art,
        datum: t.datum,
        beginn: t.beginn.slice(0, 5),
        ende: t.ende.slice(0, 5),
        mitarbeiter: t.team.map((x) => x.mitarbeiter_id),
        bezug: t.auftrag
          ? { art: "auftrag", id: t.auftrag.id, text: `${t.auftrag.nummer} · ${t.auftrag.titel}` }
          : t.anfrage
            ? { art: "anfrage", id: t.anfrage.id, text: t.anfrage.titel }
            : t.kunde
              ? { art: "kunde", id: t.kunde.id, text: t.kunde.name }
              : null,
        ort: t.ort,
        notiz: t.notiz,
      };
      return {
        schluessel: `t-${t.id}`,
        art: t.art,
        titel: t.titel,
        unter: [termin.bezug?.text, t.ort].filter(Boolean).join(" · ") || null,
        beginn: `${t.datum}T${termin.beginn}`,
        ende: `${t.datum}T${termin.ende}`,
        ganztags: false,
        mitarbeiter: termin.mitarbeiter,
        href: null,
        termin,
        vorgeplant: false,
        beantragt: false,
      };
    }),
    ...(abwesenheiten.data ?? []).map<KalenderEintrag>((a) => ({
      schluessel: `w-${a.id}`,
      art: "abwesenheit",
      titel: `${name.get(a.mitarbeiter_id) ?? "Mitarbeiter"}: ${ABWESENHEIT_TEXT[a.art] ?? a.art}`,
      unter: a.status === "beantragt" ? "beantragt" : null,
      beginn: `${a.von}T00:00`,
      ende: `${a.bis}T23:59`,
      ganztags: true,
      mitarbeiter: [a.mitarbeiter_id],
      href: `/abwesenheiten?mitarbeiter=${a.mitarbeiter_id}`,
      termin: null,
      vorgeplant: false,
      beantragt: a.status === "beantragt",
    })),
  ].sort((a, b) => Number(b.ganztags) - Number(a.ganztags) || a.beginn.localeCompare(b.beginn));

  // Mitarbeiter-Filter vor dem Zählen, Terminarten-Filter danach (die Anzahl steht am Filter)
  const nachMitarbeiter = f.mitarbeiter.length ? alle.filter((e) => e.mitarbeiter.some((m) => f.mitarbeiter.includes(m))) : alle;
  const anzahl = Object.fromEntries(KALENDER_ARTEN.map((a) => [a, nachMitarbeiter.filter((e) => e.art === a).length])) as Record<KalenderArt, number>;
  return {
    eintraege: nachMitarbeiter.filter((e) => !f.aus.includes(e.art)),
    anzahl,
    mitarbeiter: mitarbeiter.data ?? [],
    feiertage: feiertageImZeitraum(f.von, f.bis, land),
  };
}
