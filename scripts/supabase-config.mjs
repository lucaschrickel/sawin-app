// Auth-Einstellungen aus supabase/config.toml prüfen oder einspielen (Management-API der Supabase CLI).
// Beispiele: npm run auth:diff · npm run auth:push · npm run auth:push -- --ohne-vorlagen
// Braucht in .env.local: SUPABASE_ACCESS_TOKEN (persönliches Token), SUPABASE_AUTH_SITE_URL (Adresse der App),
// NEXT_PUBLIC_SUPABASE_URL (daraus die Projekt-Referenz).
//
// --ohne-vorlagen: spielt alles außer den E-Mail-Vorlagen ein. Nötig, solange ein Projekt im kostenlosen Tarif den
// eingebauten E-Mail-Versand nutzt (Supabase erlaubt dann keine eigenen Vorlagen). config.toml bleibt unverändert.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const fehlt = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_AUTH_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL"].filter((k) => !process.env[k]);
if (fehlt.length) {
  console.error(`Fehlt in .env.local: ${fehlt.join(", ")} (siehe docs/uebergabe.md).`);
  process.exit(1);
}
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const args = process.argv.slice(2);
const ohneVorlagen = args.includes("--ohne-vorlagen");
const [befehl, ...rest] = args.filter((a) => a !== "--ohne-vorlagen");

let workdir = null;
if (ohneVorlagen) {
  // Kopie der Konfiguration ohne die Abschnitte [auth.email.template.*]
  workdir = mkdtempSync(path.join(os.tmpdir(), "supabase-config-"));
  mkdirSync(path.join(workdir, "supabase"));
  const toml = readFileSync("supabase/config.toml", "utf8").replace(/^\[auth\.email\.template\.[^\]]+\]\n(?:(?!\[)[^\n]*\n)*/gm, "");
  writeFileSync(path.join(workdir, "supabase", "config.toml"), toml);
  cpSync("supabase/templates", path.join(workdir, "supabase", "templates"), { recursive: true });
}

const cli = path.resolve("node_modules/supabase/dist/supabase.js");
const result = spawnSync(
  process.execPath,
  [cli, "config", befehl, `--remote=${ref}`, ...(workdir ? ["--workdir", workdir] : []), ...rest],
  { stdio: "inherit", env: process.env },
);
if (workdir) rmSync(workdir, { recursive: true, force: true });
process.exit(result.status ?? 1);
