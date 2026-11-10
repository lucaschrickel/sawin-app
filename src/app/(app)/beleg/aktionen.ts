"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { pdfAblegen } from "@/lib/beleg-ablage";
import { abrechnungAnwenden } from "@/lib/beleg-abrechnung";
import { aufbereiten, meldung } from "@/lib/beleg-eingabe";
import { LEXWARE_BELEGARTEN } from "@/lib/belege-status";
import { anLexwareUebertragen, lexwarePdfNachladen } from "@/lib/lexware/uebertragung";
import { zahlstandHolen } from "@/lib/lexware/zahlungen";
import type { EditorZustand } from "@/lib/beleg-typen";
import { ladeBeleg, ladeKundeFuerBeleg, kundeVorbelegung, type KundeFuerBeleg } from "@/lib/belege";

export type Ergebnis = { fehler?: string; ok?: boolean; hinweis?: string; id?: string; nummer?: string | null; auftragId?: string | null; frage?: "anfrage_verloren"; anfrageId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kurz = (s: unknown, max: number) => String(s ?? "").slice(0, max);

async function speichern(eingabe: EditorZustand): Promise<{ fehler: string } | { id: string }> {
  const z = await abrechnungAnwenden(eingabe);
  if ("fehler" in z) return z;
  const daten = aufbereiten(z);
  if ("fehler" in daten) return daten;
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.rpc("beleg_speichern", { p_id: z.kopf.id, p_kopf: daten.kopf, p_positionen: daten.positionen });
  if (error || !data) return { fehler: meldung(error, "Der Beleg konnte nicht gespeichert werden.") };
  return { id: data as string };
}

/** Entwurf speichern bzw. Änderungen an einem fertiggestellten Angebot / einer AB speichern (neues PDF) */
export async function belegSpeichern(z: EditorZustand): Promise<Ergebnis> {
  const r = await speichern(z);
  if ("fehler" in r) return r;
  const d = await ladeBeleg(r.id);
  if (d && d.beleg.status !== "entwurf") {
    try {
      await pdfAblegen(d);
    } catch {
      return { ok: true, id: r.id, nummer: d.beleg.nummer, hinweis: "Gespeichert, das PDF konnte aber nicht abgelegt werden. Es wird beim Öffnen neu erzeugt." };
    }
  }
  refresh();
  return { ok: true, id: r.id, nummer: d?.beleg.nummer ?? null };
}

/** Speichern und fertigstellen: App-Belege werden gesperrt (Ausnahmen siehe CLAUDE.md) und als PDF abgelegt */
export async function belegFertigstellen(z: EditorZustand): Promise<Ergebnis> {
  if (z.positionen.some((p) => p.typ === "artikel" && !p.titel.trim())) return { fehler: "Jede Position braucht einen Titel." };
  const r = await speichern(z);
  if ("fehler" in r) return r;
  if (LEXWARE_BELEGARTEN.includes(z.kopf.art)) {
    // Rechnung, Abschlag, Gutschrift: in Lexware anlegen (nach dem Bestätigungsdialog im Editor)
    const u = await anLexwareUebertragen(r.id);
    refresh();
    return u.ok ? { ok: true, id: r.id, nummer: u.nummer, hinweis: u.hinweis } : { fehler: u.fehler, id: r.id };
  }
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.rpc("beleg_fertigstellen", { p_id: r.id });
  if (error) return { fehler: meldung(error, "Der Beleg konnte nicht fertiggestellt werden."), id: r.id };
  const d = await ladeBeleg(r.id);
  let hinweis: string | undefined;
  if (d) {
    try {
      await pdfAblegen(d);
    } catch {
      hinweis = "Das PDF konnte nicht abgelegt werden. Es wird beim Öffnen neu erzeugt.";
    }
  }
  refresh();
  const erg = data as { nummer: string; auftrag_id: string | null };
  return { ok: true, id: r.id, nummer: erg.nummer, auftragId: erg.auftrag_id, hinweis };
}

/** Entwurf verwerfen (Markierung als gelöscht) */
export async function belegVerwerfen(id: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Beleg nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "beleg", p_id: id });
  if (error) return { fehler: meldung(error, "Der Entwurf konnte nicht verworfen werden.") };
  refresh();
  return { ok: true };
}

/** Angebot angenommen / abgelehnt (bzw. zurück auf offen). Sind alle Angebote der Anfrage abgelehnt, fragt die App nach. */
export async function angebotStatus(id: string, status: "angenommen" | "abgelehnt" | "offen"): Promise<Ergebnis> {
  if (!UUID.test(id) || !["angenommen", "abgelehnt", "offen"].includes(status)) return { fehler: "Beleg nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { data: b, error } = await supabase.from("beleg").update({ status }).eq("id", id).eq("art", "angebot").select("anfrage_id").maybeSingle();
  if (error || !b) return { fehler: meldung(error, "Der Status konnte nicht geändert werden.") };
  refresh();
  if (status === "abgelehnt" && b.anfrage_id) {
    const { data: andere } = await supabase.from("beleg").select("status").eq("anfrage_id", b.anfrage_id).eq("art", "angebot").neq("status", "entwurf");
    const { data: q } = await supabase.from("anfrage").select("archiv").eq("id", b.anfrage_id).maybeSingle();
    if (q && !q.archiv && (andere ?? []).every((x) => x.status === "abgelehnt")) return { ok: true, frage: "anfrage_verloren", anfrageId: b.anfrage_id };
  }
  return { ok: true };
}

/** „Als übergeben markieren“ (Post, persönlich): friert die aktuelle Version ein */
export async function belegUebergeben(id: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Beleg nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.rpc("beleg_uebergeben", { p_id: id });
  if (error) return { fehler: meldung(error, "Die Übergabe konnte nicht gespeichert werden.") };
  refresh();
  return { ok: true, hinweis: `Version ${data} als übergeben markiert.` };
}

/** Tags und internen Kommentar speichern (auch nach dem Fertigstellen) */
export async function tagsKommentarSpeichern(id: string, tags: string[], kommentar: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Beleg nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const sauber = [...new Set(tags.map((t) => kurz(t, 40).trim()).filter(Boolean))].slice(0, 30);
  const { error } = await supabase.from("beleg").update({ tags: sauber, kommentar_intern: kurz(kommentar, 4000).trim() || null }).eq("id", id);
  if (error) return { fehler: meldung(error, "Tags und Kommentar konnten nicht gespeichert werden.") };
  refresh();
  return { ok: true };
}

/** Kundendaten für den Editor (Auswahl, „Kunde bearbeiten“, „Neuer Kunde“) */
export async function kundeFuerEditor(id: string): Promise<(KundeFuerBeleg & { vorbelegung: ReturnType<typeof kundeVorbelegung> }) | null> {
  const k = await ladeKundeFuerBeleg(id);
  return k ? { ...k, vorbelegung: kundeVorbelegung(k) } : null;
}

/** Nachtragsangebot zu einem Auftrag: eigene Anfrage mit Verweis auf den Ursprungsauftrag */
export async function nachtragAnlegen(auftragId: string): Promise<Ergebnis> {
  if (!UUID.test(auftragId)) return { fehler: "Auftrag nicht gefunden." };
  const { supabase, benutzer } = await pruefeSitzung();
  const { data: a } = await supabase.from("auftrag").select("id, nummer, titel, kunde_id, objekt, herkunft").eq("id", auftragId).maybeSingle();
  if (!a) return { fehler: "Auftrag nicht gefunden." };
  const { data, error } = await supabase
    .from("anfrage")
    .insert({ titel: `Nachtrag zu ${a.nummer}${a.titel ? ` · ${a.titel}` : ""}`, kunde_id: a.kunde_id, objekt: a.objekt, herkunft: a.herkunft, nachtrag_zu: a.id, status: "angebot_erstellen", zustaendig_id: benutzer.id })
    .select("id")
    .single();
  if (error || !data) return { fehler: "Die Nachtragsanfrage konnte nicht angelegt werden." };
  return { ok: true, id: data.id };
}


/** Original-PDF eines Lexware-Belegs (erneut) von Lexware holen */
export async function lexwarePdfHolen(id: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Beleg nicht gefunden." };
  const d = await ladeBeleg(id);
  if (!d?.beleg.lexware_id) return { fehler: "Der Beleg liegt nicht in Lexware." };
  try {
    await lexwarePdfNachladen(d);
  } catch (e) {
    return { fehler: `Das PDF konnte nicht von Lexware geholt werden: ${e instanceof Error ? e.message : "unbekannter Fehler"}` };
  }
  refresh();
  return { ok: true };
}

const ZAHLUNGSARTEN = ["ueberweisung", "bar", "karte", "sonstiges"];
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** PDF einer neuen Zahlungsbestätigung ablegen (Fehler nur als Hinweis; das PDF entsteht sonst beim Öffnen) */
async function bestaetigungAblegen(id: string): Promise<string | undefined> {
  const d = await ladeBeleg(id);
  if (!d) return undefined;
  try {
    await pdfAblegen(d);
  } catch {
    return "Das PDF der Zahlungsbestätigung wird beim Öffnen erzeugt.";
  }
}

/** „Als bezahlt markieren“: App-Buchung (Teilzahlung möglich), optional mit Zahlungsbestätigung */
export async function alsBezahltMarkieren(id: string, e: { datum: string; betrag: string; zahlungsart: string; bestaetigung: boolean }): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Beleg nicht gefunden." };
  if (!DATUM.test(e.datum)) return { fehler: "Bitte das Datum des Zahlungseingangs angeben." };
  if (!ZAHLUNGSARTEN.includes(e.zahlungsart)) return { fehler: "Bitte eine Zahlungsart wählen." };
  const betrag = Number(String(e.betrag).trim().replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(betrag) || betrag <= 0) return { fehler: "Bitte einen Betrag über 0 € angeben." };
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.rpc("zahlung_erfassen", { p_beleg: id, p_datum: e.datum, p_betrag: Math.round(betrag * 100) / 100, p_zahlungsart: e.zahlungsart, p_bestaetigung: e.bestaetigung });
  if (error) return { fehler: meldung(error, "Die Zahlung konnte nicht gespeichert werden.") };
  const zb = (data as { zahlungsbestaetigung_id: string | null }).zahlungsbestaetigung_id;
  const hinweis = zb ? await bestaetigungAblegen(zb) : undefined;
  refresh();
  return { ok: true, id: zb ?? undefined, hinweis };
}

/** Zahlungsbestätigung zu einer Zahlung (App-Buchung oder aus Lexware) */
export async function zahlungsbestaetigungErstellen(zahlungId: string): Promise<Ergebnis> {
  if (!UUID.test(zahlungId)) return { fehler: "Zahlung nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.rpc("zahlungsbestaetigung_erstellen", { p_zahlung: zahlungId });
  if (error || !data) return { fehler: meldung(error, "Die Zahlungsbestätigung konnte nicht erstellt werden.") };
  const hinweis = await bestaetigungAblegen(data as string);
  refresh();
  return { ok: true, id: data as string, hinweis };
}

/** Eigene, noch nicht abgeglichene Zahlung ohne Bestätigung entfernen (Markierung als gelöscht) */
export async function zahlungEntfernen(zahlungId: string): Promise<Ergebnis> {
  if (!UUID.test(zahlungId)) return { fehler: "Zahlung nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "zahlung", p_id: zahlungId });
  if (error) return { fehler: meldung(error, "Die Zahlung konnte nicht entfernt werden.") };
  refresh();
  return { ok: true };
}

/** Zahlungsstand eines Belegs sofort von Lexware abrufen */
export async function zahlungsstandAbrufen(id: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Beleg nicht gefunden." };
  const { benutzer } = await pruefeSitzung();
  const d = await ladeBeleg(id);
  if (!d?.beleg.lexware_id) return { fehler: "Der Beleg liegt nicht in Lexware." };
  try {
    await zahlstandHolen({ id, lexware_id: d.beleg.lexware_id }, benutzer.id);
  } catch (e) {
    return { fehler: `Lexware: ${e instanceof Error ? e.message : "unbekannter Fehler"}` };
  }
  refresh();
  return { ok: true };
}
