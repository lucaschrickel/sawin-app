"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";

export type Ergebnis = { fehler?: string; ok?: boolean; felder?: Record<string, string> };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Termin (Beratung, Intern) anlegen oder ändern, mit Mitarbeitern und optionalem Bezug (Kunde, Anfrage oder Auftrag) */
export async function terminSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const art = text(fd, "art");
  const bezugArt = text(fd, "bezug_art");
  const bezugId = text(fd, "bezug_id");
  const d = { titel: text(fd, "titel"), datum: text(fd, "datum"), beginn: text(fd, "beginn"), ende: text(fd, "ende") };
  const mitarbeiter = fd.getAll("mitarbeiter").map(String).filter((m) => UUID.test(m));
  const felder: Record<string, string> = {};
  if (!d.titel) felder.titel = "Bitte einen Titel eingeben.";
  if (art !== "beratung" && art !== "intern") felder.art = "Bitte eine Art wählen.";
  if (!DATUM.test(d.datum)) felder.datum = "Bitte ein Datum wählen.";
  if (!ZEIT.test(d.beginn)) felder.beginn = "Uhrzeit HH:MM.";
  if (!ZEIT.test(d.ende)) felder.ende = "Uhrzeit HH:MM.";
  if (!felder.beginn && !felder.ende && d.ende <= d.beginn) felder.ende = "Das Ende muss nach dem Beginn liegen.";
  if (bezugId && (!UUID.test(bezugId) || !["kunde", "anfrage", "auftrag"].includes(bezugArt))) felder.bezug = "Bitte einen Bezug aus der Liste wählen.";
  if (id && !UUID.test(id)) return { fehler: "Termin nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };

  const { error } = await supabase.rpc("termin_speichern", {
    p_id: id || null,
    p_titel: d.titel,
    p_art: art,
    p_datum: d.datum,
    p_beginn: d.beginn,
    p_ende: d.ende,
    p_mitarbeiter: mitarbeiter,
    p_kunde_id: bezugArt === "kunde" ? bezugId : null,
    p_anfrage_id: bezugArt === "anfrage" ? bezugId : null,
    p_auftrag_id: bezugArt === "auftrag" ? bezugId : null,
    p_ort: text(fd, "ort") || null,
    p_notiz: text(fd, "notiz") || null,
  });
  if (error) return { fehler: "Der Termin konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

export async function terminLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("termin_loeschen", { p_id: id });
  if (error) return { fehler: "Der Termin konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}
