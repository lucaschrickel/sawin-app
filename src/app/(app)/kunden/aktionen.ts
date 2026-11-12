"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomer } from "@/customers";
import { kontaktAktualisieren } from "@/lib/lexware/uebertragung";
import { pruefeSitzung } from "@/lib/auth/sitzung";

const ANREDEN = ["Herr", "Frau", "Familie", "Eheleute", "Dr."];

export type Ergebnis = { fehler?: string; ok?: boolean; felder?: Record<string, string>; id?: string; name?: string; hinweis?: string };

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Kunde mit Lieferadressen anlegen oder ändern (eine Transaktion über kunde_speichern). */
export async function kundeSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id") || null;
  const kunde = {
    name: text(fd, "name"),
    typ: text(fd, "typ") === "firma" ? "firma" : "privat",
    anrede: ANREDEN.includes(text(fd, "anrede")) && text(fd, "typ") !== "firma" ? text(fd, "anrede") : "",
    bauleister_13b: fd.get("bauleister_13b") === "on",
    ansprechpartner: text(fd, "ansprechpartner"),
    herkunft: text(fd, "herkunft"),
    strasse: text(fd, "strasse"),
    plz: text(fd, "plz"),
    ort: text(fd, "ort"),
    land: text(fd, "land") || "Deutschland",
    telefon: text(fd, "telefon"),
    email: text(fd, "email"),
    notiz: String(fd.get("notiz") ?? "").trim(),
  };

  // Prüfung auf dem Server (die Datenbank prüft Pflichtfelder und § 13b zusätzlich)
  const felder: Record<string, string> = {};
  if (!kunde.name) felder.name = "Bitte den Namen oder die Firma eingeben.";
  if (kunde.bauleister_13b && kunde.typ !== "firma") felder.bauleister_13b = "§ 13b gilt nur für Firmenkunden.";
  if (kunde.email && !EMAIL.test(kunde.email)) felder.email = "Bitte eine gültige E-Mail-Adresse eingeben.";
  if (kunde.plz && kunde.land === "Deutschland" && !/^\d{5}$/.test(kunde.plz)) felder.plz = "Fünfstellige PLZ.";
  if (kunde.herkunft && !getCustomer().herkunft.includes(kunde.herkunft)) felder.herkunft = "Bitte aus der Liste wählen.";

  const ids = fd.getAll("la_id").map(String);
  const lieferadressen = ids.map((laId, i) => ({
    id: laId || null,
    bezeichnung: String(fd.getAll("la_bezeichnung")[i] ?? "").trim(),
    strasse: String(fd.getAll("la_strasse")[i] ?? "").trim(),
    plz: String(fd.getAll("la_plz")[i] ?? "").trim(),
    ort: String(fd.getAll("la_ort")[i] ?? "").trim(),
    alt: String(fd.getAll("la_alt")[i] ?? "") === "1",
  }));
  lieferadressen.forEach((la, i) => {
    if (la.plz && !/^\d{5}$/.test(la.plz)) felder[`la_plz_${i}`] = "Fünfstellige PLZ.";
    if (la.id && !la.strasse && !la.ort) felder[`la_ort_${i}`] = "Straße oder Ort angeben (oder als „Alt“ markieren).";
  });
  if (Object.keys(felder).length) return { fehler: "Bitte die markierten Felder prüfen.", felder };

  const { data, error } = await supabase.rpc("kunde_speichern", { p_id: id, p_kunde: kunde, p_lieferadressen: lieferadressen });
  if (error || !data) return { fehler: "Der Kunde konnte nicht gespeichert werden. Bitte erneut versuchen." };
  // Aus einem anderen Dialog heraus (z. B. Anfrage): neuen Kunden zurückgeben statt zur Kundenseite zu springen
  if (!id && fd.get("_rueckgabe") === "1") return { ok: true, id: String(data), name: kunde.name };
  if (!id) redirect(`/kunden/${data}`);
  // Liegt der Kunde schon in Lexware, gehen Änderungen dorthin (nur App → Lexware)
  const hinweis = await kontaktAktualisieren(id);
  refresh();
  return hinweis ? { ok: true, hinweis } : { ok: true };
}

/** Kunde löschen (Markierung). Die Datenbank lehnt ab, wenn noch Anfragen, Aufträge, Belege oder Tickets existieren. */
export async function kundeLoeschen(id: string): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "kunde", p_id: id });
  if (error) return { fehler: error.code === "23503" ? error.message : "Der Kunde konnte nicht gelöscht werden." };
  redirect("/kunden");
}

/** Konditionen (eigene Tabelle, nur mit Recht „Konditionen sehen“, per RLS geprüft). */
export async function konditionenSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase, benutzer } = await pruefeSitzung();
  if (!benutzer.konditionen) return { fehler: "Konditionen darf nur ändern, wer das Recht „Konditionen sehen“ hat." };
  const kundeId = text(fd, "kunde_id");
  const inhalt = String(fd.get("konditionen") ?? "").trim();
  const { data: vorhanden } = await supabase.from("kunde_kondition").select("id").eq("kunde_id", kundeId).maybeSingle();
  const { error } = vorhanden
    ? await supabase.from("kunde_kondition").update({ text: inhalt }).eq("id", vorhanden.id)
    : await supabase.from("kunde_kondition").insert({ kunde_id: kundeId, text: inhalt });
  if (error) return { fehler: "Die Konditionen konnten nicht gespeichert werden." };
  refresh();
  return { ok: true };
}
