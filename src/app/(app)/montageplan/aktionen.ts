"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { suchbegriff } from "@/lib/kunden";
import { konfliktText, type Konflikt } from "@/lib/montageplan-text";
import { feiertageImZeitraum } from "@/lib/feiertage";
import { istHex, istPlanFarbe } from "@/lib/plantafel-logik";
import { berlinNachUtc, utcNachBerlinLokal } from "@/lib/zeit";

export type Ergebnis = { fehler?: string; ok?: boolean; warnung?: string; felder?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EinsatzDaten = {
  id: string | null;
  /** genau eins von beiden: Auftrag (Montageplan) oder Service-Ticket (Service-Plan) */
  auftrag_id: string | null;
  ticket_id: string | null;
  fahrzeug_id: string | null;
  /** Ortszeit Berlin „YYYY-MM-DDTHH:MM“ */
  beginn: string;
  ende: string;
  monteure: string[];
  /** null = Freigabe-Stand unverändert lassen (Ziehen in der Tafel) */
  fest: boolean | null;
  hinweis: string | null;
  /** weitere Ressource (Zeile wie Selbstabholer, Subunternehmer) */
  ressource_id?: string | null;
  /** plan-1 … plan-10 oder #RRGGBB, null = Standard nach Typ */
  farbe?: string | null;
};

/** Einsatz anlegen oder ändern (Dialog, Ziehen, Verlängern). Konflikte warnen, blockieren aber nicht. */
export async function einsatzSpeichern(d: EinsatzDaten): Promise<Ergebnis & { id?: string }> {
  const { supabase } = await pruefeSitzung();
  const beginn = berlinNachUtc(d.beginn ?? "");
  const ende = berlinNachUtc(d.ende ?? "");
  const felder: Record<string, string> = {};
  const auftrag = UUID.test(d.auftrag_id ?? "") ? d.auftrag_id : null;
  const ticket = UUID.test(d.ticket_id ?? "") ? d.ticket_id : null;
  if (!auftrag && !ticket) felder.auftrag = d.ticket_id !== undefined && d.auftrag_id === null ? "Bitte ein Service-Ticket wählen." : "Bitte einen Auftrag wählen.";
  if (d.fahrzeug_id && !UUID.test(d.fahrzeug_id)) felder.fahrzeug = "Bitte ein Fahrzeug aus der Liste wählen.";
  if (!beginn) felder.beginn = "Ungültiger Beginn.";
  if (!ende) felder.ende = "Ungültiges Ende.";
  if (beginn && ende && ende <= beginn) felder.ende = "Das Ende muss nach dem Beginn liegen.";
  const monteure = [...new Set((d.monteure ?? []).filter((m) => UUID.test(m)))];
  const ressource = d.ressource_id && UUID.test(d.ressource_id) ? d.ressource_id : null;
  if (!monteure.length && !ressource) felder.monteure = "Bitte mindestens einen Monteur oder eine weitere Ressource wählen.";
  const farbe = d.farbe ? d.farbe.trim() : null;
  if (farbe && !istHex(farbe) && !istPlanFarbe(farbe)) felder.farbe = "Bitte eine Farbe aus der Auswahl wählen.";
  if (d.id && !UUID.test(d.id)) return { fehler: "Einsatz nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };

  const { data: id, error } = await supabase.rpc("einsatz_speichern", {
    p_id: d.id,
    p_auftrag_id: auftrag,
    p_ticket_id: auftrag ? null : ticket,
    p_beginn: beginn!,
    p_ende: ende!,
    p_monteure: monteure,
    p_fahrzeug_id: d.fahrzeug_id || null,
    p_fest: d.fest,
    p_hinweis: d.hinweis?.trim() || null,
    p_ressource_id: ressource,
    p_farbe: farbe ? (istHex(farbe) ? farbe.toUpperCase() : farbe) : null,
  });
  if (error || !id) {
    return { fehler: ["23514", "23502", "P0002"].includes(error?.code ?? "") ? error!.message : "Der Einsatz konnte nicht gespeichert werden." };
  }
  const warnung = await konfliktWarnung(id as string, beginn!, ende!);
  refresh();
  return { ok: true, id: id as string, warnung };
}

/** Konflikte genau dieses Einsatzes als ein Satz, z. B. „Achtung: Max Muster: Urlaub (beantragt).“ */
async function konfliktWarnung(id: string, beginn: string, ende: string) {
  const { supabase } = await pruefeSitzung();
  const [{ data }, { data: einstellung }] = await Promise.all([
    supabase.rpc("einsatz_konflikte", { p_von: beginn, p_bis: ende }),
    supabase.from("einstellung").select("bundesland").maybeSingle(),
  ]);
  const eigene = ((data as Konflikt[] | null) ?? []).filter((k) => k.einsatz_id === id);
  // Feiertage im Zeitraum (Ortszeit Berlin) gelten ebenfalls als Konflikt (CLAUDE.md „Konfliktwarnung“)
  for (const f of feiertageImZeitraum(utcNachBerlinLokal(beginn).slice(0, 10), utcNachBerlinLokal(ende).slice(0, 10), einstellung?.bundesland ?? "NI")) {
    eigene.push({ einsatz_id: id, mitarbeiter_id: null, art: "feiertag", detail: `${f.name} (${f.datum.split("-").reverse().join(".")})` });
  }
  if (!eigene.length) return undefined;
  const ids = [...new Set(eigene.map((k) => k.mitarbeiter_id).filter((x): x is string => !!x))];
  const { data: namen } = ids.length ? await supabase.from("mitarbeiter").select("id, name").in("id", ids) : { data: [] };
  const name = new Map((namen ?? []).map((m) => [m.id, m.name]));
  const texte = [...new Set(eigene.map((k) => (k.mitarbeiter_id ? `${name.get(k.mitarbeiter_id) ?? "Monteur"}: ${konfliktText(k)}` : konfliktText(k))))];
  return `Achtung, Konflikt: ${texte.join("; ")}.`;
}

export async function einsatzLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("einsatz_loeschen", { p_id: id });
  if (error) return { fehler: "Der Einsatz konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}

export type AuftragTreffer = { id: string; nummer: string; titel: string; kunde: string; phase?: string };

/** Auftragssuche (Einsatz- und Zeit-Dialog): Nummer, Titel, Objekt oder Kunde; abgeschlossene nur auf Wunsch */
export async function auftraegeSuchen(q: string, auchAbgeschlossene = false): Promise<AuftragTreffer[]> {
  const { supabase } = await pruefeSitzung();
  const s = suchbegriff(q);
  if (s.length < 2) return [];
  const { data: kunden } = await supabase.from("kunde").select("id").ilike("name", `%${s}%`).limit(50);
  const bedingungen = ["nummer", "titel", "objekt"].map((f) => `${f}.ilike.%${s}%`);
  if (kunden?.length) bedingungen.push(`kunde_id.in.(${kunden.map((k) => k.id).join(",")})`);
  let a = supabase.from("auftrag").select("id, nummer, titel, phase, kunde:kunde_id(name)");
  if (!auchAbgeschlossene) a = a.neq("phase", "abgeschlossen");
  const { data } = await a
    .or(bedingungen.join(","))
    .order("nummer", { ascending: false })
    .limit(8)
    .returns<{ id: string; nummer: string; titel: string; phase: string; kunde: { name: string } | null }[]>();
  return (data ?? []).map((a) => ({ id: a.id, nummer: a.nummer, titel: a.titel, kunde: a.kunde?.name ?? "", phase: a.phase }));
}

/** Ticketsuche im Einsatz-Dialog des Service-Plans: Nummer, Thema, Objekt oder Kunde; nur offene Tickets */
export async function ticketsSuchen(q: string): Promise<AuftragTreffer[]> {
  const { supabase } = await pruefeSitzung();
  const s = suchbegriff(q);
  if (s.length < 2) return [];
  const { data: kunden } = await supabase.from("kunde").select("id").ilike("name", `%${s}%`).limit(50);
  const bedingungen = ["nummer", "thema", "objekt"].map((f) => `${f}.ilike.%${s}%`);
  if (kunden?.length) bedingungen.push(`kunde_id.in.(${kunden.map((k) => k.id).join(",")})`);
  const { data } = await supabase
    .from("service_ticket")
    .select("id, nummer, thema, kunde:kunde_id(name)")
    .in("status", ["neu", "eingeplant", "in_arbeit"])
    .or(bedingungen.join(","))
    .order("nummer", { ascending: false })
    .limit(8)
    .returns<{ id: string; nummer: string; thema: string; kunde: { name: string } | null }[]>();
  return (data ?? []).map((x) => ({ id: x.id, nummer: x.nummer, titel: x.thema, kunde: x.kunde?.name ?? "" }));
}

/** Monteur anlegen oder umbenennen (direkt in der Plantafel) */
export async function monteurSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const kuerzel = String(fd.get("kuerzel") ?? "").trim().toUpperCase();
  const felder: Record<string, string> = {};
  if (!name) felder.name = "Bitte einen Namen eingeben.";
  if (!/^[A-ZÄÖÜ]{1,4}$/.test(kuerzel)) felder.kuerzel = "1 bis 4 Buchstaben, z. B. MM.";
  if (Object.keys(felder).length) return { fehler: "Bitte die markierten Felder prüfen.", felder };
  const { error } = id
    ? await supabase.from("mitarbeiter").update({ name, kuerzel }).eq("id", id)
    : await supabase.from("mitarbeiter").insert({ name, kuerzel, ist_monteur: true });
  if (error) {
    return error.code === "23505"
      ? { fehler: "Dieses Kürzel ist schon vergeben.", felder: { kuerzel: "Schon vergeben" } }
      : { fehler: "Der Monteur konnte nicht gespeichert werden." };
  }
  refresh();
  return { ok: true };
}

/** Monteur deaktivieren: verschwindet aus der Tafel, geplante Einsätze bleiben erhalten */
export async function monteurDeaktivieren(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("mitarbeiter").update({ aktiv: false }).eq("id", id);
  if (error) return { fehler: "Der Monteur konnte nicht deaktiviert werden." };
  refresh();
  return { ok: true };
}
