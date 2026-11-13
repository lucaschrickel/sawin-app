import { cronErlaubt } from "@/lib/lexware/webhook-pruefung";
import { zahlungenAbgleichen } from "@/lib/lexware/zahlungen";
import { fremdbelegePruefen } from "@/lib/lexware/fremdbelege";

/*
  Vercel-Cron (vercel.json): Zahlungsstand aller offenen Lexware-Belege abgleichen. Vercel schickt
  „Authorization: Bearer <CRON_SECRET>“; ohne gesetztes oder mit falschem Geheimnis antwortet der Endpunkt 401.
  Ohne Anmeldung erreichbar (der Proxy lässt /api/cron/ durch). Im Audit-Log steht die Service-Rolle (System).
*/

export const maxDuration = 120;

export async function GET(request: Request) {
  if (!cronErlaubt(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ fehler: "Nicht berechtigt" }, { status: 401 });
  }
  try {
    const r = await zahlungenAbgleichen(null, true);
    // Übergang: Angebote, ABs und Lieferscheine, die nach dem Stichtag direkt in Lexware entstanden sind (nur lesend)
    const fremd = await fremdbelegePruefen(true).catch((x) => (console.error("Cron Fremdbelege:", x instanceof Error ? x.message : x), null));
    if (!r) return Response.json({ status: "übersprungen", grund: "Lexware nicht eingerichtet oder Abgleich läuft gerade", fremdbelege: fremd?.length ?? null });
    return Response.json({ status: "ok", ...r, fremdbelege: fremd?.length ?? null });
  } catch (x) {
    console.error("Cron Zahlungsabgleich:", x instanceof Error ? x.message : x);
    return Response.json({ status: "fehler" }, { status: 500 });
  }
}
