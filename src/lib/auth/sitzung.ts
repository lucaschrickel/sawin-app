import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { nochAktiv } from "./aktivitaet";
import { AKTIV_COOKIE } from "./konstanten";

export type Benutzer = {
  id: string;
  name: string;
  email: string;
  admin: boolean;
  konditionen: boolean;
  aktiv: boolean;
  dashboard_start: "gf" | "montage" | "einkauf";
};

/**
 * Zentrale Prüfung für jede App-Seite und jede Server-Aktion (Data Access Layer):
 * angemeldet, zweiter Faktor bestätigt (aal2), nicht länger als INAKTIV_MINUTEN untätig (Aktivitäts-Cookie, an die
 * Sitzung gebunden; zusätzlich zum Proxy, der nicht jeden Pfad sieht) und aktives Benutzerkonto. Sonst Umleitung.
 * Die Datenbank prüft dieselben Bedingungen zusätzlich per RLS.
 */
export const pruefeSitzung = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/anmelden");

  if (claims.aal !== "aal2") {
    const { data: faktoren } = await supabase.auth.mfa.listFactors();
    redirect(faktoren?.totp?.some((f) => f.status === "verified") ? "/anmelden/code" : "/anmelden/einrichten");
  }
  const sitzung = typeof claims.session_id === "string" ? claims.session_id : undefined;
  if (!(await nochAktiv((await cookies()).get(AKTIV_COOKIE)?.value, sitzung))) redirect("/abmelden?grund=inaktiv");

  // Liefert nur bei aktivem Konto eine Zeile (RLS: app.ist_benutzer)
  const { data: benutzer } = await supabase
    .from("benutzer")
    .select("id, name, email, admin, konditionen, aktiv, dashboard_start")
    .eq("id", claims.sub)
    .maybeSingle<Benutzer>();
  if (!benutzer) redirect("/abmelden?grund=gesperrt");

  return { supabase, benutzer };
});

/** Wie pruefeSitzung, zusätzlich nur für Admins. */
export async function pruefeAdmin() {
  const sitzung = await pruefeSitzung();
  if (!sitzung.benutzer.admin) redirect("/");
  return sitzung;
}

/**
 * Für die Anmeldeschritte: Sitzung mit Passwort (aal1) und Stand der Faktoren, ohne Benutzerprüfung.
 */
export async function anmeldeStand() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { supabase, angemeldet: false as const };
  const { data: faktoren } = await supabase.auth.mfa.listFactors();
  const verifiziert = faktoren?.totp?.find((f) => f.status === "verified") ?? null;
  return {
    supabase,
    angemeldet: true as const,
    id: data.claims.sub as string,
    aal: data.claims.aal as string | undefined,
    email: data.claims.email as string | undefined,
    sitzung: typeof data.claims.session_id === "string" ? data.claims.session_id : undefined,
    faktor: verifiziert,
    offeneFaktoren: (faktoren?.all ?? []).filter((f) => f.status !== "verified"),
  };
}
