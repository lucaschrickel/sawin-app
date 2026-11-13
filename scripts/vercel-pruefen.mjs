// Produktionsadresse prüfen (Go-live, docs/golive.md), nur lesend über HTTPS:
//   npm run golive:vercel                     Adresse aus SUPABASE_AUTH_SITE_URL_PROD (.env.local, Abschnitt 2)
//   npm run golive:vercel -- https://…        andere Adresse
// Prüft: Region fra1, Content-Security-Policy mit Nonce, Cache-Control private/no-store und vor allem, dass die App
// mit dem Produktionsprojekt von Supabase arbeitet (Supabase-Adresse in der CSP), nicht mit Staging.
import { existsSync } from "node:fs";
import { refAusApi } from "./testprojekt.mjs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const adresse = (process.argv[2] ?? process.env.SUPABASE_AUTH_SITE_URL_PROD ?? "").replace(/\/$/, "");
const prod = refAusApi(process.env.NEXT_PUBLIC_SUPABASE_URL_PROD ?? "");
const staging = process.env.ERLAUBTES_TESTPROJEKT?.trim();
if (!adresse.startsWith("https://")) {
  console.error("Adresse fehlt: npm run golive:vercel -- https://<produktionsadresse>");
  process.exit(1);
}
const r = await fetch(`${adresse}/anmelden`, { redirect: "manual" });
const csp = r.headers.get("content-security-policy") ?? "";
const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(csp)?.[1] ?? null;
const pruefungen = [
  ["Antwort", r.status === 200, `HTTP ${r.status}`],
  ["Region fra1", /^fra1::/.test(r.headers.get("x-vercel-id") ?? ""), r.headers.get("x-vercel-id") ?? "–"],
  ["CSP mit Nonce", /script-src[^;]*'nonce-/.test(csp), csp ? "gesetzt" : "fehlt"],
  ["Cache-Control private, no-store", /private/.test(r.headers.get("cache-control") ?? "") && /no-store/.test(r.headers.get("cache-control") ?? ""), r.headers.get("cache-control") ?? "–"],
  ["Supabase-Projekt = Produktion", !!ref && (prod ? ref === prod : ref !== staging), `${ref ?? "nicht erkennbar"}${prod ? ` (erwartet ${prod})` : ""}`],
  ["nicht Staging", !!ref && ref !== staging, ref === staging ? "zeigt auf STAGING" : "ok"],
];
let fehler = 0;
console.log(`Prüfe ${adresse}`);
for (const [name, ok, info] of pruefungen) {
  if (!ok) fehler++;
  console.log(`${ok ? "✔" : "✖"} ${name.padEnd(34)} ${info}`);
}
console.log(fehler ? `\n${fehler} Prüfung(en) nicht bestanden. Vercel-Variablen (Production) prüfen und neu bereitstellen.` : "\nProduktion arbeitet mit dem Produktionsprojekt.");
process.exitCode = fehler ? 1 : 0;
