// Produktions-Einträge aus .env.local leeren (Abschnitt 2: alle …_PROD und SUPABASE_DB_URL_RESTORE), nach dem Go-live
// bzw. nach dem Einspielen:
//   npm run golive:prod-entfernen
// Die Einträge bleiben als leere Platzhalter stehen; alle anderen Werte bleiben unverändert. Gibt nur Namen aus.
import { readFileSync, writeFileSync } from "node:fs";

const datei = ".env.local";
const roh = readFileSync(datei, "utf8");
const nl = roh.includes("\r\n") ? "\r\n" : "\n";
const geleert = [];
const zeilen = roh.split(/\r?\n/).map((z) => {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(z);
  if (m && (m[1].endsWith("_PROD") || m[1] === "SUPABASE_DB_URL_RESTORE") && m[2].trim()) {
    geleert.push(m[1]);
    return `${m[1]}=`;
  }
  return z;
});
writeFileSync(datei, zeilen.join(nl));
console.log(geleert.length ? `Geleert: ${geleert.join(", ")}` : "Keine Produktions-Einträge mit Wert gefunden.");
