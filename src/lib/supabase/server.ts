import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { authCookieOptionen, supabaseEnv } from "./env";

/**
 * Supabase-Client für Server-Komponenten, Server-Aktionen und Route-Handler. Arbeitet mit der Sitzung des
 * angemeldeten Benutzers; die Datenbank prüft jede Abfrage per RLS.
 * `connection()`: alles mit Sitzung wird pro Anfrage gerendert, nie vorab (Cache Components, Prefetching).
 */
export async function createClient() {
  await connection();
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    // secure: in Produktion immer (HTTPS); lokal mit next dev über HTTP ohne
    cookieOptions: authCookieOptionen(process.env.NODE_ENV === "production"),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // In Server-Komponenten lassen sich keine Cookies setzen; die Sitzung erneuert proxy.ts.
        }
      },
    },
  });
}
