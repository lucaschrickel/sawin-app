"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { berlinNachUtc } from "@/lib/zeit";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; warnung?: string; felder?: Record<string, string> };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Fahrzeug anlegen oder ändern */
export async function fahrzeugSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const km = text(fd, "km_stand").replace(/\./g, "");
  const datum = (n: string) => text(fd, n) || null;
  const daten = {
    kennzeichen: text(fd, "kennzeichen").toUpperCase().replace(/\s+/g, " "),
    typ: text(fd, "typ") || null,
    km_stand: km ? Number(km) : null,
    hinweise: text(fd, "hinweise") || null,
    tuev_am: datum("tuev_am"),
    service_am: datum("service_am"),
    uvv_am: datum("uvv_am"),
  };
  const felder: Record<string, string> = {};
  if (!daten.kennzeichen) felder.kennzeichen = "Bitte das Kennzeichen eingeben.";
  if (daten.km_stand !== null && !(Number.isInteger(daten.km_stand) && daten.km_stand >= 0)) felder.km_stand = "Ganze Kilometer.";
  for (const n of ["tuev_am", "service_am", "uvv_am"] as const) if (daten[n] && !DATUM.test(daten[n]!)) felder[n] = "Ungültiges Datum.";
  if (id && !UUID.test(id)) return { fehler: "Fahrzeug nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: "Bitte die markierten Felder prüfen.", felder };

  const ergebnis = id
    ? await supabase.from("fahrzeug").update(daten).eq("id", id).select("id").single()
    : await supabase.from("fahrzeug").insert(daten).select("id").single();
  if (ergebnis.error) {
    if (ergebnis.error.code === "23505") return { fehler: "Dieses Kennzeichen gibt es schon.", felder: { kennzeichen: "Schon vorhanden" } };
    return { fehler: "Das Fahrzeug konnte nicht gespeichert werden." };
  }
  if (!id) redirect(`/fahrzeuge/${ergebnis.data.id}`);
  refresh();
  return { ok: true };
}

export async function fahrzeugLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "fahrzeug", p_id: id });
  if (error) return { fehler: error.code === "23503" ? error.message : "Das Fahrzeug konnte nicht gelöscht werden." };
  redirect("/fahrzeuge");
}

/** Werkstatttermin eintragen; warnt, wenn das Fahrzeug im Zeitraum eingeplant ist */
export async function werkstattEintragen(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const daten = { fahrzeug_id: text(fd, "fahrzeug_id"), von: text(fd, "von"), bis: text(fd, "bis"), notiz: text(fd, "notiz") || null };
  const felder: Record<string, string> = {};
  if (!UUID.test(daten.fahrzeug_id)) return { fehler: "Fahrzeug nicht gefunden." };
  if (!DATUM.test(daten.von)) felder.von = "Bitte ein Datum wählen.";
  if (!DATUM.test(daten.bis)) felder.bis = "Bitte ein Datum wählen.";
  if (!felder.von && !felder.bis && daten.bis < daten.von) felder.bis = "„Bis“ liegt vor „Von“.";
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };
  const { error } = await supabase.from("fahrzeug_werkstatt").insert(daten);
  if (error) return { fehler: "Der Werkstatttermin konnte nicht gespeichert werden." };
  const bisNaechsterTag = new Date(Date.parse(`${daten.bis}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  const { count } = await supabase
    .from("einsatz")
    .select("id", { count: "exact", head: true })
    .eq("fahrzeug_id", daten.fahrzeug_id)
    .lt("beginn", berlinNachUtc(`${bisNaechsterTag}T00:00`)!)
    .gt("ende", berlinNachUtc(`${daten.von}T00:00`)!);
  refresh();
  return { ok: true, warnung: count ? `Achtung: Das Fahrzeug ist im Zeitraum bei ${count === 1 ? "einem Einsatz" : `${count} Einsätzen`} eingeplant.` : undefined };
}

export async function werkstattLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "fahrzeug_werkstatt", p_id: id });
  if (error) return { fehler: "Der Werkstatttermin konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}
