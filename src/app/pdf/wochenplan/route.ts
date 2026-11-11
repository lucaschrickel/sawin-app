import { getCustomer } from "@/customers";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { wochenplanPdf } from "@/lib/pdf/wochenplan-pdf";
import { kalenderwoche, wocheAus } from "@/lib/woche";
import { ladeWochenplan } from "@/lib/wochenplan";
import { heuteBerlin, utcNachBerlinLokal } from "@/lib/zeit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Wochenplan als PDF (A4 quer): ?woche=YYYY-MM-DD (Montag oder ein Tag der Woche) und ?monteur=<id> oder ?kolonne=<id>.
 * Nur angemeldete Benutzer; die Daten liest die Datenbank mit den Rechten des Benutzers (RLS).
 */
export async function GET(request: Request) {
  await pruefeSitzung();
  const url = new URL(request.url);
  const montag = wocheAus(url.searchParams.get("woche") ?? "", heuteBerlin());
  const monteur = url.searchParams.get("monteur") ?? "";
  const kolonne = url.searchParams.get("kolonne") ?? "";
  if (!UUID.test(monteur) && !UUID.test(kolonne)) return new Response("Bitte einen Monteur oder eine Kolonne wählen.", { status: 400 });
  const plan = await ladeWochenplan(montag, UUID.test(kolonne) ? { kolonne } : { monteur });
  if (!plan) return new Response("Monteur bzw. Kolonne nicht gefunden.", { status: 404 });

  const jetzt = utcNachBerlinLokal(new Date().toISOString());
  const stand = `${jetzt.slice(8, 10)}.${jetzt.slice(5, 7)}.${jetzt.slice(0, 4)} ${jetzt.slice(11, 16)}`;
  const pdf = await wochenplanPdf(plan, getCustomer().logoPfade, stand);
  const name = `Wochenplan_KW${String(kalenderwoche(montag)).padStart(2, "0")}_${plan.titel.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
