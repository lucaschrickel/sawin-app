import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { LexwareFehler } from "./client";
import { ereignisSchluessel, ZAHLUNGS_EREIGNISSE, type LexwareEreignis } from "./webhook-pruefung";
import { zahlstandHolen } from "./zahlungen";

/*
  Verarbeitung eines Lexware-Ereignisses (Webhook, CLAUDE.md „Zahlungen“). Eingang und Ergebnis stehen in der Tabelle
  lexware_ereignis; eine Doppelzustellung wird erkannt und nicht noch einmal verarbeitet. Zahlungsereignisse holen den
  Zahlungsstand des betroffenen Belegs (wie der Abgleich), alle anderen werden als „ignoriert“ protokolliert.
*/

export type WebhookErgebnis = { status: "verarbeitet" | "ignoriert" | "doppelt" | "fehler"; fehler?: string };

export async function ereignisVerarbeiten(e: LexwareEreignis): Promise<WebhookErgebnis> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("lexware_ereignis_eingang", {
    p_schluessel: ereignisSchluessel(e),
    p_ereignis: e.eventType,
    p_ressource: e.resourceId,
    p_am: e.eventDate,
    p_organisation: e.organizationId,
  });
  if (error) throw new Error(`Eingang konnte nicht protokolliert werden: ${error.message}`);
  const eingang = data as { id: string; verarbeiten: boolean; status: string };
  if (!eingang.verarbeiten) return { status: "doppelt" };

  const ende = async (status: "verarbeitet" | "ignoriert" | "fehler", fehler: string | null = null) => {
    const { error: f } = await admin.rpc("lexware_ereignis_ende", { p_id: eingang.id, p_status: status, p_fehler: fehler });
    if (f) console.error("Lexware-Webhook: Ergebnis nicht gespeichert:", f.message);
  };

  try {
    if (!ZAHLUNGS_EREIGNISSE.includes(e.eventType)) {
      await ende("ignoriert", `Ereignis ${e.eventType} wird nicht ausgewertet`);
      return { status: "ignoriert" };
    }
    const { data: beleg } = await admin
      .from("beleg")
      .select("id, lexware_id, art")
      .eq("lexware_id", e.resourceId)
      .in("art", ["rechnung", "abschlagsrechnung", "gutschrift"])
      .is("deleted_at", null)
      .maybeSingle();
    if (!beleg?.lexware_id) {
      await ende("ignoriert", "Kein Beleg der App zu dieser Lexware-ID");
      return { status: "ignoriert" };
    }
    try {
      await zahlstandHolen({ id: beleg.id, lexware_id: beleg.lexware_id, art: beleg.art }, null);
    } catch (x) {
      // 406: Beleg ist in Lexware (wieder) Entwurf, laut Doku kein Fehler; 404: in Lexware gelöscht
      if (x instanceof LexwareFehler && (x.status === 406 || x.status === 404)) {
        await ende("ignoriert", `Lexware ${x.status}: kein Zahlungsstand`);
        return { status: "ignoriert" };
      }
      throw x;
    }
    await ende("verarbeitet");
    return { status: "verarbeitet" };
  } catch (x) {
    const meldung = x instanceof Error ? x.message : String(x);
    await ende("fehler", meldung);
    return { status: "fehler", fehler: meldung };
  }
}
