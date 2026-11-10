"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { BELEGARTEN } from "@/lib/belege-status";
import { htmlBereinigen } from "@/lib/html";

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

const FELDER = ["einleitung", "lieferbedingungen", "nachbemerkung"];

/** Artikel anlegen oder ändern; die Beschreibung wird serverseitig nach Whitelist bereinigt */
export async function artikelSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const preis = Number(text(fd, "preis_netto").replace(/\./g, "").replace(",", "."));
  const daten = {
    bezeichnung: text(fd, "bezeichnung").slice(0, 255),
    einheit: text(fd, "einheit").slice(0, 20) || "Stk",
    preis_netto: Math.round(preis * 100) / 100,
    beschreibung_html: htmlBereinigen(String(fd.get("beschreibung") ?? "")) || null,
    schnellauswahl: fd.get("schnellauswahl") === "on",
  };
  const felder: Record<string, string> = {};
  if (!daten.bezeichnung) felder.bezeichnung = "Bitte eine Bezeichnung eingeben.";
  if (!Number.isFinite(preis) || preis < 0) felder.preis_netto = "Bitte einen Preis ab 0 € eingeben.";
  if (id && !UUID.test(id)) return { fehler: "Artikel nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };
  const { error } = id ? await supabase.from("artikel").update(daten).eq("id", id) : await supabase.from("artikel").insert(daten);
  if (error) return { fehler: "Der Artikel konnte nicht gespeichert werden." };
  refresh();
  return { ok: true };
}

/** Stern „Schnellauswahl“ umschalten */
export async function artikelStern(id: string, an: boolean): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Artikel nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.from("artikel").update({ schnellauswahl: an }).eq("id", id);
  if (error) return { fehler: "Die Schnellauswahl konnte nicht geändert werden." };
  refresh();
  return { ok: true };
}

/** Artikel löschen (Markierung). Belege behalten ihre Positionen. */
export async function artikelLoeschen(id: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Artikel nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "artikel", p_id: id });
  if (error) return { fehler: "Der Artikel konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}

/** Textvorlage anlegen oder ändern; „Standard“ gilt je Feld und Belegart nur für eine Vorlage */
export async function textvorlageSpeichern(_: Ergebnis, fd: FormData): Promise<Ergebnis> {
  const { supabase } = await pruefeSitzung();
  const id = text(fd, "id");
  const daten = {
    feld: text(fd, "feld"),
    name: text(fd, "name").slice(0, 120),
    text: String(fd.get("text") ?? "").trim().slice(0, 4000),
    belegarten: arten(fd, "belegarten"),
    standard: fd.get("standard") === "on",
  };
  const felder: Record<string, string> = {};
  if (!FELDER.includes(daten.feld)) felder.feld = "Bitte ein Feld wählen.";
  if (!daten.name) felder.name = "Bitte einen Namen eingeben.";
  if (!daten.text) felder.text = "Bitte den Text eingeben.";
  if (id && !UUID.test(id)) return { fehler: "Vorlage nicht gefunden." };
  if (Object.keys(felder).length) return { fehler: Object.values(felder)[0], felder };
  const { data, error } = id
    ? await supabase.from("textvorlage").update(daten).eq("id", id).select("id").single()
    : await supabase.from("textvorlage").insert(daten).select("id").single();
  if (error || !data) return { fehler: "Die Vorlage konnte nicht gespeichert werden." };
  // Standard je Feld und Belegart nur einmal: andere Standard-Vorlagen desselben Felds mit gleicher Belegart zurücksetzen
  if (daten.standard) {
    const { data: andere } = await supabase.from("textvorlage").select("id, belegarten").eq("feld", daten.feld).eq("standard", true).neq("id", data.id);
    for (const v of andere ?? []) {
      const va = v.belegarten as string[];
      const ueberschneidung = !va.length || !daten.belegarten.length || va.some((a) => daten.belegarten.includes(a));
      if (ueberschneidung) await supabase.from("textvorlage").update({ standard: false }).eq("id", v.id);
    }
  }
  refresh();
  return { ok: true };
}

/** Textvorlage löschen (Markierung). Belege behalten ihren Text. */
export async function textvorlageLoeschen(id: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Vorlage nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "textvorlage", p_id: id });
  if (error) return { fehler: "Die Vorlage konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}
