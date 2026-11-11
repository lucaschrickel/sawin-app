import { ereignisLesen, signaturGueltig } from "@/lib/lexware/webhook-pruefung";
import { ereignisVerarbeiten } from "@/lib/lexware/webhook";

/*
  Webhook für Lexware-Ereignisse (Event-Subscription, z. B. payment.changed). Ohne Anmeldung erreichbar (der Proxy
  lässt /api/lexware/ durch); geschützt über die RSA-Signatur von Lexware (Header X-Lxo-Signature).
  Antworten: 200 verarbeitet, ignoriert oder doppelt · 400 ungültiger Inhalt · 401 Signatur fehlt oder falsch ·
  500 Verarbeitung fehlgeschlagen (Lexware stellt dann erneut zu; der Fehler steht in lexware_ereignis).
  Lexware wartet höchstens 5 Sekunden auf die Antwort.
*/

export const maxDuration = 30;

const MAX_GROESSE = 16 * 1024;

/** Lexware prüft beim Anlegen des Abos mit HEAD, ob die Adresse erreichbar ist */
export function HEAD() {
  return new Response(null, { status: 200 });
}

export async function POST(request: Request) {
  const inhalt = await request.text();
  if (inhalt.length > MAX_GROESSE) return Response.json({ fehler: "Inhalt zu groß" }, { status: 413 });
  if (!signaturGueltig(inhalt, request.headers.get("x-lxo-signature"))) {
    console.warn("Lexware-Webhook: Signatur fehlt oder ist ungültig");
    return Response.json({ fehler: "Signatur ungültig" }, { status: 401 });
  }
  const ereignis = ereignisLesen(inhalt);
  if (!ereignis) {
    console.warn("Lexware-Webhook: Inhalt ungültig");
    return Response.json({ fehler: "Inhalt ungültig" }, { status: 400 });
  }
  try {
    const r = await ereignisVerarbeiten(ereignis);
    if (r.status === "fehler") {
      console.error(`Lexware-Webhook ${ereignis.eventType} ${ereignis.resourceId}: ${r.fehler}`);
      return Response.json({ status: r.status }, { status: 500 });
    }
    return Response.json({ status: r.status });
  } catch (x) {
    console.error(`Lexware-Webhook ${ereignis.eventType} ${ereignis.resourceId}:`, x instanceof Error ? x.message : x);
    return Response.json({ status: "fehler" }, { status: 500 });
  }
}
