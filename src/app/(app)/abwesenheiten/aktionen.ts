"use server";

import { refresh } from "next/cache";
import { eingeplantIm } from "@/lib/abwesenheiten";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ABWESENHEIT_ARTEN } from "@/lib/team";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; warnung?: string; felder?: Record<string, string> };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Abwesenheit eintragen. Krankmeldungen gelten sofort, „Direkt genehmigen“ nur für Admins (prüft auch die Datenbank). */
export async function abwesenheitEintragen(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase, benutzer } = await pruefeSitzung();
  const daten = {
    mitarbeiter_id: text(fd, "mitarbeiter_id"),
    art: text(fd, "art"),
    von: text(fd, "von"),
    bis: text(fd, "bis"),
    notiz: text(fd, "notiz") || null,
    status: fd.get("direkt") === "on" && benutzer.admin ? "genehmigt" : "beantragt",
  };
  const felder: Record<string, string> = {};
  if (!UUID.test(daten.mitarbeiter_id)) felder.mitarbeiter_id = "Bitte einen Mitarbeiter wählen.";
  if (!(ABWESENHEIT_ARTEN as readonly string[]).includes(daten.art)) felder.art = "Bitte eine Art wählen.";
  if (!DATUM.test(daten.von)) felder.von = "Bitte ein Datum wählen.";
  if (!DATUM.test(daten.bis)) felder.bis = "Bitte ein Datum wählen.";
  if (!felder.von && !felder.bis && daten.bis < daten.von) felder.bis = "„Bis“ liegt vor „Von“.";
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };

  const { data, error } = await supabase.from("abwesenheit").insert(daten).select("status").single();
  if (error) return { fehler: error.code === "42501" ? error.message : "Die Abwesenheit konnte nicht gespeichert werden." };
  const eingeplant = await eingeplantIm(daten.mitarbeiter_id, daten.von, daten.bis);
  refresh();
  return {
    ok: true,
    hinweis: data.status === "genehmigt" ? "Abwesenheit eingetragen und genehmigt." : "Antrag gestellt, wartet auf die Genehmigung durch einen Admin.",
    warnung: eingeplant.length
      ? `Achtung: Im Zeitraum eingeplant bei ${[...new Set(eingeplant.map((e) => (e.auftrag ? `${e.auftrag.nummer} ${e.auftrag.kunde?.name ?? ""}`.trim() : "einem Einsatz")))].join(", ")}.`
      : undefined,
  };
}

/** Genehmigen oder ablehnen: nur Admins (RLS-Trigger app.abwesenheit_status) */
export async function statusSetzen(id: string, status: "genehmigt" | "abgelehnt"): Promise<Ergebnis> {
  if (!UUID.test(id) || (status !== "genehmigt" && status !== "abgelehnt")) return { fehler: "Ungültige Angabe." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("abwesenheit").update({ status }).eq("id", id);
  if (error) return { fehler: error.code === "42501" ? error.message : "Der Status konnte nicht geändert werden." };
  refresh();
  return { ok: true };
}

/** Löschen als Markierung; entschiedene Abwesenheiten (außer Krankmeldungen) nur durch Admins */
export async function abwesenheitLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "abwesenheit", p_id: id });
  if (error) return { fehler: error.code === "42501" ? error.message : "Die Abwesenheit konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}
