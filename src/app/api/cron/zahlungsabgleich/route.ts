import { cronErlaubt } from "@/lib/lexware/webhook-pruefung";
import { zahlungenAbgleichen } from "@/lib/lexware/zahlungen";

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
    if (!r) return Response.json({ status: "übersprungen", grund: "Lexware nicht eingerichtet oder Abgleich läuft gerade" });
    return Response.json({ status: "ok", ...r });
  } catch (x) {
    console.error("Cron Zahlungsabgleich:", x instanceof Error ? x.message : x);
    return Response.json({ status: "fehler" }, { status: 500 });
  }
}
