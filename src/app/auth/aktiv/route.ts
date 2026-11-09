/**
 * Aktivitäts-Ping des Browsers (höchstens alle paar Minuten bei Eingaben). proxy.ts setzt dabei den Zeitpunkt der
 * letzten Aktivität neu, damit lange Eingaben ohne Seitenwechsel nicht zur Abmeldung führen.
 */
export function POST() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
