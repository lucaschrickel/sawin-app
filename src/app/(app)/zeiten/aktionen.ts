"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { stunden, ZEIT_ART_MIT_BEZUG, ZEIT_ARTEN, type ZeitArt } from "@/lib/team";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; felder?: Record<string, string> };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Zeit eintragen oder ändern (nur offene Buchungen; freigegebene sperrt die Datenbank) */
export async function zeitSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const art = text(fd, "art") as ZeitArt;
  const pause = text(fd, "pause_min");
  const daten = {
    mitarbeiter_id: text(fd, "mitarbeiter_id"),
    auftrag_id: text(fd, "auftrag_id") || null,
    datum: text(fd, "datum"),
    beginn: text(fd, "beginn"),
    ende: text(fd, "ende"),
    pause_min: pause ? Number(pause) : 0,
    art,
    taetigkeit: text(fd, "taetigkeit") || null,
  };
  const felder: Record<string, string> = {};
  if (!UUID.test(daten.mitarbeiter_id)) felder.mitarbeiter_id = "Bitte einen Mitarbeiter wählen.";
  if (!DATUM.test(daten.datum)) felder.datum = "Bitte ein Datum wählen.";
  if (!ZEIT.test(daten.beginn)) felder.beginn = "Uhrzeit HH:MM.";
  if (!ZEIT.test(daten.ende)) felder.ende = "Uhrzeit HH:MM.";
  if (!(ZEIT_ARTEN as readonly string[]).includes(art)) felder.art = "Bitte eine Art wählen.";
  if (daten.auftrag_id && !UUID.test(daten.auftrag_id)) felder.auftrag = "Bitte einen Auftrag wählen.";
  if (ZEIT_ART_MIT_BEZUG.includes(art) && !daten.auftrag_id) felder.auftrag = "Bei Montage, Aufmaß und Service bitte einen Auftrag wählen.";
  if (!Number.isInteger(daten.pause_min) || daten.pause_min < 0) felder.pause_min = "Pause in ganzen Minuten.";
  if (!felder.beginn && !felder.ende && daten.ende <= daten.beginn) felder.ende = "Das Ende muss nach dem Beginn liegen.";
  if (!felder.ende && !felder.pause_min && stunden(daten.beginn, daten.ende, daten.pause_min) <= 0) felder.pause_min = "Die Pause ist länger als die Arbeitszeit.";
  if (id && !UUID.test(id)) return { fehler: "Buchung nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };

  const { error } = id ? await supabase.from("zeitbuchung").update(daten).eq("id", id) : await supabase.from("zeitbuchung").insert(daten);
  if (error) return { fehler: ["23514", "42501"].includes(error.code) && !error.message.includes("check constraint") ? error.message : "Die Zeit konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

/** Freigeben oder Freigabe zurücknehmen, einzeln oder gesammelt */
export async function freigabeSetzen(ids: string[], freigabe: "offen" | "freigegeben"): Promise<Ergebnis> {
  const liste = ids.filter((x) => UUID.test(x));
  if (!liste.length || (freigabe !== "offen" && freigabe !== "freigegeben")) return { fehler: "Keine Buchungen gewählt." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("zeitbuchung").update({ freigabe }).in("id", liste).neq("freigabe", freigabe);
  if (error) return { fehler: "Die Freigabe konnte nicht geändert werden." };
  refresh();
  return { ok: true, hinweis: freigabe === "freigegeben" ? `${liste.length === 1 ? "Buchung" : `${liste.length} Buchungen`} freigegeben.` : "Freigabe zurückgenommen." };
}

export async function zeitLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "zeitbuchung", p_id: id });
  if (error) return { fehler: error.code === "42501" ? error.message : "Die Buchung konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}
