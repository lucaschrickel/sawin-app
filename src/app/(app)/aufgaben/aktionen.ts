"use server";

import { refresh } from "next/cache";
import { AUFGABE_STATUS, PRIORITAET, type Bezug } from "@/lib/aufgaben-status";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { suchbegriff } from "@/lib/kunden";

export type Ergebnis = { fehler?: string; ok?: boolean; felder?: Record<string, string> };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aufgabe anlegen oder ändern. Bezug höchstens einer (Kunde, Anfrage oder Auftrag); die Datenbank prüft das auch. */
export async function aufgabeSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id") || null;
  const bezugArt = text(fd, "bezug_art");
  const bezugId = text(fd, "bezug_id");
  const daten = {
    titel: text(fd, "titel"),
    zustaendig_id: text(fd, "zustaendig_id") || null,
    faellig: text(fd, "faellig") || null,
    prioritaet: text(fd, "prioritaet") || "normal",
    status: text(fd, "status") || "offen",
    notiz: text(fd, "notiz") || null,
    kunde_id: bezugArt === "kunde" ? bezugId : null,
    anfrage_id: bezugArt === "anfrage" ? bezugId : null,
    auftrag_id: bezugArt === "auftrag" ? bezugId : null,
  };
  const felder: Record<string, string> = {};
  if (!daten.titel) felder.titel = "Bitte beschreiben, was zu tun ist.";
  if (daten.zustaendig_id && !UUID.test(daten.zustaendig_id)) felder.zustaendig_id = "Bitte aus der Liste wählen.";
  if (daten.faellig && !/^\d{4}-\d{2}-\d{2}$/.test(daten.faellig)) felder.faellig = "Ungültiges Datum.";
  if (!PRIORITAET.includes(daten.prioritaet as (typeof PRIORITAET)[number])) felder.prioritaet = "Ungültig.";
  if (!AUFGABE_STATUS.includes(daten.status as (typeof AUFGABE_STATUS)[number])) felder.status = "Ungültig.";
  if (bezugArt && !UUID.test(bezugId)) felder.bezug = "Ungültiger Bezug.";
  if (Object.keys(felder).length) return { fehler: "Bitte die markierten Felder prüfen.", felder };

  const { error } = id ? await supabase.from("aufgabe").update(daten).eq("id", id) : await supabase.from("aufgabe").insert(daten);
  if (error) return { fehler: "Die Aufgabe konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

/** Abhaken bzw. wieder öffnen */
export async function erledigtSetzen(id: string, erledigt: boolean): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("aufgabe").update({ status: erledigt ? "erledigt" : "offen" }).eq("id", id);
  if (error) return { fehler: "Die Aufgabe konnte nicht geändert werden." };
  refresh();
  return { ok: true };
}

export async function aufgabeLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "aufgabe", p_id: id });
  if (error) return { fehler: "Die Aufgabe konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}

/** Bezug suchen: Kunden (Name), Anfragen (Titel), Aufträge (Nummer, Titel) – je höchstens fünf */
export async function bezugSuchen(q: string): Promise<Bezug[]> {
  const { supabase } = await pruefeSitzung();
  const s = suchbegriff(q);
  if (s.length < 2) return [];
  const [k, a, au] = await Promise.all([
    supabase.from("kunde").select("id, name").or(`name.ilike.%${s}%,nummer.ilike.%${s}%`).order("name").limit(5),
    supabase.from("anfrage").select("id, titel").ilike("titel", `%${s}%`).order("eingang", { ascending: false }).limit(5),
    supabase.from("auftrag").select("id, nummer, titel").or(`nummer.ilike.%${s}%,titel.ilike.%${s}%`).order("created_at", { ascending: false }).limit(5),
  ]);
  return [
    ...(k.data ?? []).map((x) => ({ art: "kunde" as const, id: x.id, text: x.name })),
    ...(a.data ?? []).map((x) => ({ art: "anfrage" as const, id: x.id, text: x.titel })),
    ...(au.data ?? []).map((x) => ({ art: "auftrag" as const, id: x.id, text: `${x.nummer} · ${x.titel}` })),
  ];
}
