"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { BELEGARTEN } from "@/lib/belege-status";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; felder?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const arten = (fd: FormData, n: string) => fd.getAll(n).map(String).filter((a) => (BELEGARTEN as readonly string[]).includes(a));
const zahlOderLeer = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

/** Standard-Gültigkeit neuer Angebote in Tagen */
export async function gueltigkeitSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const tage = Number(text(fd, "tage"));
  if (!Number.isInteger(tage) || tage < 1 || tage > 365) return { fehler: "Bitte ganze Tage zwischen 1 und 365 eingeben." };
  const { error } = await supabase.from("einstellung").update({ angebot_gueltig_tage: tage }).eq("einzig", true);
  if (error) return { fehler: "Die Gültigkeit konnte nicht gespeichert werden." };
  refresh();
  return { ok: true, hinweis: "Gespeichert." };
}

/** Zahlungsbedingung anlegen oder ändern; „Standard für“ gilt je Belegart nur für eine Bedingung */
export async function zahlungsbedingungSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const daten = {
    name: text(fd, "name").slice(0, 120),
    text: String(fd.get("text") ?? "").trim().slice(0, 4000),
    zahlungsziel_tage: Number(text(fd, "zahlungsziel_tage") || "0"),
    skontoziel_tage: zahlOderLeer(text(fd, "skontoziel_tage")),
    skonto_prozent: zahlOderLeer(text(fd, "skonto_prozent")),
    belegarten: arten(fd, "belegarten"),
    standard_fuer: arten(fd, "standard_fuer"),
  };
  const felder: Record<string, string> = {};
  if (!daten.name) felder.name = "Bitte einen Namen eingeben.";
  if (!daten.text) felder.text = "Bitte den Text eingeben.";
  if (!Number.isInteger(daten.zahlungsziel_tage) || daten.zahlungsziel_tage < 0 || daten.zahlungsziel_tage > 365) felder.zahlungsziel_tage = "0 bis 365 Tage.";
  if (daten.skontoziel_tage !== null && !(Number.isInteger(daten.skontoziel_tage) && daten.skontoziel_tage >= 0 && daten.skontoziel_tage <= daten.zahlungsziel_tage)) felder.skontoziel_tage = "Ganze Tage, höchstens das Zahlungsziel.";
  if (daten.skonto_prozent !== null && !(daten.skonto_prozent >= 0 && daten.skonto_prozent < 100)) felder.skonto_prozent = "0 bis unter 100 %.";
  if ((daten.skonto_prozent === null) !== (daten.skontoziel_tage === null)) felder.skonto_prozent = "Skonto und Skontoziel gehören zusammen.";
  if (id && !UUID.test(id)) return { fehler: "Zahlungsbedingung nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };
  daten.standard_fuer = daten.standard_fuer.filter((a) => !daten.belegarten.length || daten.belegarten.includes(a));

  const { data, error } = id
    ? await supabase.from("zahlungsbedingung").update(daten).eq("id", id).select("id").single()
    : await supabase.from("zahlungsbedingung").insert(daten).select("id").single();
  if (error || !data) return { fehler: "Die Zahlungsbedingung konnte nicht gespeichert werden." };
  // Standard je Belegart nur einmal: bei den anderen Bedingungen entfernen
  if (daten.standard_fuer.length) {
    const { data: andere } = await supabase.from("zahlungsbedingung").select("id, standard_fuer").neq("id", data.id).overlaps("standard_fuer", daten.standard_fuer);
    for (const z of andere ?? [])
      await supabase.from("zahlungsbedingung").update({ standard_fuer: (z.standard_fuer as string[]).filter((a) => !daten.standard_fuer.includes(a)) }).eq("id", z.id);
  }
  refresh();
  return { ok: true };
}

/** Zahlungsbedingung löschen (Markierung). Belege behalten ihre Kopie des Textes. */
export async function zahlungsbedingungLoeschen(id: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Zahlungsbedingung nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "zahlungsbedingung", p_id: id });
  if (error) return { fehler: "Die Zahlungsbedingung konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}
