// Führt Supabase-CLI-Befehle gegen die Datenbank aus SUPABASE_DB_URL aus (Staging bzw. Produktion).
// Die Verbindungszeichenkette kommt aus .env.local oder der Umgebung und läuft nicht über die Shell.
// Beispiele: npm run db:push:dry · npm run db:push · npm run db:status
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL fehlt (in .env.local oder als Umgebungsvariable setzen, siehe docs/uebergabe.md).");
  process.exit(1);
}

const cli = "node_modules/supabase/dist/supabase.js";
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2), `--remote=${url}`], { stdio: "inherit" });
process.exit(result.status ?? 1);
