import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatPerson } from "./chat-logik";

/*
  Chat laden (CLAUDE.md „Chat“). Nachrichten liest die Datenbank mit den Rechten des Benutzers (RLS). Fotos liegen im
  privaten Speicher chat-fotos ohne Benutzer-Policies; angezeigt werden sie über kurzlebige signierte Adressen, die der
  Server nur für Nachrichten erzeugt, die der Benutzer lesen darf.
*/

export const CHAT_FOTOS = "chat-fotos";
export type ChatBezug = { auftrag_id: string } | { ticket_id: string };
export type ChatNachricht = {
  id: string;
  text: string;
  created_at: string;
  autor: { id: string; name: string; kuerzel: string | null };
  eigene: boolean;
  foto: string | null;
};

/** Personen mit Kürzel (aktive Benutzer mit verknüpftem Mitarbeiter): Ziele für @Erwähnungen */
export async function ladeChatPersonen(): Promise<ChatPerson[]> {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase
    .from("benutzer")
    .select("id, name, mitarbeiter:mitarbeiter_id(kuerzel)")
    .eq("aktiv", true)
    .order("name")
    .returns<{ id: string; name: string; mitarbeiter: { kuerzel: string } | null }[]>();
  return (data ?? []).filter((b) => b.mitarbeiter?.kuerzel).map((b) => ({ id: b.id, name: b.name, kuerzel: b.mitarbeiter!.kuerzel }));
}

/** Nachrichten eines Auftrags bzw. Tickets (älteste zuerst, höchstens die letzten 300) */
export async function ladeChat(b: ChatBezug): Promise<ChatNachricht[]> {
  const { supabase, benutzer } = await pruefeSitzung();
  const [spalte, wert] = Object.entries(b)[0];
  const [{ data }, { data: namen }] = await Promise.all([
    supabase.from("chat_nachricht").select("id, text, foto_pfad, created_at, autor_id").eq(spalte, wert).order("created_at", { ascending: false }).limit(300),
    supabase.from("benutzer").select("id, name, mitarbeiter:mitarbeiter_id(kuerzel)").returns<{ id: string; name: string; mitarbeiter: { kuerzel: string } | null }[]>(),
  ]);
  const zeilen = (data ?? []).reverse();
  const person = new Map((namen ?? []).map((n) => [n.id, { id: n.id, name: n.name, kuerzel: n.mitarbeiter?.kuerzel ?? null }]));
  const pfade = zeilen.map((z) => z.foto_pfad).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (pfade.length) {
    const { data: signiert } = await createAdminClient().storage.from(CHAT_FOTOS).createSignedUrls(pfade, 3600);
    for (const s of signiert ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return zeilen.map((z) => ({
    id: z.id,
    text: z.text,
    created_at: z.created_at,
    autor: person.get(z.autor_id) ?? { id: z.autor_id, name: "Unbekannt", kuerzel: null },
    eigene: z.autor_id === benutzer.id,
    foto: z.foto_pfad ? (urls.get(z.foto_pfad) ?? null) : null,
  }));
}

/** Stand des Chats (Anzahl und neueste Nachricht): ändert sich bei jeder neuen oder gelöschten Nachricht */
export async function ladeChatStand(b: ChatBezug): Promise<string> {
  const { supabase } = await pruefeSitzung();
  const [spalte, wert] = Object.entries(b)[0];
  const { data, count } = await supabase.from("chat_nachricht").select("id", { count: "exact" }).eq(spalte, wert).order("created_at", { ascending: false }).limit(1);
  return `${count ?? 0}:${data?.[0]?.id ?? ""}`;
}

/** Ungelesene Nachrichten des Benutzers je Auftrag und Ticket (für Reiter, Liste und Board) */
export async function ladeChatUngelesen(): Promise<{ auftrag: Map<string, number>; ticket: Map<string, number> }> {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.rpc("chat_ungelesen");
  const auftrag = new Map<string, number>();
  const ticket = new Map<string, number>();
  for (const z of (data ?? []) as { auftrag_id: string | null; ticket_id: string | null; anzahl: number }[]) {
    if (z.auftrag_id) auftrag.set(z.auftrag_id, z.anzahl);
    if (z.ticket_id) ticket.set(z.ticket_id, z.anzahl);
  }
  return { auftrag, ticket };
}
