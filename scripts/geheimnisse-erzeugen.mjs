// Neue Zufallswerte für Vercel „Production“ erzeugen (Go-live, docs/golive.md):
//   npm run golive:geheimnisse
// Zeigt CRON_SECRET und MS_TOKEN_SCHLUESSEL genau einmal hier im Terminal an. Nichts wird gespeichert oder
// protokolliert: Werte direkt in Vercel › Settings › Environment Variables (Production, „Sensitive“) eintragen und das
// Terminal danach leeren. Erneut ausführen erzeugt neue Werte.
import { randomBytes } from "node:crypto";

if (!process.stdout.isTTY) {
  console.error("Bitte direkt im Terminal ausführen (die Werte sollen nicht in eine Datei oder ein Protokoll gelangen).");
  process.exit(1);
}
console.log("Neue Werte für Vercel › Production (je als „Sensitive“ anlegen):\n");
console.log(`CRON_SECRET=${randomBytes(32).toString("hex")}`);
console.log(`MS_TOKEN_SCHLUESSEL=${randomBytes(32).toString("base64")}`);
console.log("\nDanach das Terminal leeren (cls bzw. clear). Preview behält seine eigenen Werte.");
