import { cronErlaubt } from "@/lib/lexware/webhook-pruefung";
import { nachladen } from "@/lib/onedrive/ablage";

/*
  Vercel-Cron (vercel.json): wartende Ordner anlegen und zwischengespeicherte Dateien nach OneDrive übertragen.
  Nur mit „Authorization: Bearer <CRON_SECRET>“, sonst 401. Im Audit-Log steht die Service-Rolle (System).
*/

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronErlaubt(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ fehler: "Nicht berechtigt" }, { status: 401 });
  }
  try {
    const r = await nachladen(100);
    return Response.json({ status: r.verbunden ? "ok" : "nicht verbunden", ...r });
  } catch (x) {
    console.error("Cron Ablage:", x instanceof Error ? x.message : x);
    return Response.json({ status: "fehler" }, { status: 500 });
  }
}
