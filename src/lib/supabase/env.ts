/** Öffentliche Supabase-Zugangsdaten (Projekt-URL ohne Pfad, Publishable Key). */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen (siehe docs/uebergabe.md).");
  }
  return { url, key };
}
