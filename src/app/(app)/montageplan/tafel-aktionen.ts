"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { pipelineAblage, STUFEN, type PipelineStufe } from "@/lib/plantafel-logik";
import type { Ergebnis } from "./aktionen";

/*
  Server-Aktionen der Plantafel neben dem Einsatz selbst: Sammelfreigabe, Kolonnen, weitere Ressourcen, Reihenfolge
  der Zeilen und Gruppen, Auftrags-Pipeline. Rechte prüft die Datenbank (RLS, Funktionen mit security invoker).
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const STUFE_TEXT = Object.fromEntries(STUFEN) as Record<PipelineStufe, string>;
const nurIds = (ids: unknown) => (Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && UUID.test(x)) : []);
const u = (x: string | null | undefined) => (x && UUID.test(x) ? x : null);

/** Mehrere vorgeplante Einsätze auf einmal freigeben (fest einplanen) */
export async function einsaetzeFreigeben(ids: string[]): Promise<Ergebnis & { anzahl?: number }> {
  const { supabase } = await pruefeSitzung();
  const liste = nurIds(ids);
  if (!liste.length) return { fehler: "Bitte mindestens einen Einsatz auswählen." };
  const { data, error } = await supabase.rpc("einsatz_freigeben", { p_ids: liste });
  if (error) return { fehler: "Die Einsätze konnten nicht freigegeben werden." };
  refresh();
  return { ok: true, anzahl: Number(data ?? 0) };
}

/** Kolonne anlegen oder ändern (Name, Stammfahrzeug, Mitglieder in Reihenfolge) */
export async function kolonneSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { fehler: "Bitte die markierten Felder prüfen.", felder: { name: "Bitte einen Namen eingeben." } };
  const { error } = await supabase.rpc("kolonne_speichern", {
    p_id: u(String(fd.get("id") ?? "")),
    p_name: name,
    p_stammfahrzeug_id: u(String(fd.get("stammfahrzeug_id") ?? "")),
    p_mitglieder: nurIds(fd.getAll("mitglieder")),
  });
  if (error) return { fehler: error.code === "23514" ? error.message : "Die Kolonne konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

export async function kolonneLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  if (!u(id)) return { fehler: "Kolonne nicht gefunden." };
  const { error } = await supabase.rpc("kolonne_loeschen", { p_id: id });
  if (error) return { fehler: "Die Kolonne konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}

/**
 * Monteur in eine andere Kolonne verschieben, in eine weitere duplizieren (kopieren), aus der Kolonne entfernen
 * (nach = null) oder innerhalb sortieren (vor). Geplante Einsätze behalten ihr Team.
 */
export async function kolonneMonteur(mitarbeiter: string, von: string | null, nach: string | null, kopieren: boolean, vor: string | null): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  if (!u(mitarbeiter)) return { fehler: "Monteur nicht gefunden." };
  const { error } = await supabase.rpc("kolonne_monteur", { p_mitarbeiter: mitarbeiter, p_von: u(von), p_nach: u(nach), p_kopieren: kopieren, p_vor: u(vor) });
  if (error) return { fehler: ["23505", "23514", "P0002"].includes(error.code) ? error.message : "Die Kolonne konnte nicht geändert werden." };
  refresh();
  return { ok: true };
}

/** Reihenfolge der Gruppen (Kolonnen, „Ohne Kolonne“, „Weitere Ressourcen“), gilt für alle Benutzer und beide Pläne */
export async function gruppenReihenfolge(gruppen: string[]): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const liste = (Array.isArray(gruppen) ? gruppen : []).filter((g) => g === "solo" || g === "res" || /^kolonne:[0-9a-f-]{36}$/i.test(g));
  const { error } = await supabase.from("einstellung").update({ plantafel_gruppen: liste }).eq("einzig", true);
  if (error) return { fehler: "Die Reihenfolge konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

/** Reihenfolge von Zeilen: Monteure ohne Kolonne bzw. weitere Ressourcen */
export async function zeilenReihenfolge(tabelle: "mitarbeiter" | "ressource", ids: string[]): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  if (tabelle !== "mitarbeiter" && tabelle !== "ressource") return { fehler: "Unbekannte Zeilen." };
  for (const [i, id] of nurIds(ids).entries()) {
    const { error } = await supabase.from(tabelle).update({ reihenfolge: i + 1 }).eq("id", id);
    if (error) return { fehler: "Die Reihenfolge konnte nicht gespeichert werden." };
  }
  refresh();
  return { ok: true };
}

/** Weitere Ressource (Zeile wie Selbstabholer, Lager, Subunternehmer) anlegen oder umbenennen */
export async function ressourceSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = u(String(fd.get("id") ?? ""));
  const name = String(fd.get("name") ?? "").trim();
  const notiz = String(fd.get("notiz") ?? "").trim() || null;
  if (!name) return { fehler: "Bitte die markierten Felder prüfen.", felder: { name: "Bitte eine Bezeichnung eingeben." } };
  let fehler = false;
  if (id) fehler = !!(await supabase.from("ressource").update({ name, notiz }).eq("id", id)).error;
  else {
    const { data: letzte } = await supabase.from("ressource").select("reihenfolge").order("reihenfolge", { ascending: false }).limit(1).maybeSingle();
    fehler = !!(await supabase.from("ressource").insert({ name, notiz, reihenfolge: (letzte?.reihenfolge ?? 0) + 1 })).error;
  }
  if (fehler) return { fehler: "Die Zeile konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

export async function ressourceLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  if (!u(id)) return { fehler: "Zeile nicht gefunden." };
  const { error } = await supabase.rpc("ressource_loeschen", { p_id: id });
  if (error) return { fehler: error.code === "23514" ? error.message : "Die Zeile konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}

/** Stand eines Auftrags für die Pipeline (Warten auf Kunde, bezahlte Abschläge, Stufen-Daten) */
async function pipelineStand(auftragId: string) {
  const { supabase } = await pruefeSitzung();
  const [{ data: a }, { data: ab }] = await Promise.all([
    supabase.from("auftrag").select("warten_auf_kunde, liefertermin, stufe_lieferung_datum, stufe_abschlag_datum, stufe_warten_datum").eq("id", auftragId).maybeSingle(),
    supabase.from("beleg").select("id").eq("auftrag_id", auftragId).eq("art", "abschlagsrechnung").eq("status", "bezahlt"),
  ]);
  return a ? { ...a, abschlaege_bezahlt: ab?.length ?? 0 } : null;
}

/** Auftrag in der Pipeline auf eine Stufe bzw. einen Tag ziehen: Datum der Stufe, „Warten auf Kunde“ setzen oder lösen */
export async function pipelineSetzen(auftragId: string, zielStufe: PipelineStufe, datum: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  if (!u(auftragId) || !DATUM.test(datum) || !STUFE_TEXT[zielStufe]) return { fehler: "Ungültige Angaben." };
  const stand = await pipelineStand(auftragId);
  if (!stand) return { fehler: "Auftrag nicht gefunden." };
  const z = pipelineAblage(stand, zielStufe, datum);
  const { error } = await supabase.from("auftrag").update({ warten_auf_kunde: z.warten_auf_kunde, [z.feld]: z.datum }).eq("id", auftragId);
  if (error) return { fehler: "Der Auftrag konnte nicht geändert werden." };
  refresh();
  return zielStufe === "abschlag" && z.stufe !== "abschlag"
    ? { ok: true, warnung: `Der Auftrag steht in „${STUFE_TEXT[z.stufe]}“: „Abschlag bezahlt“ füllt sich erst mit der Zahlung.` }
    : { ok: true };
}

/**
 * Einsatz zurück in eine Planungszeile ziehen: Termin herausnehmen (Einsatz als gelöscht markieren). Hat der Auftrag
 * bzw. das Ticket danach keinen Einsatz mehr, steht er am Ablagetag in der Pipeline bzw. in „Terminierbar“.
 */
export async function einsatzZurueck(einsatzId: string, zeile: string, datum: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  if (!u(einsatzId) || !DATUM.test(datum)) return { fehler: "Ungültige Angaben." };
  const { data: e } = await supabase.from("einsatz").select("auftrag_id, ticket_id").eq("id", einsatzId).maybeSingle();
  if (!e) return { fehler: "Einsatz nicht gefunden." };
  const { error } = await supabase.rpc("einsatz_loeschen", { p_id: einsatzId });
  if (error) return { fehler: "Der Termin konnte nicht entfernt werden." };
  const spalte = e.auftrag_id ? "auftrag_id" : "ticket_id";
  const { count } = await supabase.from("einsatz").select("id", { count: "exact", head: true }).eq(spalte, (e.auftrag_id ?? e.ticket_id) as string);
  if (count) {
    refresh();
    return { ok: true, warnung: "Einsatz entfernt; die weiteren Einsätze bleiben geplant." };
  }
  if (e.ticket_id) {
    const { error: f } = await supabase.from("service_ticket").update({ vorab_datum: datum }).eq("id", e.ticket_id);
    refresh();
    return f ? { fehler: "Der Tag in „Terminierbar“ konnte nicht gesetzt werden." } : { ok: true };
  }
  const stufe = (zeile in STUFE_TEXT ? zeile : "lieferung") as PipelineStufe;
  return pipelineSetzen(e.auftrag_id as string, stufe, datum);
}
