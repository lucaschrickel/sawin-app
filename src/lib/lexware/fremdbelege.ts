import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lexware } from "./client";

/*
  Übergang Lexware → App (Go-live-Datum in Einstellungen › Verbindungen): Die App legt in Lexware nie Angebote,
  Auftragsbestätigungen oder Lieferscheine an. Entsteht so ein Beleg ab dem Stichtag trotzdem in Lexware, wurde er dort
  von Hand angelegt; das Dashboard weist darauf hin. Nur lesend (Belegliste), höchstens alle 30 Minuten (Cron und Dashboard).
*/

export type Fremdbeleg = { id: string; typ: "quotation" | "orderconfirmation" | "deliverynote"; nummer: string | null; datum: string; kontakt: string | null };
export const FREMD_TYP_TEXT: Record<Fremdbeleg["typ"], string> = { quotation: "Angebot", orderconfirmation: "Auftragsbestätigung", deliverynote: "Lieferschein" };

type Eintrag = { id: string; voucherType: string; voucherNumber?: string; voucherDate: string; contactName?: string };

export async function fremdbelegePruefen(erzwingen = false): Promise<Fremdbeleg[] | null> {
  if (!process.env.LEXWARE_API_KEY?.trim()) return null;
  const admin = createAdminClient();
  const { data: e } = await admin.from("einstellung").select("id, golive_datum, lexware_fremdbelege_am").eq("einzig", true).maybeSingle();
  if (!e) return null;
  if (!e.golive_datum) {
    await admin.from("einstellung").update({ lexware_fremdbelege: [], lexware_fremdbelege_am: null }).eq("id", e.id);
    return [];
  }
  if (!erzwingen && e.lexware_fremdbelege_am && Date.now() - Date.parse(e.lexware_fremdbelege_am) < 30 * 60_000) return null;
  const liste: Fremdbeleg[] = [];
  for (let seite = 0; seite < 20; seite++) {
    const r = await lexware<{ content: Eintrag[]; last: boolean }>(
      "GET",
      `/v1/voucherlist?voucherType=quotation,orderconfirmation,deliverynote&voucherStatus=any&voucherDateFrom=${e.golive_datum}&size=250&page=${seite}`,
    );
    for (const v of r.content) liste.push({ id: v.id, typ: v.voucherType as Fremdbeleg["typ"], nummer: v.voucherNumber ?? null, datum: v.voucherDate.slice(0, 10), kontakt: v.contactName ?? null });
    if (r.last || !r.content.length) break;
  }
  await admin.from("einstellung").update({ lexware_fremdbelege: liste, lexware_fremdbelege_am: new Date().toISOString() }).eq("id", e.id);
  return liste;
}

/** Beim Öffnen des Dashboards: im Hintergrund nach der Antwort prüfen (höchstens alle 30 Minuten) */
export function fremdbelegeImHintergrund() {
  after(async () => {
    try {
      await fremdbelegePruefen();
    } catch (x) {
      console.error("Lexware-Fremdbelege:", x instanceof Error ? x.message : x);
    }
  });
}
