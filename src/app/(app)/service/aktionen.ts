"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ABRECHNUNG, TICKET_ARTEN, TICKET_PRIO, TICKET_STATUS_HAND } from "@/lib/status";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; felder?: Record<string, string>; id?: string };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const liste = (l: readonly string[], v: string) => l.includes(v);

/** Ticket anlegen oder ändern */
export async function ticketSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const daten = {
    kunde_id: text(fd, "kunde_id"),
    auftrag_id: text(fd, "auftrag_id") || null,
    thema: text(fd, "thema"),
    art: text(fd, "art"),
    abrechnung: text(fd, "abrechnung"),
    prioritaet: text(fd, "prioritaet"),
    problem: text(fd, "problem") || null,
    wunschtermin: text(fd, "wunschtermin") || null,
    zustaendig_id: text(fd, "zustaendig_id") || null,
    objekt: text(fd, "objekt") || null,
  };
  const felder: Record<string, string> = {};
  if (!UUID.test(daten.kunde_id)) felder.kunde_id = "Bitte einen Kunden wählen.";
  if (daten.auftrag_id && !UUID.test(daten.auftrag_id)) felder.auftrag = "Bitte einen Auftrag aus der Liste wählen.";
  if (!daten.thema) felder.thema = "Bitte ein Thema eingeben.";
  if (!liste(TICKET_ARTEN, daten.art)) felder.art = "Bitte eine Art wählen.";
  if (!liste(ABRECHNUNG, daten.abrechnung)) felder.abrechnung = "Bitte die Abrechnung wählen.";
  if (!liste(TICKET_PRIO, daten.prioritaet)) felder.prioritaet = "Bitte eine Priorität wählen.";
  if (daten.wunschtermin && !DATUM.test(daten.wunschtermin)) felder.wunschtermin = "Ungültiges Datum.";
  if (daten.zustaendig_id && !UUID.test(daten.zustaendig_id)) felder.zustaendig_id = "Bitte aus der Liste wählen.";
  if (id && !UUID.test(id)) return { fehler: "Ticket nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };

  const ergebnis = id
    ? await supabase.from("service_ticket").update(daten).eq("id", id).select("id").single()
    : await supabase.from("service_ticket").insert(daten).select("id").single();
  if (ergebnis.error) return { fehler: "Das Ticket konnte nicht gespeichert werden." };
  if (!id) redirect(`/service/${ergebnis.data.id}`);
  refresh();
  return { ok: true };
}

/** Status von Hand (Auswahl, Board); „Abgerechnet“ setzt die App mit der Rechnung */
export async function ticketStatusSetzen(id: string, status: string): Promise<Ergebnis> {
  if (!UUID.test(id) || !TICKET_STATUS_HAND.includes(status as never)) {
    return { fehler: status === "abgerechnet" ? "„Abgerechnet“ setzt die App, sobald die Rechnung zum Ticket fertiggestellt ist." : "Ungültiger Status." };
  }
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("service_ticket").update({ status }).eq("id", id);
  if (error) return { fehler: error.code === "42501" ? error.message : "Der Status konnte nicht geändert werden." };
  refresh();
  return { ok: true };
}

export async function ticketLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "service_ticket", p_id: id });
  if (error) return { fehler: error.code === "23503" ? error.message : "Das Ticket konnte nicht gelöscht werden." };
  redirect("/service");
}

/** Reklamation vor dem Abschluss: statt eines Tickets den Auftrag auf „Reklamation“ setzen (CLAUDE.md „Reklamation“) */
export async function auftragAufReklamation(auftragId: string): Promise<Ergebnis> {
  if (!UUID.test(auftragId)) return { fehler: "Auftrag nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("auftrag").update({ phase: "reklamation" }).eq("id", auftragId).neq("phase", "abgeschlossen");
  if (error) return { fehler: "Der Auftrag konnte nicht geändert werden." };
  redirect(`/auftraege/${auftragId}`);
}

/** Tag in der Zeile „Terminierbar“ verschieben (Ziehen im Service-Plan) */
export async function vorabDatumSetzen(id: string, datum: string): Promise<Ergebnis> {
  if (!UUID.test(id) || !DATUM.test(datum)) return { fehler: "Ungültige Angabe." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("service_ticket").update({ vorab_datum: datum }).eq("id", id);
  if (error) return { fehler: "Der Tag konnte nicht geändert werden." };
  refresh();
  return { ok: true };
}

/** Notiz oder Telefonat in der Historie eines Tickets */
export async function ticketNotiz(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const inhalt = text(fd, "text");
  if (!inhalt) return { fehler: "Bitte einen Text eingeben." };
  const { error } = await supabase.from("historie_notiz").insert({ art: text(fd, "art") === "telefonat" ? "telefonat" : "notiz", text: inhalt, ticket_id: text(fd, "ticket_id") });
  if (error) return { fehler: "Die Notiz konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}
