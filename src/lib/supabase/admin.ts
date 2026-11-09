import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Supabase mit dem Secret Key (umgeht RLS). Nur für klar abgegrenzte Aufgaben der Benutzerverwaltung
 * (Einladen, Sperren, 2FA zurücksetzen) und nur nach erfolgreicher Prüfung mit pruefeAdmin().
 * Fachdaten werden nie hierüber geschrieben, damit das Audit-Log den handelnden Benutzer kennt.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt (nur serverseitig setzen).");
  return createClient(supabaseEnv().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
