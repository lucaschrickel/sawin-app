"use server";

import { refresh } from "next/cache";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { CHAT_FOTOS, ladeChatPersonen, ladeChatStand, type ChatBezug } from "@/lib/chat";
import { chatFotoName, erwaehnte } from "@/lib/chat-logik";
import { dateiAblegen, imHintergrund } from "@/lib/onedrive/ablage";
import { dateiTypErkennen, sharepointName } from "@/lib/onedrive/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { utcNachBerlinLokal } from "@/lib/zeit";

export type Ergebnis = { ok?: boolean; fehler?: string; hinweis?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOTO_PFAD = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/foto$/;
const FOTO_GRENZE = 15 * 1024 * 1024;
const FOTO_TYPEN = ["image/jpeg", "image/png", "image/heic"];

/** Bezug prüfen: genau ein Auftrag oder Ticket, den der Benutzer sehen darf (RLS); mit Nummer und Link */
async function bezugLaden(b: { auftrag_id?: string; ticket_id?: string }) {
  const { supabase } = await pruefeSitzung();
  if (b.auftrag_id && !b.ticket_id && UUID.test(b.auftrag_id)) {
    const { data } = await supabase.from("auftrag").select("id, nummer").eq("id", b.auftrag_id).maybeSingle();
    return data ? { bezug: { auftrag_id: data.id } as ChatBezug, nummer: data.nummer as string, link: `/auftraege/${data.id}?reiter=chat` } : null;
  }
  if (b.ticket_id && !b.auftrag_id && UUID.test(b.ticket_id)) {
    const { data } = await supabase.from("service_ticket").select("id, nummer").eq("id", b.ticket_id).maybeSingle();
    return data ? { bezug: { ticket_id: data.id } as ChatBezug, nummer: data.nummer as string, link: `/service/${data.id}?reiter=chat` } : null;
  }
  return null;
}

/** Foto Schritt 1: einmalige Upload-Adresse in den privaten Speicher (der Browser lädt direkt dorthin) */
export async function chatFotoVorbereiten(groesse: number): Promise<Ergebnis & { pfad?: string; url?: string }> {
  await pruefeSitzung();
  if (!Number.isFinite(groesse) || groesse <= 0) return { fehler: "Das Foto ist leer." };
  if (groesse > FOTO_GRENZE) return { fehler: "Das Foto ist größer als 15 MB." };
  const pfad = `${crypto.randomUUID()}/foto`;
  const { data, error } = await createAdminClient().storage.from(CHAT_FOTOS).createSignedUploadUrl(pfad);
  if (error || !data) return { fehler: "Das Foto kann gerade nicht hochgeladen werden." };
  return { ok: true, pfad, url: data.signedUrl };
}

/** Foto prüfen (Größe, Typ am Dateianfang); ungültige Dateien werden sofort entfernt */
async function fotoPruefen(pfad: string): Promise<{ inhalt: Buffer; mime: string } | { fehler: string }> {
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from(CHAT_FOTOS).download(pfad);
  if (error || !blob) return { fehler: "Das Foto ist nicht angekommen. Bitte erneut senden." };
  const inhalt = Buffer.from(await blob.arrayBuffer());
  const mime = dateiTypErkennen(inhalt.subarray(0, 16));
  if (inhalt.length > FOTO_GRENZE || !mime || !FOTO_TYPEN.includes(mime)) {
    await admin.storage.from(CHAT_FOTOS).remove([pfad]);
    return { fehler: "Erlaubt sind Fotos als JPEG, PNG oder HEIC bis 15 MB." };
  }
  return { inhalt, mime };
}

/**
 * Nachricht senden: Text und/oder Foto. Erwähnte Personen (@Kürzel) bekommen eine Benachrichtigung (Glocke). Das Foto
 * geht zusätzlich in den OneDrive-Ordner (Auftrag: „04 Auftrag“, Ticket: Ticket-Ordner).
 */
export async function nachrichtSenden(b: { auftrag_id?: string; ticket_id?: string }, text: string, fotoPfad: string | null): Promise<Ergebnis> {
  const { supabase, benutzer } = await pruefeSitzung();
  const vorgang = await bezugLaden(b);
  if (!vorgang) return { fehler: "Vorgang nicht gefunden." };
  const t = String(text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 4000);
  if (fotoPfad && !FOTO_PFAD.test(fotoPfad)) return { fehler: "Foto nicht gefunden." };
  if (!t && !fotoPfad) return { fehler: "Bitte eine Nachricht schreiben oder ein Foto wählen." };
  let foto: { inhalt: Buffer; mime: string } | null = null;
  if (fotoPfad) {
    const r = await fotoPruefen(fotoPfad);
    if ("fehler" in r) return r;
    foto = r;
  }
  const personen = await ladeChatPersonen();
  const genannt = erwaehnte(t, personen, benutzer.id);
  const { data: n, error } = await supabase
    .from("chat_nachricht")
    .insert({ ...vorgang.bezug, text: t, foto_pfad: fotoPfad, erwaehnt: genannt.map((p) => p.id) })
    .select("id, created_at")
    .single();
  if (error || !n) {
    if (fotoPfad) await createAdminClient().storage.from(CHAT_FOTOS).remove([fotoPfad]);
    return { fehler: "Die Nachricht konnte nicht gesendet werden." };
  }
  if (genannt.length) {
    const kurz = t.length > 80 ? `${t.slice(0, 80)}…` : t;
    await supabase.from("benachrichtigung").insert(
      genannt.map((p) => ({ benutzer_id: p.id, art: "erwaehnung", text: `${benutzer.name} im Chat zu ${vorgang.nummer}: „${kurz}“`, link: vorgang.link })),
    );
  }
  if (foto) {
    const ich = personen.find((p) => p.id === benutzer.id)?.kuerzel ?? null;
    const name = sharepointName(chatFotoName(utcNachBerlinLokal(n.created_at), ich, foto.mime), 150);
    const { inhalt, mime } = foto;
    const bezug = vorgang.bezug;
    imHintergrund(
      () => dateiAblegen({ bezug, unterordner: "auftrag_id" in bezug ? "04 Auftrag" : null, name, inhalt, mime, quelle: "upload" }, benutzer.id),
      "Chat-Foto",
    );
  }
  refresh();
  return { ok: true, hinweis: genannt.length ? `Benachrichtigt: ${genannt.map((p) => p.name).join(", ")}` : undefined };
}

/** Eigene Nachricht löschen (Markierung, das Foto bleibt im Speicher und in OneDrive) */
export async function nachrichtLoeschen(id: string): Promise<Ergebnis> {
  if (!UUID.test(id)) return { fehler: "Nachricht nicht gefunden." };
  const { supabase } = await pruefeSitzung();
  const { error } = await supabase.rpc("loeschen", { p_tabelle: "chat_nachricht", p_id: id });
  if (error) return { fehler: /eigene/i.test(error.message) ? "Nur eigene Nachrichten lassen sich löschen." : "Die Nachricht konnte nicht gelöscht werden." };
  refresh();
  return { ok: true };
}

/** Beim Öffnen des Reiters: alle Nachrichten gelesen, Erwähnungen dazu in der Glocke erledigt */
export async function chatGelesen(b: { auftrag_id?: string; ticket_id?: string }): Promise<Ergebnis & { neu?: number }> {
  const vorgang = await bezugLaden(b);
  if (!vorgang) return { fehler: "Vorgang nicht gefunden." };
  const { supabase, benutzer } = await pruefeSitzung();
  const bz = vorgang.bezug;
  const { data, error } = await supabase.rpc("chat_gelesen_setzen", { p_auftrag: "auftrag_id" in bz ? bz.auftrag_id : null, p_ticket: "ticket_id" in bz ? bz.ticket_id : null });
  if (error) return { fehler: "Der Lesestand konnte nicht gespeichert werden." };
  await supabase.from("benachrichtigung").update({ gelesen_am: new Date().toISOString() }).eq("benutzer_id", benutzer.id).eq("link", vorgang.link).is("gelesen_am", null);
  if (data) refresh();
  return { ok: true, neu: data as number };
}

/** Stand des Chats für die Abfrage alle 10 Sekunden: ändert sich bei jeder neuen oder gelöschten Nachricht */
export async function chatStand(b: { auftrag_id?: string; ticket_id?: string }): Promise<string> {
  const vorgang = await bezugLaden(b);
  return vorgang ? ladeChatStand(vorgang.bezug) : "";
}
