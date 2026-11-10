import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { suchbegriff } from "@/lib/kunden";
import { zuTafelEinsatz } from "@/lib/montageplan";
import type { Abrechnung, AuftragPhase, TicketArt, TicketPrio, TicketStatus } from "@/lib/status";
import { plusTage } from "@/lib/woche";

export type TicketZeile = {
  id: string;
  nummer: string;
  thema: string;
  art: TicketArt;
  abrechnung: Abrechnung;
  prioritaet: TicketPrio;
  status: TicketStatus;
  wunschtermin: string | null;
  vorab_datum: string | null;
  objekt: string | null;
  zustaendig_id: string | null;
  created_at: string;
  kunde: { id: string; name: string } | null;
  auftrag: { id: string; nummer: string } | null;
  einsaetze: { id: string; beginn: string; fest: boolean }[];
};
export type Ticket = TicketZeile & { kunde_id: string; auftrag_id: string | null; problem: string | null };

const ZEILE =
  "id, nummer, thema, art, abrechnung, prioritaet, status, wunschtermin, vorab_datum, objekt, zustaendig_id, created_at, kunde:kunde_id(id, name), auftrag:auftrag_id(id, nummer), einsaetze:einsatz(id, beginn, fest)";

export type TicketFilter = { art: TicketArt | ""; status: TicketStatus | ""; q: string; meine: boolean; erledigte: boolean };

/** Tickets für Liste und Board; Anzahl je Status und Art für die Schnellfilter */
export async function ladeTickets(f: TicketFilter) {
  const { supabase, benutzer } = await pruefeSitzung();
  const q = suchbegriff(f.q);
  let kundenIds: string[] = [];
  if (q) {
    const { data } = await supabase.from("kunde").select("id").ilike("name", `%${q}%`).limit(200);
    kundenIds = (data ?? []).map((k) => k.id);
  }
  const basis = (felder: string) => {
    let a = supabase.from("service_ticket").select(felder);
    if (f.meine) a = a.eq("zustaendig_id", benutzer.id);
    if (q) {
      const b = ["nummer", "thema", "objekt", "problem"].map((s) => `${s}.ilike.%${q}%`);
      if (kundenIds.length) b.push(`kunde_id.in.(${kundenIds.join(",")})`);
      a = a.or(b.join(","));
    }
    return a;
  };
  let liste = basis(ZEILE);
  if (f.art) liste = liste.eq("art", f.art);
  if (f.status) liste = liste.eq("status", f.status);
  else if (!f.erledigte) liste = liste.in("status", ["neu", "eingeplant", "in_arbeit", "erledigt"]);
  const [ergebnis, alle] = await Promise.all([
    liste.order("nummer", { ascending: false }).limit(500).returns<TicketZeile[]>(),
    basis("art, status").limit(5000).returns<{ art: TicketArt; status: TicketStatus }[]>(),
  ]);
  if (ergebnis.error) throw new Error(`Tickets konnten nicht geladen werden: ${ergebnis.error.message}`);
  const anzahl: Record<string, number> = {};
  for (const t of alle.data ?? []) {
    anzahl[`s:${t.status}`] = (anzahl[`s:${t.status}`] ?? 0) + 1;
    anzahl[`a:${t.art}`] = (anzahl[`a:${t.art}`] ?? 0) + 1;
  }
  return { liste: ergebnis.data ?? [], anzahl };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ein Ticket mit Kunde, Ursprungsauftrag, Einsätzen und Historie */
export async function ladeTicket(id: string) {
  if (!UUID.test(id)) return null;
  const { supabase } = await pruefeSitzung();
  const { data: t } = await supabase
    .from("service_ticket")
    .select(`${ZEILE.replace(", einsaetze:einsatz(id, beginn, fest)", "")}, kunde_id, auftrag_id, problem`)
    .eq("id", id)
    .maybeSingle<Omit<Ticket, "einsaetze">>();
  if (!t) return null;
  const [kunde, auftrag, einsaetze, historie, notizen, namen] = await Promise.all([
    supabase.from("kunde").select("id, name, nummer, telefon, email").eq("id", t.kunde_id).maybeSingle(),
    t.auftrag_id ? supabase.from("auftrag").select("id, nummer, titel, phase").eq("id", t.auftrag_id).maybeSingle<{ id: string; nummer: string; titel: string; phase: AuftragPhase }>() : Promise.resolve({ data: null }),
    supabase
      .from("einsatz")
      .select("id, beginn, ende, fest, hinweis, fahrzeug_id, team:einsatz_monteur(mitarbeiter_id), auftrag:auftrag_id(id, nummer, titel, phase, kunde:kunde_id(name)), ticket:ticket_id(id, nummer, thema, art, kunde:kunde_id(name))")
      .eq("ticket_id", id)
      .order("beginn"),
    supabase.rpc("historie", { p_tabelle: "service_ticket", p_id: id }),
    supabase.from("historie_notiz").select("art, text, created_at, created_by").eq("ticket_id", id).order("created_at", { ascending: false }),
    supabase.from("benutzer").select("id, name"),
  ]);
  const name = new Map((namen.data ?? []).map((b) => [b.id, b.name]));
  const ma = await supabase.from("mitarbeiter").select("id, name");
  const maName = new Map((ma.data ?? []).map((m) => [m.id, m.name]));
  const liste = ((einsaetze.data ?? []) as unknown as Parameters<typeof zuTafelEinsatz>[0][]).map(zuTafelEinsatz);
  return {
    ticket: { ...t, einsaetze: liste.map((e) => ({ id: e.id, beginn: e.beginn, fest: e.fest })) } as Ticket,
    kunde: kunde.data,
    auftrag: auftrag.data,
    einsaetze: liste.map((e) => ({ ...e, team: e.monteure.map((m) => maName.get(m) ?? "?") })),
    historie: historieText(historie.data ?? [], notizen.data ?? [], name),
  };
}

const FELDER: Record<string, string> = {
  thema: "Thema",
  art: "Art",
  abrechnung: "Abrechnung",
  prioritaet: "Priorität",
  problem: "Problem",
  wunschtermin: "Wunschtermin",
  zustaendig_id: "Zuständig",
  objekt: "Objekt",
  auftrag_id: "Ursprungsauftrag",
};
const STATUS: Record<string, string> = { neu: "Neu", eingeplant: "Eingeplant", in_arbeit: "In Arbeit", erledigt: "Erledigt", abgerechnet: "Abgerechnet" };
type AuditZeile = { zeit: string; benutzer_name: string | null; aktion: string; geaendert: string[] | null; vorher: Record<string, unknown> | null; nachher: Record<string, unknown> | null };
export type HistorieEintrag = { zeit: string; wer: string | null; text: string; art: "ereignis" | "notiz" | "telefonat" };

function historieText(audit: AuditZeile[], notizen: { art: string; text: string; created_at: string; created_by: string | null }[], namen: Map<string, string>): HistorieEintrag[] {
  const ereignisse: HistorieEintrag[] = audit.flatMap((e) => {
    if (e.aktion === "insert") return [{ zeit: e.zeit, wer: e.benutzer_name, text: "Ticket angelegt", art: "ereignis" as const }];
    if (e.aktion !== "update" || !e.geaendert) return [];
    const texte: string[] = [];
    if (e.geaendert.includes("status")) texte.push(`Status: ${STATUS[String(e.vorher?.status)]} → ${STATUS[String(e.nachher?.status)]}`);
    const sonst = e.geaendert.filter((g) => FELDER[g]).map((g) => FELDER[g]);
    if (sonst.length) texte.push(`Geändert: ${sonst.join(", ")}`);
    return texte.map((text) => ({ zeit: e.zeit, wer: e.benutzer_name ?? (e.geaendert?.includes("status") ? "System" : null), text, art: "ereignis" as const }));
  });
  const eigene: HistorieEintrag[] = notizen.map((n) => ({ zeit: n.created_at, wer: n.created_by ? (namen.get(n.created_by) ?? null) : null, text: n.text, art: n.art === "telefonat" ? "telefonat" : "notiz" }));
  return [...ereignisse, ...eigene].sort((a, b) => b.zeit.localeCompare(a.zeit));
}

export type TerminierbaresTicket = { id: string; nummer: string; thema: string; kunde: string; vorab_datum: string; prioritaet: TicketPrio; art: TicketArt };

/** Zeile „Terminierbar“ im Service-Plan: offene Tickets ohne Einsatz, deren Tag in der Woche liegt (überfällige in der aktuellen Woche) */
export async function ladeTerminierbar(montag: string, freitag: string, aktuelleWoche: boolean): Promise<TerminierbaresTicket[]> {
  const { supabase } = await pruefeSitzung();
  let a = supabase
    .from("service_ticket")
    .select("id, nummer, thema, vorab_datum, prioritaet, art, kunde:kunde_id(name), einsaetze:einsatz(id)")
    .in("status", ["neu", "in_arbeit"])
    .lte("vorab_datum", plusTage(freitag, 2));
  if (!aktuelleWoche) a = a.gte("vorab_datum", montag);
  const { data } = await a.returns<{ id: string; nummer: string; thema: string; vorab_datum: string; prioritaet: TicketPrio; art: TicketArt; kunde: { name: string } | null; einsaetze: { id: string }[] }[]>();
  return (data ?? [])
    .filter((t) => !t.einsaetze.length)
    .map((t) => ({ id: t.id, nummer: t.nummer, thema: t.thema, kunde: t.kunde?.name ?? "", vorab_datum: t.vorab_datum, prioritaet: t.prioritaet, art: t.art }));
}

/** Tickets eines Kunden bzw. eines Auftrags (Kunden- und Auftragsseite) */
export async function ladeTicketsZu(bezug: { kunde_id?: string; auftrag_id?: string }) {
  const { supabase } = await pruefeSitzung();
  let a = supabase.from("service_ticket").select("id, nummer, thema, status, art");
  if (bezug.kunde_id) a = a.eq("kunde_id", bezug.kunde_id);
  if (bezug.auftrag_id) a = a.eq("auftrag_id", bezug.auftrag_id);
  const { data } = await a.order("nummer", { ascending: false }).returns<{ id: string; nummer: string; thema: string; status: TicketStatus; art: TicketArt }[]>();
  return data ?? [];
}

