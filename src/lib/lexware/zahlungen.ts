import "server-only";
import { after } from "next/server";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { rund } from "@/lib/beleg-summen";
import { createAdminClient } from "@/lib/supabase/admin";
import { lexwareAltbestandAktiv } from "@/lib/altbestand";
import { lexware } from "./client";
import { geldeingaenge, type LexPosten } from "./zahlung-posten";

/*
  Zahlungsstand aus Lexware (CLAUDE.md „Zahlungen“). Lexware nimmt Zahlungen über die API nicht an; die App liest:
    * Belegliste (voucherlist): offener Betrag und Status je Rechnung, Abschlag und Gutschrift
    * Zahlungsposten (/v1/payments/{id}) für Belege, deren Stand sich geändert hat
  Ausgelöst beim Öffnen von Belegen, Aufträgen und Forderungen (höchstens alle 5 Minuten, im Hintergrund nach der
  Antwort), über „Zahlungsstand abrufen“, alle 30 Minuten per Vercel-Cron (/api/cron/zahlungsabgleich) und sofort
  über den Lexware-Webhook (/api/lexware/webhook, Ereignis payment.changed).
  Geschrieben wird nur über die Datenbankfunktion lexware_zahlungen (Service-Rolle).
*/

type ZahlStand = { openAmount: number; voucherStatus: string; paymentItems: LexPosten[] };
type ListenEintrag = { id: string; voucherStatus: string; openAmount?: number; totalAmount: number };

const BEZAHLT = ["paid", "paidoff"];

/**
 * Zahlungsstand eines Belegs von Lexware holen und übernehmen. Gutschriften haben bei Lexware keine Zahlungsposten
 * („No payment information … creditnote“): offener Betrag und Status kommen aus der Belegliste bzw. der Gutschrift.
 */
export async function zahlstandHolen(b: { id: string; lexware_id: string; art: string }, benutzerId: string | null, ausListe?: ListenEintrag) {
  if (b.art === "gutschrift") {
    let offen: number;
    let status: string;
    if (ausListe) {
      status = ausListe.voucherStatus;
      offen = BEZAHLT.includes(status) ? 0 : (ausListe.openAmount ?? ausListe.totalAmount);
    } else {
      const g = await lexware<{ voucherStatus: string; totalPrice?: { totalGrossAmount?: number } }>("GET", `/v1/credit-notes/${b.lexware_id}`);
      status = g.voucherStatus;
      offen = BEZAHLT.includes(status) ? 0 : (g.totalPrice?.totalGrossAmount ?? 0);
    }
    const { error } = await createAdminClient().rpc("lexware_zahlungen", { p_beleg: b.id, p_benutzer: benutzerId, p_daten: { offen: rund(offen), status, posten: [] } });
    if (error) throw new Error(`Zahlungsstand konnte nicht gespeichert werden: ${error.message}`);
    return;
  }
  const s = await lexware<ZahlStand>("GET", `/v1/payments/${b.lexware_id}`);
  const posten = geldeingaenge(b.lexware_id, s.paymentItems ?? []);
  const { error } = await createAdminClient().rpc("lexware_zahlungen", {
    p_beleg: b.id,
    p_benutzer: benutzerId,
    p_daten: { offen: rund(s.openAmount ?? 0), status: s.voucherStatus, posten },
  });
  if (error) throw new Error(`Zahlungsstand konnte nicht gespeichert werden: ${error.message}`);
}

/**
 * Abgleich aller offenen Lexware-Belege. Höchstens alle 5 Minuten (erzwingen: sofort). Liest die Belegliste ab dem
 * Datum der ältesten offenen Forderung und holt Zahlungsposten nur, wo sich offener Betrag oder Status geändert hat.
 */
export async function zahlungenAbgleichen(benutzerId: string | null, erzwingen = false): Promise<{ geprueft: number; geaendert: number; fehler: number; ignoriert?: number } | null> {
  if (!process.env.LEXWARE_API_KEY?.trim()) return null;
  const admin = createAdminClient();
  const { data: start, error: startFehler } = await admin.rpc("lexware_abgleich_beginnen", { p_abstand: erzwingen ? "0 seconds" : "5 minutes" });
  if (startFehler) throw new Error(`Zahlungsabgleich konnte nicht beginnen: ${startFehler.message}`);
  if (!(start as { starten: boolean } | null)?.starten) return null;

  // Offene Lexware-Belege und solche mit App-Buchungen, die Lexware noch nicht gemeldet hat
  const { data: appOffen } = await admin.from("zahlung").select("beleg_id").eq("quelle", "app").eq("lex_abgleich", "offen").is("deleted_at", null);
  const mitAppBuchung = [...new Set((appOffen ?? []).map((z) => z.beleg_id as string))];
  const spalten = "id, art, datum, lexware_id, lexware_offen, status, altbestand";
  const [{ data: offen }, { data: gebucht }] = await Promise.all([
    admin.from("beleg").select(spalten).in("art", ["rechnung", "abschlagsrechnung", "gutschrift"]).eq("status", "offen").not("lexware_id", "is", null).is("deleted_at", null),
    mitAppBuchung.length ? admin.from("beleg").select(spalten).in("id", mitAppBuchung).not("lexware_id", "is", null) : Promise.resolve({ data: [] }),
  ]);
  // Übernommene Belege nur, wenn ihre Lexware-IDs zu diesem Konto gehören (LEXWARE_ALTBESTAND=aktiv)
  const altbestand = lexwareAltbestandAktiv();
  const belege = [...new Map([...(offen ?? []), ...(gebucht ?? [])].map((b) => [b.id, b])).values()].filter((b) => altbestand || !b.altbestand);
  if (!belege.length) return { geprueft: 0, geaendert: 0, fehler: 0 };
  const ab = belege.reduce((m, b) => (b.datum < m ? b.datum : m), belege[0].datum);

  const liste = new Map<string, ListenEintrag>();
  for (let seite = 0; seite < 20; seite++) {
    const r = await lexware<{ content: ListenEintrag[]; last: boolean }>(
      "GET",
      `/v1/voucherlist?voucherType=invoice,downpaymentinvoice,creditnote&voucherStatus=any&voucherDateFrom=${ab}&size=250&page=${seite}`,
    );
    for (const v of r.content) liste.set(v.id, v);
    if (r.last || !r.content.length) break;
  }

  let geaendert = 0;
  let fehler = 0;
  for (const b of belege) {
    const v = liste.get(b.lexware_id!);
    if (!v) continue;
    const lexOffen = rund(v.openAmount ?? (BEZAHLT.includes(v.voucherStatus) ? 0 : v.totalAmount));
    const bezahlt = BEZAHLT.includes(v.voucherStatus);
    if (lexOffen === rund(Number(b.lexware_offen ?? -1)) && !bezahlt) continue;
    // Ein fehlerhafter Beleg hält den Abgleich der übrigen nicht auf
    try {
      await zahlstandHolen({ id: b.id, lexware_id: b.lexware_id!, art: b.art }, benutzerId, v);
      geaendert++;
    } catch (e) {
      fehler++;
      console.error(`Zahlungsabgleich ${b.id}:`, e instanceof Error ? e.message : e);
    }
  }
  // Lexware-Belege ohne Gegenstück in der App (z. B. vor dem Go-live direkt in Lexware angelegt) bleiben unberührt:
  // kein Fehler, kein neuer Datensatz, nur ein Protokolleintrag
  const bekannt = new Set(belege.map((b) => b.lexware_id));
  const ignoriert = [...liste.keys()].filter((id) => !bekannt.has(id)).length;
  if (ignoriert) console.info(`Zahlungsabgleich: ${ignoriert} Lexware-Belege ohne Beleg in der App ignoriert`);
  return { geprueft: belege.length, geaendert, fehler, ignoriert };
}

/** Beim Öffnen einer Seite: Abgleich im Hintergrund nach der Antwort (höchstens alle 5 Minuten) */
export async function zahlungenImHintergrund() {
  if (!process.env.LEXWARE_API_KEY?.trim()) return;
  const { benutzer } = await pruefeSitzung();
  after(async () => {
    try {
      await zahlungenAbgleichen(benutzer.id);
    } catch (e) {
      console.error("Zahlungsabgleich mit Lexware:", e instanceof Error ? e.message : e);
    }
  });
}

