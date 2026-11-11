// Lexware-Webhook (Event-Subscription) anlegen, anzeigen und löschen. Der API-Schlüssel kommt aus .env.local bzw. der
// Umgebung (LEXWARE_API_KEY) und erscheint nie in der Ausgabe. Staging: nur das eigene Lexware-Testkonto.
//   npm run lexware:webhook -- liste
//   npm run lexware:webhook -- anlegen https://<app-adresse>/api/lexware/webhook
//   npm run lexware:webhook -- loeschen <subscriptionId>
//   npm run lexware:webhook -- konto            (zeigt, mit welchem Lexware-Konto der Schlüssel verbunden ist)
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const schluessel = process.env.LEXWARE_API_KEY?.trim();
if (!schluessel) {
  console.error("LEXWARE_API_KEY fehlt (in .env.local oder als Umgebungsvariable setzen).");
  process.exit(1);
}
const EREIGNISSE = ["payment.changed", "invoice.status.changed", "credit-note.status.changed"];

async function api(methode, pfad, body) {
  const r = await fetch(`https://api.lexware.io${pfad}`, {
    method: methode,
    headers: { Authorization: `Bearer ${schluessel}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  await new Promise((ok) => setTimeout(ok, 600)); // höchstens 2 Anfragen pro Sekunde
  return { status: r.status, daten: text ? JSON.parse(text) : null };
}

const [befehl, wert] = process.argv.slice(2);
if (befehl === "konto") {
  const { status, daten } = await api("GET", "/v1/profile");
  if (status !== 200) throw new Error(`Lexware ${status}`);
  console.log(`Firma: ${daten.companyName} · Organisation: ${daten.organizationId}`);
} else if (befehl === "liste") {
  const { daten } = await api("GET", "/v1/event-subscriptions");
  const liste = daten?.content ?? [];
  if (!liste.length) console.log("Keine Event-Subscriptions.");
  for (const s of liste) console.log(`${s.subscriptionId}  ${s.eventType.padEnd(28)} ${s.callbackUrl}  (seit ${s.createdDate})`);
} else if (befehl === "anlegen") {
  if (!wert || !/^https:\/\/[^/]+\/api\/lexware\/webhook(\?.*)?$/.test(wert)) {
    console.error("Adresse fehlt oder falsch. Erwartet: https://<app-adresse>/api/lexware/webhook");
    process.exit(1);
  }
  for (const eventType of EREIGNISSE) {
    const { status, daten } = await api("POST", "/v1/event-subscriptions", { eventType, callbackUrl: wert });
    if (status === 201 || status === 200) console.log(`angelegt: ${eventType} (${daten?.id ?? daten?.subscriptionId ?? ""})`);
    else if (status === 409) console.log(`besteht schon: ${eventType}`);
    else if (status === 406) console.log(`abgelehnt: ${eventType} – Lexware erreicht die Adresse nicht (HEAD-Prüfung). Ist die App unter dieser Adresse ohne Vercel-Schutz erreichbar?`);
    else console.log(`Fehler ${status} bei ${eventType}: ${JSON.stringify(daten)}`);
  }
} else if (befehl === "loeschen") {
  if (!wert) {
    console.error("subscriptionId fehlt (siehe „liste“).");
    process.exit(1);
  }
  const { status } = await api("DELETE", `/v1/event-subscriptions/${encodeURIComponent(wert)}`);
  console.log(status === 204 ? "gelöscht" : `Lexware ${status}`);
} else {
  console.log("Befehle: konto | liste | anlegen <https://…/api/lexware/webhook> | loeschen <subscriptionId>");
}
