"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { heuteBerlin } from "@/lib/zeit";
import { aufmassPdfAblegen } from "@/lib/formular-ablage";
import { PROTOKOLLE, type AufmassZeile, type FormularTyp } from "@/lib/formular-logik";
import { ladeFormular } from "@/lib/formulare";
import { imHintergrund } from "@/lib/onedrive/ablage";
import { nachtragAnlegen } from "../beleg/aktionen";

export type Ergebnis = { ok?: boolean; fehler?: string; hinweis?: string; id?: string; href?: string; gespeichert?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
type Bezug = { anfrage_id?: string; auftrag_id?: string; ticket_id?: string };

/** Bezug prüfen: genau einer, der Benutzer muss ihn sehen dürfen (RLS); an der Anfrage nur das Aufmaß */
async function bezugPruefen(b: Bezug, typ: FormularTyp): Promise<{ spalte: string; id: string } | null> {
  const { supabase } = await pruefeSitzung();
  const eintraege = Object.entries(b).filter(([, v]) => v);
  if (eintraege.length !== 1) return null;
  const [spalte, id] = eintraege[0] as [string, string];
  const tabelle = { anfrage_id: "anfrage", auftrag_id: "auftrag", ticket_id: "service_ticket" }[spalte];
  if (!tabelle || !UUID.test(id) || (spalte === "anfrage_id" && typ !== "aufmass")) return null;
  const { data } = await supabase.from(tabelle).select("id").eq("id", id).maybeSingle();
  return data ? { spalte, id } : null;
}

const fehlerText = (e: { message?: string } | null, standard: string) =>
  e?.message && /Aufmaß|Formular|Scan|Bezug/.test(e.message) ? e.message.replace(/^.*?: /, "") : standard;

/** Neues Aufmaßblatt mit einer leeren Zeile; danach öffnet der Browser den Editor */
export async function aufmassAnlegen(b: Bezug): Promise<Ergebnis> {
  const bezug = await bezugPruefen(b, "aufmass");
  if (!bezug) return { fehler: "Vorgang nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.from("formular").insert({ typ: "aufmass", status: "entwurf", datum: heuteBerlin(), [bezug.spalte]: bezug.id }).select("id").single();
  if (error || !data) return { fehler: "Das Aufmaß konnte nicht angelegt werden." };
  await supabase.from("aufmass_zeile").insert({ formular_id: data.id, reihenfolge: 1, element: "Fenster", anzahl: 1 });
  return { ok: true, id: data.id };
}

/** Automatisches Speichern beim Tippen (Kopf und alle Zeilen) */
export async function aufmassSpeichern(id: string, datum: string, hinweise: string, zeilen: AufmassZeile[]): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Aufmaß nicht gefunden." };
  if (!Array.isArray(zeilen) || zeilen.length > 500 || zeilen.some((z) => !UUID.test(String(z?.id ?? "")))) return { fehler: "Ungültige Zeilen." };
  const { supabase } = await pruefeSitzung();
  const sauber = zeilen.map((z) => ({
    id: z.id,
    raum: String(z.raum ?? "").slice(0, 200),
    element: String(z.element ?? "").slice(0, 200),
    breite_mm: String(z.breite_mm ?? "").replace(/\D/g, "").slice(0, 6),
    hoehe_mm: String(z.hoehe_mm ?? "").replace(/\D/g, "").slice(0, 6),
    anzahl: String(z.anzahl ?? "").replace(/\D/g, "").slice(0, 5),
    anschlag: String(z.anschlag ?? "").slice(0, 100),
    bemerkung: String(z.bemerkung ?? "").slice(0, 1000),
  }));
  const { data, error } = await supabase.rpc("aufmass_speichern", { p_id: id, p_datum: DATUM.test(datum) ? datum : null, p_hinweise: String(hinweise ?? "").slice(0, 4000), p_zeilen: sauber });
  if (error) return { fehler: fehlerText(error, "Das Aufmaß konnte nicht gespeichert werden.") };
  return { ok: true, gespeichert: data as string };
}

/** Abschließen (PDF nach „03 Aufmaß - Freigabe“, an einer Anfrage ohne Ordner später) bzw. wieder öffnen */
export async function aufmassStatus(id: string, abschliessen: boolean): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Aufmaß nicht gefunden." };
  const { supabase, benutzer } = await pruefeSitzung();
  const { data, error } = await supabase
    .from("formular")
    .update({ status: abschliessen ? "abgeschlossen" : "entwurf" })
    .eq("id", id)
    .eq("typ", "aufmass")
    .select("id, anfrage_id")
    .maybeSingle();
  if (error || !data) return { fehler: fehlerText(error, "Der Status konnte nicht geändert werden.") };
  refresh();
  if (!abschliessen) return { ok: true };
  imHintergrund(() => aufmassPdfAblegen(id, benutzer.id), "Aufmaß-PDF");
  if (data.anfrage_id) {
    const { data: o } = await supabase.from("ablage_ordner").select("id").eq("anfrage_id", data.anfrage_id).maybeSingle();
    if (!o) return { ok: true, hinweis: "Aufmaß abgeschlossen. Das PDF kommt in den OneDrive-Ordner, sobald das erste Angebot gespeichert ist." };
  }
  return { ok: true, hinweis: "Aufmaß abgeschlossen. Das PDF wird im OneDrive-Ordner unter „03 Aufmaß - Freigabe“ abgelegt." };
}

/** „In Angebot übernehmen“: an der Anfrage direkt, am Auftrag als Nachtragsangebot (eigene Anfrage) */
export async function aufmassInAngebot(id: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Aufmaß nicht gefunden." };
  const f = await ladeFormular(id);
  if (!f || f.typ !== "aufmass") return { fehler: "Aufmaß nicht gefunden." };
  if (f.bezug.art === "ticket") return { fehler: "Aus dem Aufmaß eines Tickets entsteht kein Angebot." };
  if (f.bezug.art === "anfrage") {
    if (f.bezug.archiviert) return { fehler: "Die Anfrage ist archiviert." };
    return { ok: true, href: `/beleg/neu?art=angebot&anfrage=${f.bezug.id}&aufmass=${id}` };
  }
  const r = await nachtragAnlegen(f.bezug.id);
  if (!r.id) return { fehler: r.fehler ?? "Die Nachtragsanfrage konnte nicht angelegt werden." };
  return { ok: true, href: `/beleg/neu?art=angebot&anfrage=${r.id}&aufmass=${id}` };
}

/** Protokoll als Vorlage drucken: legt das Formular mit Status „Gedruckt“ an; der Browser öffnet das PDF */
export async function protokollDrucken(typ: FormularTyp, b: Bezug): Promise<Ergebnis> {
  if (!PROTOKOLLE.includes(typ)) return { fehler: "Unbekanntes Formular." };
  const bezug = await bezugPruefen(b, typ);
  if (!bezug) return { fehler: "Vorgang nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.from("formular").insert({ typ, status: "gedruckt", datum: heuteBerlin(), [bezug.spalte]: bezug.id }).select("id").single();
  if (error || !data) return { fehler: "Das Protokoll konnte nicht angelegt werden." };
  refresh();
  return { ok: true, id: data.id };
}

/** Formular entfernen (Markierung): Aufmaß im Entwurf, Protokoll ohne Scan */
export async function formularEntfernen(id: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Formular nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { data: f } = await supabase.from("formular").select("typ, status").eq("id", id).maybeSingle();
  if (!f) return { fehler: "Formular nicht gefunden." };
  if (f.status === "abgeschlossen" || f.status === "scan_abgelegt") return { fehler: "Abgeschlossene Formulare und abgelegte Scans bleiben erhalten." };
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "formular", p_id: id });
  if (error) return { fehler: "Das Formular konnte nicht entfernt werden." };
  refresh();
  return { ok: true };
}

