"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomer } from "@/customers";
import { istAnfrageStatus } from "@/lib/anfragen-status";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { suchbegriff } from "@/lib/kunden";
import { berlinNachUtc } from "@/lib/zeit";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; felder?: Record<string, string> };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anfrage anlegen oder ändern. Kunde ist Pflicht (ein Interessent wird vorher als Kunde angelegt). */
export async function anfrageSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const c = getCustomer();
  const id = text(fd, "id") || null;
  const wertText = text(fd, "geschaetzter_wert").replace(/\./g, "").replace(",", ".");
  const aufmassLokal = text(fd, "aufmass_termin");
  const daten = {
    titel: text(fd, "titel"),
    kunde_id: text(fd, "kunde_id"),
    objekt: text(fd, "objekt") || null,
    beschreibung: text(fd, "beschreibung") || null,
    herkunft: text(fd, "herkunft") || null,
    produkte: fd.getAll("produkte").map(String).filter((p) => c.produkte.includes(p)),
    geschaetzter_wert: wertText ? Number(wertText) : null,
    zustaendig_id: text(fd, "zustaendig_id") || null,
    wiedervorlage: text(fd, "wiedervorlage") || null,
    aufmass_termin: aufmassLokal ? berlinNachUtc(aufmassLokal) : null,
    notiz: text(fd, "notiz") || null,
  };

  const felder: Record<string, string> = {};
  if (!daten.titel) felder.titel = "Bitte eine Kurzbezeichnung eingeben.";
  if (!UUID.test(daten.kunde_id)) felder.kunde_id = "Bitte einen Kunden wählen oder neu anlegen.";
  if (daten.herkunft && !c.herkunft.includes(daten.herkunft)) felder.herkunft = "Bitte aus der Liste wählen.";
  if (daten.geschaetzter_wert !== null && !(daten.geschaetzter_wert >= 0)) felder.geschaetzter_wert = "Bitte einen Betrag in Euro eingeben.";
  if (daten.wiedervorlage && !DATUM.test(daten.wiedervorlage)) felder.wiedervorlage = "Ungültiges Datum.";
  if (aufmassLokal && !daten.aufmass_termin) felder.aufmass_termin = "Ungültiger Termin.";
  if (daten.zustaendig_id && !UUID.test(daten.zustaendig_id)) felder.zustaendig_id = "Bitte aus der Liste wählen.";
  if (Object.keys(felder).length) return { fehler: "Bitte die markierten Felder prüfen.", felder };

  if (!id) {
    const { data, error } = await supabase.from("anfrage").insert(daten).select("id").single();
    if (error || !data) return { fehler: "Die Anfrage konnte nicht gespeichert werden." };
    redirect(`/anfragen/${data.id}`);
  }
  const { error } = await supabase.from("anfrage").update(daten).eq("id", id);
  if (error) return { fehler: "Die Anfrage konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

/** Status einer offenen Anfrage (Auswahl auf der Seite oder Ziehen im Board) */
export async function statusSetzen(id: string, status: string): Promise<Ergebnis> {
  if (!istAnfrageStatus(status)) return { fehler: "Ungültiger Status." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("anfrage").update({ status }).eq("id", id).is("archiv", null);
  if (error) return { fehler: "Der Status konnte nicht geändert werden." };
  refresh();
  return { ok: true };
}

export async function verlorenSetzen(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const grund = text(fd, "grund");
  if (!grund) return { fehler: "Bitte einen Grund angeben.", felder: { grund: "Pflichtfeld" } };
  const { error } = await supabase.from("anfrage").update({ archiv: "verloren", verlust_grund: grund }).eq("id", text(fd, "id")).is("archiv", null);
  if (error) return { fehler: "Die Anfrage konnte nicht archiviert werden." };
  refresh();
  return { ok: true };
}

export async function wiederherstellen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("anfrage").update({ archiv: null }).eq("id", id);
  if (error) return { fehler: error.message.includes("gewonnen") ? error.message : "Die Anfrage konnte nicht wiederhergestellt werden." };
  refresh();
  return { ok: true };
}

/** Übergang bis zum Beleg-Modul: Auftrag (Nummer aus dem AB-Nummernkreis) anlegen, Anfrage wird gewonnen. */
export async function auftragAnlegen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.rpc("anfrage_auftrag_anlegen", { p_anfrage_id: id });
  if (error || !data) {
    return { fehler: ["23505", "P0001"].includes(error?.code ?? "") ? error!.message : "Der Auftrag konnte nicht angelegt werden." };
  }
  const { data: a } = await supabase.from("auftrag").select("nummer").eq("id", data).single();
  refresh();
  return { ok: true, hinweis: `Auftrag ${a?.nummer ?? ""} angelegt.` };
}

export async function anfrageLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "anfrage", p_id: id });
  if (error) return { fehler: error.code === "23503" ? error.message : "Die Anfrage konnte nicht gelöscht werden." };
  redirect("/anfragen");
}

/** Notiz oder Telefonat in der Historie */
export async function notizAnlegen(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const inhalt = text(fd, "text");
  if (!inhalt) return { fehler: "Bitte einen Text eingeben." };
  const { error } = await supabase.from("historie_notiz").insert({
    art: text(fd, "art") === "telefonat" ? "telefonat" : "notiz",
    text: inhalt,
    anfrage_id: text(fd, "anfrage_id"),
  });
  if (error) return { fehler: "Die Notiz konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

export type KundeTreffer = { id: string; name: string; nummer: string; ort: string | null; herkunft: string | null; objekte: string[] };

/** Kundensuche für die Auswahl im Anfrage-Dialog (Name, Nummer, Ort) mit Adressen für das Feld „Objekt“. */
export async function kundenSuchen(q: string): Promise<KundeTreffer[]> {
  const { supabase } = await pruefeSitzung();
  const s = suchbegriff(q);
  if (s.length < 2) return [];
  const { data } = await supabase
    .from("kunde")
    .select("id, name, nummer, ort, herkunft, strasse, plz, lieferadressen:kunde_lieferadresse(strasse, plz, ort, alt_seit, deleted_at)")
    .or(["name", "nummer", "ort", "ansprechpartner"].map((f) => `${f}.ilike.%${s}%`).join(","))
    .order("name")
    .limit(8);
  return (data ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    nummer: k.nummer,
    ort: k.ort,
    herkunft: k.herkunft,
    objekte: objekteAus(k),
  }));
}

/** Adressen eines Kunden für das Feld „Objekt“: aktive Lieferadressen, dann die Rechnungsadresse */
export async function kundenObjekte(kundeId: string): Promise<{ objekte: string[]; herkunft: string | null } | null> {
  if (!UUID.test(kundeId)) return null;
  const { supabase } = await pruefeSitzung();
  const { data: k } = await supabase
    .from("kunde")
    .select("herkunft, strasse, plz, ort, lieferadressen:kunde_lieferadresse(strasse, plz, ort, alt_seit, deleted_at)")
    .eq("id", kundeId)
    .maybeSingle();
  return k ? { objekte: objekteAus(k), herkunft: k.herkunft } : null;
}

type AdressDaten = { strasse: string | null; plz: string | null; ort: string | null; lieferadressen?: { strasse: string | null; plz: string | null; ort: string | null; alt_seit: string | null; deleted_at: string | null }[] };
function objekteAus(k: AdressDaten): string[] {
  const t = (a: { strasse: string | null; plz: string | null; ort: string | null }) => [a.strasse, [a.plz, a.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const liefer = (k.lieferadressen ?? []).filter((la) => !la.alt_seit && !la.deleted_at).map(t);
  return [...new Set([...liefer, t(k)].filter(Boolean))];
}
