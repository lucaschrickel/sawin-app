"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { pruefeSitzung } from "@/lib/auth/sitzung";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; felder?: Record<string, string> };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const url = (v: string) => !v || /^https?:\/\/\S+$/i.test(v);

/** Lieferant samt Ansprechpartnern anlegen oder ändern */
export async function lieferantSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const lieferant = {
    name: text(fd, "name"),
    produktgruppen: text(fd, "produktgruppen").split(",").map((p) => p.trim()).filter(Boolean),
    konfigurator_url: text(fd, "konfigurator_url"),
    haendlerportal_url: text(fd, "haendlerportal_url"),
    unsere_kundennummer: text(fd, "unsere_kundennummer"),
    lieferzeit: text(fd, "lieferzeit"),
    telefon: text(fd, "telefon"),
    notiz: text(fd, "notiz"),
  };
  const spalte = (n: string) => fd.getAll(n).map((v) => String(v).trim());
  const ids = spalte("k_id");
  const kontakte = spalte("k_name").map((name, i) => ({ id: ids[i] || null, name, funktion: spalte("k_funktion")[i], handy: spalte("k_handy")[i], telefon: spalte("k_telefon")[i], email: spalte("k_email")[i] }));
  const felder: Record<string, string> = {};
  if (!lieferant.name) felder.name = "Bitte den Firmennamen eingeben.";
  if (!url(lieferant.konfigurator_url)) felder.konfigurator_url = "Bitte eine Adresse mit https:// eingeben.";
  if (!url(lieferant.haendlerportal_url)) felder.haendlerportal_url = "Bitte eine Adresse mit https:// eingeben.";
  if (kontakte.some((k) => k.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email))) felder.kontakte = "Bitte gültige E-Mail-Adressen eingeben.";
  if (kontakte.some((k) => !k.name && (k.funktion || k.handy || k.telefon || k.email))) felder.kontakte = "Jeder Ansprechpartner braucht einen Namen.";
  if ((id && !UUID.test(id)) || kontakte.some((k) => k.id && !UUID.test(k.id))) return { fehler: "Lieferant nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };

  const { data, error } = await supabase.rpc("lieferant_speichern", { p_id: id || null, p_lieferant: lieferant, p_kontakte: kontakte.filter((k) => k.name) });
  if (error || !data) return { fehler: "Der Lieferant konnte nicht gespeichert werden." };
  if (!id) redirect(`/lieferanten/${data}`);
  refresh();
  return { ok: true };
}

/** Einkaufskonditionen (nur mit Recht „Konditionen sehen“, prüft die Datenbank) */
export async function konditionSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase, benutzer } = await pruefeSitzung();
  if (!benutzer.konditionen) return { fehler: "Keine Berechtigung." };
  const lieferantId = text(fd, "lieferant_id");
  if (!UUID.test(lieferantId)) return { fehler: "Lieferant nicht gefunden." };
  const inhalt = text(fd, "text");
  const { data: vorhanden } = await supabase.from("lieferant_kondition").select("id").eq("lieferant_id", lieferantId).maybeSingle();
  const { error } = vorhanden
    ? await supabase.from("lieferant_kondition").update({ text: inhalt }).eq("id", vorhanden.id)
    : await supabase.from("lieferant_kondition").insert({ lieferant_id: lieferantId, text: inhalt });
  if (error) return { fehler: "Die Konditionen konnten nicht gespeichert werden." };
  refresh();
  return { ok: true, hinweis: "Gespeichert." };
}

export async function lieferantLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "lieferant", p_id: id });
  if (error) return { fehler: error.code === "23503" ? error.message : "Der Lieferant konnte nicht gelöscht werden." };
  redirect("/lieferanten");
}
