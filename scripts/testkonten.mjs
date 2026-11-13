// Testkonten (e2e-…@example.com, rls-test-…@example.com) im Testprojekt entfernen: Benutzer, ihre Einstellungen und das
// Auth-Konto samt Sitzungen und Refresh-Tokens. Nur im erlaubten Testprojekt (scripts/testprojekt.mjs).
//
//   npm run test:aufraeumen                 Testkonten älter als 2 Stunden (laufende Tests bleiben unberührt)
//   npm run test:aufraeumen -- --alle       alle Testkonten
//
// Die Browser- und RLS-Tests rufen testkontenEntfernen() beim Start selbst auf (Reste abgebrochener Läufe).

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { nurTestprojekt } from "./testprojekt.mjs";

/** Muster der Testkonten; echte Benutzer haben nie eine Adresse @example.com */
export const TESTKONTO = "^(e2e|rls-test)-[a-z0-9-]+@example\\.com$";

/**
 * Entfernt Testkonten, die älter als `minuten` sind. Liefert die Anzahl. Fehler einzelner Konten werden gemeldet,
 * brechen aber nicht ab.
 */
export async function testkontenEntfernen({ minuten = 120 } = {}) {
  nurTestprojekt();
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  let ids = [];
  try {
    const { rows } = await db.query(
      "select id from auth.users where email ~ $1 and created_at < now() - make_interval(mins => $2)",
      [TESTKONTO, minuten],
    );
    ids = rows.map((r) => r.id);
    for (const id of ids) {
      await db.query("delete from public.benutzer_einstellung where benutzer_id = $1", [id]);
      await db.query("delete from public.benutzer where id = $1", [id]).catch((e) => console.error(`Testkonto ${id}: ${e.message}`));
    }
  } finally {
    await db.end();
  }
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let entfernt = 0;
  for (const id of ids) {
    // Löscht auch Sitzungen, Refresh-Tokens und MFA-Faktoren des Kontos
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) console.error(`Testkonto ${id} nicht gelöscht: ${error.message}`);
    else entfernt++;
  }
  return entfernt;
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)).toLowerCase() === path.resolve(process.argv[1]).toLowerCase()) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const n = await testkontenEntfernen({ minuten: process.argv.includes("--alle") ? 0 : 120 });
  console.log(`${n} Testkonten entfernt.`);
}
