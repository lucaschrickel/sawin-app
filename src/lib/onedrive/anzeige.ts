import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import type { DateiZeile, OrdnerZeile } from "./ablage";
import { graphEingerichtet } from "./graph";

/** Ordner und Dateien eines Vorgangs für die Karte „OneDrive-Ordner“ (mit den Rechten des Benutzers, RLS) */
export async function ladeAblage(bezug: { anfrage_id?: string; auftrag_id?: string; ticket_id?: string }) {
  const { supabase } = await pruefeSitzung();
  const spalte = bezug.auftrag_id ? "auftrag_id" : bezug.ticket_id ? "ticket_id" : "anfrage_id";
  const wert = (bezug.auftrag_id ?? bezug.ticket_id ?? bezug.anfrage_id)!;
  const [{ data: ordner }, { data: einstellung }] = await Promise.all([
    supabase.from("ablage_ordner").select("id, anfrage_id, auftrag_id, ticket_id, name, drive_id, item_id, web_url, unterordner, status, fehler, altbestand").eq(spalte, wert).maybeSingle<OrdnerZeile>(),
    supabase.from("einstellung").select("onedrive_basis_id").maybeSingle(),
  ]);
  const { data: dateien } = ordner
    ? await supabase
        .from("ablage_datei")
        .select("id, ordner_id, unterordner, name, quelle, beleg_id, version, mime, groesse, item_id, web_url, status, puffer_pfad, versuche, fehler, abgelegt_am, created_at")
        .eq("ordner_id", ordner.id)
        .neq("status", "upload")
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<DateiZeile[]>()
    : { data: [] as DateiZeile[] };
  return { ordner, dateien: dateien ?? [], verbunden: graphEingerichtet() && !!einstellung?.onedrive_basis_id };
}
