"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { suchbegriff } from "@/lib/kunden";
import { konfliktText, type Konflikt } from "@/lib/montageplan-text";
import { berlinNachUtc } from "@/lib/zeit";

export type Ergebnis = { fehler?: string; ok?: boolean; warnung?: string; felder?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EinsatzDaten = {
  id: string | null;
  auftrag_id: string;
  /** Ortszeit Berlin „YYYY-MM-DDTHH:MM“ */
  beginn: string;
  ende: string;
  monteure: string[];
  /** null = Freigabe-Stand unverändert lassen (Ziehen in der Tafel) */
  fest: boolean | null;
  hinweis: string | null;
};

/** Einsatz anlegen oder ändern (Dialog, Ziehen, Verlängern). Konflikte warnen, blockieren aber nicht. */
export async function einsatzSpeichern(d: EinsatzDaten): Promise<Ergebnis & { id?: string }> {
  const { supabase } = await pruefeSitzung();
  const beginn = berlinNachUtc(d.beginn ?? "");
  const ende = berlinNachUtc(d.ende ?? "");
  const felder: Record<string, string> = {};
  if (!UUID.test(d.auftrag_id ?? "")) felder.auftrag = "Bitte einen Auftrag wählen.";
  if (!beginn) felder.beginn = "Ungültiger Beginn.";
  if (!ende) felder.ende = "Ungültiges Ende.";
  if (beginn && ende && ende <= beginn) felder.ende = "Das Ende muss nach dem Beginn liegen.";
  const monteure = [...new Set((d.monteure ?? []).filter((m) => UUID.test(m)))];
  if (!monteure.length) felder.monteure = "Bitte mindestens einen Monteur wählen.";
  if (d.id && !UUID.test(d.id)) return { fehler: "Einsatz nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };

  const { data: id, error } = await supabase.rpc("einsatz_speichern", {
    p_id: d.id,
    p_auftrag_id: d.auftrag_id,
    p_beginn: beginn!,
    p_ende: ende!,
    p_monteure: monteure,
    p_fest: d.fest,
    p_hinweis: d.hinweis?.trim() || null,
  });
  if (error || !id) {
    return { fehler: ["23514", "23502", "P0002"].includes(error?.code ?? "") ? error!.message : "Der Einsatz konnte nicht gespeichert werden." };
  }
  const warnung = await konfliktWarnung(id as string, beginn!, ende!);
  refresh();
  return { ok: true, id: id as string, warnung };
}

/** Konflikte genau dieses Einsatzes als ein Satz, z. B. „Achtung: Max Muster: Urlaub (beantragt).“ */
async function konfliktWarnung(id: string, beginn: string, ende: string) {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.rpc("einsatz_konflikte", { p_von: beginn, p_bis: ende });
  const eigene = ((data as Konflikt[] | null) ?? []).filter((k) => k.einsatz_id === id);
  if (!eigene.length) return undefined;
  const { data: namen } = await supabase.from("mitarbeiter").select("id, name").in("id", [...new Set(eigene.map((k) => k.mitarbeiter_id))]);
  const name = new Map((namen ?? []).map((m) => [m.id, m.name]));
  const texte = [...new Set(eigene.map((k) => `${name.get(k.mitarbeiter_id) ?? "Monteur"}: ${konfliktText(k)}`))];
  return `Achtung, Konflikt: ${texte.join("; ")}.`;
}

export async function einsatzLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("einsatz_loeschen", { p_id: id });
  if (error) return { fehler: "Der Einsatz konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}

export type AuftragTreffer = { id: string; nummer: string; titel: string; kunde: string };

/** Auftragssuche im Einsatz-Dialog: Nummer, Titel, Objekt oder Kunde; abgeschlossene Aufträge nicht */
export async function auftraegeSuchen(q: string): Promise<AuftragTreffer[]> {
  const { supabase } = await pruefeSitzung();
  const s = suchbegriff(q);
  if (s.length < 2) return [];
  const { data: kunden } = await supabase.from("kunde").select("id").ilike("name", `%${s}%`).limit(50);
  const bedingungen = ["nummer", "titel", "objekt"].map((f) => `${f}.ilike.%${s}%`);
  if (kunden?.length) bedingungen.push(`kunde_id.in.(${kunden.map((k) => k.id).join(",")})`);
  const { data } = await supabase
    .from("auftrag")
    .select("id, nummer, titel, kunde:kunde_id(name)")
    .neq("phase", "abgeschlossen")
    .or(bedingungen.join(","))
    .order("nummer", { ascending: false })
    .limit(8)
    .returns<{ id: string; nummer: string; titel: string; kunde: { name: string } | null }[]>();
  return (data ?? []).map((a) => ({ id: a.id, nummer: a.nummer, titel: a.titel, kunde: a.kunde?.name ?? "" }));
}

/** Monteur anlegen oder umbenennen (direkt in der Plantafel) */
export async function monteurSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const kuerzel = String(fd.get("kuerzel") ?? "").trim().toUpperCase();
  const felder: Record<string, string> = {};
  if (!name) felder.name = "Bitte einen Namen eingeben.";
  if (!/^[A-ZÄÖÜ]{1,4}$/.test(kuerzel)) felder.kuerzel = "1 bis 4 Buchstaben, z. B. MM.";
  if (Object.keys(felder).length) return { fehler: "Bitte die markierten Felder prüfen.", felder };
  const { error } = id
    ? await supabase.from("mitarbeiter").update({ name, kuerzel }).eq("id", id)
    : await supabase.from("mitarbeiter").insert({ name, kuerzel, ist_monteur: true });
  if (error) {
    return error.code === "23505"
      ? { fehler: "Dieses Kürzel ist schon vergeben.", felder: { kuerzel: "Schon vergeben" } }
      : { fehler: "Der Monteur konnte nicht gespeichert werden." };
  }
  refresh();
  return { ok: true };
}

/** Monteur deaktivieren: verschwindet aus der Tafel, geplante Einsätze bleiben erhalten */
export async function monteurDeaktivieren(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("mitarbeiter").update({ aktiv: false }).eq("id", id);
  if (error) return { fehler: "Der Monteur konnte nicht deaktiviert werden." };
  refresh();
  return { ok: true };
}
