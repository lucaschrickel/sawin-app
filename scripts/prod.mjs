// Einen Befehl einmalig gegen die PRODUKTION ausführen (Go-live, docs/golive.md).
//
//   node scripts/prod.mjs npm run db:push
//   node scripts/prod.mjs node scripts/airtable-import.mjs --nur-kunden
//   node scripts/prod.mjs node scripts/benutzer-anlegen.mjs --email=… --name="Vorname Nachname" --admin
//
// Setzt für den Aufruf die Werte aus Abschnitt 2 von .env.local (…_PROD) unter den üblichen Namen und LEERT alle
// übrigen Zugänge (Lexware, Microsoft Graph, Publishable Key, Testprojekt), damit nie ein Staging-Wert in einen
// Produktionslauf gerät. Bricht ab, wenn API- und Datenbank-Adresse nicht zum selben Projekt gehören oder auf das
// Staging-Projekt (ERLAUBTES_TESTPROJEKT) zeigen. Nennt vor dem Start die Projekt-Ref. Gibt keine Werte aus.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { refAusApi, refAusDb } from "./testprojekt.mjs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const e = process.env;
const abbruch = (t) => {
  console.error(`Abbruch: ${t}`);
  process.exit(1);
};
const befehl = process.argv.slice(2);
if (!befehl.length) abbruch("Befehl fehlt, z. B. node scripts/prod.mjs npm run db:push");

const url = e.NEXT_PUBLIC_SUPABASE_URL_PROD?.trim();
const db = e.SUPABASE_DB_URL_PROD?.trim();
if (!url || !db) abbruch("NEXT_PUBLIC_SUPABASE_URL_PROD und SUPABASE_DB_URL_PROD fehlen in .env.local (Abschnitt 2).");
const ref = refAusApi(url);
if (!ref || ref !== refAusDb(db)) abbruch("API- und Datenbank-Adresse gehören nicht zum selben Supabase-Projekt.");
if (ref === e.ERLAUBTES_TESTPROJEKT?.trim()) abbruch("Die Produktions-Einträge zeigen auf das Staging-Projekt.");

const env = {
  ...e,
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_DB_URL: db,
  SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY_PROD?.trim() ?? "",
  SUPABASE_AUTH_SITE_URL: e.SUPABASE_AUTH_SITE_URL_PROD?.trim() ?? "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_PROD?.trim() ?? "",
  // Sawins Lexware nur, wenn ausdrücklich eingetragen (sonst leer: kein Zugriff auf irgendein Lexware)
  LEXWARE_API_KEY: e.LEXWARE_API_KEY_PROD?.trim() ?? "",
  MS_GRAPH_TENANT_ID: "",
  MS_GRAPH_CLIENT_ID: "",
  MS_GRAPH_CLIENT_SECRET: "",
  MS_TOKEN_SCHLUESSEL: "",
  CRON_SECRET: "",
  ERLAUBTES_TESTPROJEKT: "",
  LEXWARE_ALTBESTAND: "",
  ONEDRIVE_ALTBESTAND: "",
  GOLIVE_PRODUKTION: "1",
};
console.log(`Ziel: PRODUKTION, Supabase-Projekt ${ref}`);
// node direkt (Argumente mit Leerzeichen bleiben erhalten); npm unter Windows nur über die Shell (npm.cmd)
const r =
  befehl[0] === "node"
    ? spawnSync(process.execPath, befehl.slice(1), { stdio: "inherit", env })
    : spawnSync(befehl[0], befehl.slice(1), { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
