import "server-only";
import { getCustomer } from "@/customers";
import { formularDateiname, type FormularTyp } from "./formular-logik";
import { ladeFormularDruck } from "./formulare";
import { dateiAblegen, type Bezug } from "./onedrive/ablage";
import { FORMULAR_UNTERORDNER } from "./onedrive/schema";
import { formularPdf } from "./pdf/formular-pdf";
import { createAdminClient } from "./supabase/admin";

/*
  Ablage der Formular-PDFs in OneDrive (CLAUDE.md „Formulare & Protokolle“, Entscheidung zum Plan 12.11.2026):
  Das Aufmaßblatt geht beim Abschließen als PDF nach „03 Aufmaß - Freigabe“. Hängt es an einer Anfrage ohne Ordner
  (der Ordner entsteht erst mit dem ersten Angebot), wartet es und wird nachgezogen, sobald der Ordner entsteht.
  Läuft im Hintergrund mit der Service-Rolle; geschrieben wird nur über ablage_*_setzen mit dem handelnden Benutzer.
*/

type FormularRoh = { id: string; typ: FormularTyp; status: string; anfrage_id: string | null; auftrag_id: string | null; ticket_id: string | null; created_at: string };

/** Laufende Nummer des Formulars unter den Formularen derselben Art am selben Vorgang (für den Dateinamen) */
async function laufendeNummer(f: FormularRoh): Promise<number> {
  const spalte = f.auftrag_id ? "auftrag_id" : f.ticket_id ? "ticket_id" : "anfrage_id";
  const { data } = await createAdminClient()
    .from("formular")
    .select("id")
    .eq(spalte, (f.auftrag_id ?? f.ticket_id ?? f.anfrage_id)!)
    .eq("typ", f.typ)
    .is("deleted_at", null)
    .order("created_at");
  return Math.max(1, (data ?? []).findIndex((x) => x.id === f.id) + 1);
}

/** PDF eines abgeschlossenen Aufmaßblatts ablegen; null, wenn der Ordner der Anfrage noch nicht besteht */
export async function aufmassPdfAblegen(formularId: string, benutzer: string | null) {
  const admin = createAdminClient();
  const { data: f } = await admin.from("formular").select("id, typ, status, anfrage_id, auftrag_id, ticket_id, created_at").eq("id", formularId).is("deleted_at", null).maybeSingle<FormularRoh>();
  if (!f || f.typ !== "aufmass" || f.status !== "abgeschlossen") return null;
  if (f.anfrage_id) {
    const { data: o } = await admin.from("ablage_ordner").select("id").eq("anfrage_id", f.anfrage_id).is("deleted_at", null).maybeSingle();
    if (!o) return null;
  }
  const d = await ladeFormularDruck(f.id, admin);
  if (!d) return null;
  const pdf = await formularPdf(d, getCustomer().logoPfade);
  // an der Anfrage wie der Ordner mit der Nummer des ersten Angebots
  let nummer = d.formular.bezug.nummer;
  if (f.anfrage_id) {
    const { data: ag } = await admin.from("beleg").select("nummer").eq("anfrage_id", f.anfrage_id).eq("art", "angebot").not("nummer", "is", null).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
    if (ag?.nummer) nummer = ag.nummer;
  }
  const name = formularDateiname(f.typ, nummer, d.formular.kunde?.name ?? null, await laufendeNummer(f));
  const bezug: Bezug = f.auftrag_id ? { auftrag_id: f.auftrag_id } : f.ticket_id ? { ticket_id: f.ticket_id } : { anfrage_id: f.anfrage_id };
  return dateiAblegen({ bezug, unterordner: f.ticket_id ? null : FORMULAR_UNTERORDNER.aufmass, name, inhalt: pdf, mime: "application/pdf", quelle: "formular", formular_id: f.id }, benutzer);
}

/** Nachziehen: abgeschlossene Aufmaßblätter einer Anfrage bzw. eines Auftrags ohne abgelegtes PDF (nach dem Anlegen des Ordners) */
export async function aufmasseNachziehen(b: { anfrage_id: string } | { auftrag_id: string }, benutzer: string | null) {
  const admin = createAdminClient();
  const [spalte, wert] = Object.entries(b)[0];
  const { data: formulare } = await admin.from("formular").select("id").eq(spalte, wert).eq("typ", "aufmass").eq("status", "abgeschlossen").is("deleted_at", null);
  if (!formulare?.length) return 0;
  const { data: abgelegt } = await admin.from("ablage_datei").select("formular_id").in("formular_id", formulare.map((x) => x.id)).eq("quelle", "formular").is("deleted_at", null);
  const vorhanden = new Set((abgelegt ?? []).map((x) => x.formular_id));
  let n = 0;
  for (const f of formulare) if (!vorhanden.has(f.id) && (await aufmassPdfAblegen(f.id, benutzer))) n++;
  return n;
}

/** Dateiname für den Scan eines Protokolls: <Nummer>_<Protokoll>_<Kunde>_unterschrieben.<Endung> */
export function scanDateiname(typ: FormularTyp, nummer: string, kunde: string | null, original: string): string {
  const endung = (original.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1] ?? "pdf").replace("jpeg", "jpg");
  return formularDateiname(typ, nummer, kunde).replace(/\.pdf$/, `_unterschrieben.${endung}`);
}
