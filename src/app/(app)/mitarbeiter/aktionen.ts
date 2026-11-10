"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { pruefeSitzung } from "@/lib/auth/sitzung";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; felder?: Record<string, string> };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mitarbeiter anlegen oder ändern */
export async function mitarbeiterSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const anspruch = text(fd, "urlaubsanspruch_tage");
  const daten = {
    name: text(fd, "name"),
    kuerzel: text(fd, "kuerzel").toUpperCase(),
    rolle: text(fd, "rolle") || null,
    telefon: text(fd, "telefon") || null,
    ist_monteur: fd.get("ist_monteur") === "on",
    urlaubsanspruch_tage: anspruch ? Number(anspruch) : null,
  };
  const felder: Record<string, string> = {};
  if (!daten.name) felder.name = "Bitte einen Namen eingeben.";
  if (!/^[A-ZÄÖÜ]{1,4}$/.test(daten.kuerzel)) felder.kuerzel = "1 bis 4 Buchstaben, z. B. MK.";
  if (daten.urlaubsanspruch_tage !== null && !(Number.isInteger(daten.urlaubsanspruch_tage) && daten.urlaubsanspruch_tage >= 0 && daten.urlaubsanspruch_tage <= 366)) {
    felder.urlaubsanspruch_tage = "Ganze Tage, leer = Standard.";
  }
  if (id && !UUID.test(id)) return { fehler: "Mitarbeiter nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: "Bitte die markierten Felder prüfen.", felder };

  const ergebnis = id
    ? await supabase.from("mitarbeiter").update(daten).eq("id", id).select("id").single()
    : await supabase.from("mitarbeiter").insert(daten).select("id").single();
  if (ergebnis.error) {
    if (ergebnis.error.code === "23505") return { fehler: "Dieses Kürzel ist schon vergeben.", felder: { kuerzel: "Schon vergeben" } };
    return { fehler: "Der Mitarbeiter konnte nicht gespeichert werden." };
  }
  if (!id) redirect(`/mitarbeiter/${ergebnis.data.id}`);
  refresh();
  return { ok: true };
}

/** Aktivieren oder deaktivieren (inaktive verschwinden aus Plantafel und Auswahllisten) */
export async function aktivSetzen(id: string, aktiv: boolean): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("mitarbeiter").update({ aktiv }).eq("id", id);
  if (error) return { fehler: "Der Mitarbeiter konnte nicht geändert werden." };
  refresh();
  return { ok: true };
}

export async function mitarbeiterLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "mitarbeiter", p_id: id });
  if (error) return { fehler: error.code === "23503" ? error.message : "Der Mitarbeiter konnte nicht gelöscht werden." };
  redirect("/mitarbeiter");
}
