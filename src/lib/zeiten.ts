import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { stunden, type ZeitArt } from "@/lib/team";
import { kalenderwoche, montagVon, plusTage } from "@/lib/woche";
import { tag } from "@/lib/zeit";

export type Buchung = {
  id: string;
  datum: string;
  beginn: string;
  ende: string;
  pause_min: number;
  art: ZeitArt;
  taetigkeit: string | null;
  freigabe: "offen" | "freigegeben";
  stunden: number;
  mitarbeiter: { id: string; name: string; kuerzel: string };
  /** Bezug: Auftrag oder Service-Ticket */
  auftrag: { art: "auftrag" | "ticket"; id: string; nummer: string; titel: string; kunde: string } | null;
};

export type Zeitraum = { art: "woche" | "monat" | "gesamt"; von: string | null; bis: string | null; text: string; zurueck: string | null; vor: string | null };

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Zeitraum aus den URL-Parametern: Woche (ab = beliebiger Tag der Woche), Monat oder gesamt */
export function zeitraumAus(art: string, ab: string, heute: string): Zeitraum {
  const tagAb = DATUM.test(ab) ? ab : heute;
  if (art === "gesamt") return { art: "gesamt", von: null, bis: null, text: "Gesamt", zurueck: null, vor: null };
  if (art === "monat") {
    const von = `${tagAb.slice(0, 7)}-01`;
    const naechster = new Date(Date.UTC(Number(von.slice(0, 4)), Number(von.slice(5, 7)), 1)).toISOString().slice(0, 10);
    const voriger = new Date(Date.UTC(Number(von.slice(0, 4)), Number(von.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
    return { art: "monat", von, bis: plusTage(naechster, -1), text: `${MONATE[Number(von.slice(5, 7)) - 1]} ${von.slice(0, 4)}`, zurueck: voriger, vor: naechster };
  }
  const montag = montagVon(tagAb);
  return { art: "woche", von: montag, bis: plusTage(montag, 6), text: `KW ${kalenderwoche(montag)} · ${tag(montag)} – ${tag(plusTage(montag, 6))}`, zurueck: plusTage(montag, -7), vor: plusTage(montag, 7) };
}

export type ZeitenFilter = { von: string | null; bis: string | null; mitarbeiter?: string; auftrag?: string; ticket?: string; freigabe?: "offen" | "freigegeben" | "" };

type Roh = Omit<Buchung, "stunden" | "auftrag"> & {
  auftrag: { id: string; nummer: string; titel: string; kunde: { name: string } | null } | null;
  ticket: { id: string; nummer: string; thema: string; kunde: { name: string } | null } | null;
};

/** Buchungen im Zeitraum, neueste zuerst; Stunden berechnet */
export async function ladeBuchungen(f: ZeitenFilter): Promise<Buchung[]> {
  const { supabase } = await pruefeSitzung();
  let a = supabase
    .from("zeitbuchung")
    .select("id, datum, beginn, ende, pause_min, art, taetigkeit, freigabe, mitarbeiter:mitarbeiter_id(id, name, kuerzel), auftrag:auftrag_id(id, nummer, titel, kunde:kunde_id(name)), ticket:ticket_id(id, nummer, thema, kunde:kunde_id(name))");
  if (f.von) a = a.gte("datum", f.von);
  if (f.bis) a = a.lte("datum", f.bis);
  if (f.mitarbeiter) a = a.eq("mitarbeiter_id", f.mitarbeiter);
  if (f.auftrag) a = a.eq("auftrag_id", f.auftrag);
  if (f.ticket) a = a.eq("ticket_id", f.ticket);
  if (f.freigabe) a = a.eq("freigabe", f.freigabe);
  const { data, error } = await a.order("datum", { ascending: false }).order("beginn", { ascending: false }).limit(2000).returns<Roh[]>();
  if (error) throw new Error(`Zeiten konnten nicht geladen werden: ${error.message}`);
  return (data ?? []).map(({ ticket, ...z }) => ({
    ...z,
    beginn: z.beginn.slice(0, 5),
    ende: z.ende.slice(0, 5),
    stunden: stunden(z.beginn, z.ende, z.pause_min),
    auftrag: z.auftrag
      ? { art: "auftrag" as const, id: z.auftrag.id, nummer: z.auftrag.nummer, titel: z.auftrag.titel, kunde: z.auftrag.kunde?.name ?? "" }
      : ticket
        ? { art: "ticket" as const, id: ticket.id, nummer: ticket.nummer, titel: ticket.thema, kunde: ticket.kunde?.name ?? "" }
        : null,
  }));
}

/** Summen je Mitarbeiter (mit Aufteilung nach Art) */
export function summeJeMitarbeiter(liste: Buchung[]) {
  const m = new Map<string, { mitarbeiter: Buchung["mitarbeiter"]; stunden: number; freigegeben: number; jeArt: Partial<Record<ZeitArt, number>> }>();
  for (const z of liste) {
    const e = m.get(z.mitarbeiter.id) ?? { mitarbeiter: z.mitarbeiter, stunden: 0, freigegeben: 0, jeArt: {} };
    e.stunden += z.stunden;
    if (z.freigabe === "freigegeben") e.freigegeben += z.stunden;
    e.jeArt[z.art] = (e.jeArt[z.art] ?? 0) + z.stunden;
    m.set(z.mitarbeiter.id, e);
  }
  return [...m.values()].sort((a, b) => a.mitarbeiter.name.localeCompare(b.mitarbeiter.name, "de"));
}

/** Summen je Auftrag (mit Aufteilung nach Mitarbeiter); Buchungen ohne Auftrag als eigene Zeile */
export function summeJeAuftrag(liste: Buchung[]) {
  const m = new Map<string, { auftrag: Buchung["auftrag"]; stunden: number; jeMitarbeiter: Map<string, { name: string; stunden: number }> }>();
  for (const z of liste) {
    const k = z.auftrag ? `${z.auftrag.art}:${z.auftrag.id}` : "ohne";
    const e = m.get(k) ?? { auftrag: z.auftrag, stunden: 0, jeMitarbeiter: new Map() };
    e.stunden += z.stunden;
    const mm = e.jeMitarbeiter.get(z.mitarbeiter.id) ?? { name: z.mitarbeiter.name, stunden: 0 };
    mm.stunden += z.stunden;
    e.jeMitarbeiter.set(z.mitarbeiter.id, mm);
    m.set(k, e);
  }
  return [...m.values()]
    .map((e) => ({ ...e, jeMitarbeiter: [...e.jeMitarbeiter.values()].sort((a, b) => b.stunden - a.stunden) }))
    .sort((a, b) => (!a.auftrag ? 1 : !b.auftrag ? -1 : b.stunden - a.stunden));
}

/** Aktive Mitarbeiter und Arbeitszeit für den Dialog „Zeit eintragen“ */
export async function ladeZeitDialogDaten() {
  const { supabase } = await pruefeSitzung();
  const [m, e] = await Promise.all([
    supabase.from("mitarbeiter").select("id, name").eq("aktiv", true).order("name"),
    supabase.from("einstellung").select("arbeitszeit_von, arbeitszeit_bis").maybeSingle(),
  ]);
  return {
    mitarbeiter: m.data ?? [],
    beginn: (e.data?.arbeitszeit_von ?? "07:00").slice(0, 5),
    ende: (e.data?.arbeitszeit_bis ?? "16:00").slice(0, 5),
  };
}
