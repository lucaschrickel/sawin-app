// Harte Sperre für Tests und Testskripte: Sie laufen nur gegen das erlaubte Supabase-Testprojekt (Staging).
//
// Geprüft wird das Projekt aus BEIDEN Zugängen, weil Tests über die API (NEXT_PUBLIC_SUPABASE_URL) und über die
// Datenbank (SUPABASE_DB_URL) schreiben: Die Projekt-Referenz (ref) beider Adressen muss gleich ERLAUBTES_TESTPROJEKT
// sein. Fehlt die Variable oder passt eine Adresse nicht, bricht der Lauf ab, bevor etwas geschrieben wird.
// ERLAUBTES_TESTPROJEKT steht nur in der lokalen .env.local (Staging-Ref), nie in .env.produktion.

/** Projekt-Ref aus der API-Adresse (https://<ref>.supabase.co) */
export function refAusApi(url) {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  } catch {
    return null;
  }
}

/**
 * Projekt-Ref aus der Datenbank-Adresse: Pooler (postgres.<ref>@…pooler.supabase.com) oder direkte Verbindung
 * (…@db.<ref>.supabase.co).
 */
export function refAusDb(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const direkt = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host);
    if (direkt) return direkt[1];
    if (host.endsWith(".pooler.supabase.com")) {
      const benutzer = decodeURIComponent(u.username);
      const m = /^[a-z_]+\.([a-z0-9]+)$/.exec(benutzer);
      return m ? m[1] : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Prüft die Umgebung; liefert die Ref oder einen Fehlertext (ohne Geheimnisse)
 * @param {Record<string, string | undefined>} [env]
 */
export function testprojektPruefen(env = process.env) {
  const erlaubt = env.ERLAUBTES_TESTPROJEKT?.trim();
  if (!erlaubt) return { fehler: "ERLAUBTES_TESTPROJEKT fehlt (Ref des Staging-Projekts in .env.local eintragen)." };
  const api = refAusApi(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const db = env.SUPABASE_DB_URL ? refAusDb(env.SUPABASE_DB_URL) : erlaubt;
  if (api !== erlaubt) return { fehler: `NEXT_PUBLIC_SUPABASE_URL zeigt nicht auf das erlaubte Testprojekt (${api ?? "unbekannt"}).` };
  if (db !== erlaubt) return { fehler: `SUPABASE_DB_URL zeigt nicht auf das erlaubte Testprojekt (${db ?? "unbekannt"}).` };
  return { ref: erlaubt };
}

/**
 * Bricht ab, wenn die Umgebung nicht das erlaubte Testprojekt ist (für Tests und Testskripte)
 * @param {Record<string, string | undefined>} [env]
 */
export function nurTestprojekt(env = process.env) {
  const r = testprojektPruefen(env);
  if (r.fehler) {
    console.error(`Abbruch (nur gegen das Testprojekt): ${r.fehler}`);
    process.exit(1);
  }
  return r.ref;
}
