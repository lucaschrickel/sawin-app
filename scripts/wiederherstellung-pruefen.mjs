// Wiederherstellungstest prüfen (docs/uebergabe.md, „Backup und Wiederherstellungstest“), nur lesend:
// Vergleicht die Zeilenzahl jeder Tabelle (public, app, audit) und die Zahl der Dateien je Speicher zwischen der
// Produktion und dem wiederhergestellten Testprojekt.
//   npm run backup:pruefen
// Liest SUPABASE_DB_URL_PROD und SUPABASE_DB_URL_RESTORE aus .env.local (Abschnitt 2, danach wieder löschen).
// Bricht ab, wenn das Testprojekt die Produktion oder Staging ist.
import { existsSync } from "node:fs";
import pg from "pg";
import { refAusDb } from "./testprojekt.mjs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const prodUrl = process.env.SUPABASE_DB_URL_PROD, testUrl = process.env.SUPABASE_DB_URL_RESTORE;
if (!prodUrl || !testUrl) {
  console.error("SUPABASE_DB_URL_PROD und SUPABASE_DB_URL_RESTORE (Testprojekt der Wiederherstellung) in .env.local eintragen.");
  process.exit(1);
}
const prodRef = refAusDb(prodUrl), testRef = refAusDb(testUrl);
if (!testRef || testRef === prodRef || testRef === process.env.ERLAUBTES_TESTPROJEKT?.trim()) {
  console.error("Das Testprojekt der Wiederherstellung muss ein eigenes Projekt sein (nicht Produktion, nicht Staging).");
  process.exit(1);
}

async function zaehlen(url) {
  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const { rows: tabellen } = await db.query(
      "select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname in ('public', 'app', 'audit') order by 1",
    );
    const z = {};
    for (const { t } of tabellen) z[t] = (await db.query(`select count(*)::int as n from ${t.split(".").map((x) => pg.escapeIdentifier(x)).join(".")}`)).rows[0].n;
    for (const r of (await db.query("select bucket_id, count(*)::int as n from storage.objects group by 1")).rows) z[`speicher:${r.bucket_id}`] = r.n;
    return z;
  } finally {
    await db.end();
  }
}

console.log(`Produktion ${prodRef} ↔ Wiederherstellung ${testRef}`);
const [p, t] = await Promise.all([zaehlen(prodUrl), zaehlen(testUrl)]);
let abweichend = 0;
for (const k of [...new Set([...Object.keys(p), ...Object.keys(t)])].sort()) {
  const gleich = p[k] === t[k];
  if (!gleich) abweichend++;
  if (!gleich || p[k]) console.log(`${gleich ? "✔" : "✖"} ${k.padEnd(40)} ${String(p[k] ?? "–").padStart(7)} ${String(t[k] ?? "–").padStart(7)}`);
}
console.log(abweichend ? `\n${abweichend} Abweichung(en). Zeitpunkt der Wiederherstellung und Änderungen danach berücksichtigen.` : "\nAlle Tabellen vollständig wiederhergestellt.");
console.log("Hinweis: Dateien im Speicher (Beleg-PDFs) stellt eine Datenbank-Wiederherstellung nicht wieder her; die Zahl oben sind nur ihre Einträge.");
process.exitCode = abweichend ? 1 : 0;
