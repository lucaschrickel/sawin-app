"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomer } from "@/customers";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { istAuftragPhase, MONTAGESTATUS } from "@/lib/status";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; felder?: Record<string, string> };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stammdaten des Auftrags (Dialog „Bearbeiten“) */
export async function auftragSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const c = getCustomer();
  const id = text(fd, "id");
  const daten = {
    titel: text(fd, "titel"),
    objekt: text(fd, "objekt") || null,
    montagestatus: text(fd, "montagestatus"),
    herkunft: text(fd, "herkunft") || null,
    zustaendig_id: text(fd, "zustaendig_id") || null,
    produkte: fd.getAll("produkte").map(String).filter((p) => c.produkte.includes(p)),
    bemerkung: text(fd, "bemerkung") || null,
  };
  const felder: Record<string, string> = {};
  if (!UUID.test(id)) return { fehler: "Auftrag nicht gefunden." };
  if (!daten.titel) felder.titel = "Bitte einen Titel eingeben.";
  if (!(MONTAGESTATUS as readonly string[]).includes(daten.montagestatus)) felder.montagestatus = "Bitte aus der Liste wählen.";
  if (daten.herkunft && !c.herkunft.includes(daten.herkunft)) felder.herkunft = "Bitte aus der Liste wählen.";
  if (daten.zustaendig_id && !UUID.test(daten.zustaendig_id)) felder.zustaendig_id = "Bitte aus der Liste wählen.";
  if (Object.keys(felder).length) return { fehler: "Bitte die markierten Felder prüfen.", felder };

  const { error } = await supabase.from("auftrag").update(daten).eq("id", id);
  if (error) return { fehler: "Der Auftrag konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

/** Phase ändern (Auswahl, Phasenleiste oder Ziehen in der Pipeline) */
export async function phaseSetzen(id: string, phase: string): Promise<Ergebnis> {
  if (!istAuftragPhase(phase) || !UUID.test(id)) return { fehler: "Ungültige Phase." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("auftrag").update({ phase }).eq("id", id);
  if (error) return { fehler: "Die Phase konnte nicht geändert werden." };
  refresh();
  return { ok: true };
}

/** Bestellung & Lieferung: Liefertermin, „Noch nicht bestellt“, „Warten auf Kunde“ */
export async function lieferungSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const liefertermin = text(fd, "liefertermin") || null;
  if (!UUID.test(id)) return { fehler: "Auftrag nicht gefunden." };
  if (liefertermin && !DATUM.test(liefertermin)) return { fehler: "Ungültiger Liefertermin.", felder: { liefertermin: "Ungültiges Datum" } };
  const { error } = await supabase
    .from("auftrag")
    .update({ liefertermin, noch_nicht_bestellt: text(fd, "noch_nicht_bestellt") || null, warten_auf_kunde: fd.get("warten_auf_kunde") === "on" })
    .eq("id", id);
  if (error) return { fehler: "Die Angaben konnten nicht gespeichert werden." };
  refresh();
  return { ok: true, hinweis: "Gespeichert." };
}

/** Prüfhinweis nach Prüfung entfernen (steht danach in der Historie) */
export async function pruefhinweisEntfernen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("auftrag").update({ pruefhinweis: null }).eq("id", id);
  if (error) return { fehler: "Der Hinweis konnte nicht entfernt werden." };
  refresh();
  return { ok: true };
}

export async function auftragLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "auftrag", p_id: id });
  if (error) return { fehler: error.code === "23503" ? error.message : "Der Auftrag konnte nicht gelöscht werden." };
  redirect("/auftraege");
}
