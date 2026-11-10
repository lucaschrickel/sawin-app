import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Supabase mit dem Secret Key (umgeht RLS). Nur für klar abgegrenzte Aufgaben: Benutzerverwaltung
 * (Einladen, Sperren, 2FA zurücksetzen, nur nach pruefeAdmin()) und die Lexware-Anbindung (src/lib/lexware/, nur nach
 * pruefeSitzung(), schreibt ausschließlich über die Funktionen lexware_* mit Angabe des handelnden Benutzers).
 * Sonst werden Fachdaten nie hierüber geschrieben, damit das Audit-Log den handelnden Benutzer kennt.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt (nur serverseitig setzen).");
  return createClient(supabaseEnv().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
