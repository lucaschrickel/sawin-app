import { NextResponse, type NextRequest } from "next/server";
import { LINK_COOKIE, nochAktiv } from "@/lib/auth/aktivitaet";
import { AKTIV_COOKIE, ANMELDE_GRUENDE } from "@/lib/auth/konstanten";
import { createClient } from "@/lib/supabase/server";

/**
 * Abmelden (Knopf in der Seitenleiste per POST, automatische Abmeldung und gesperrter Zugang per GET).
 * Beendet die Sitzung, löscht Cache und Speicher des Browsers für die App und leitet auf /anmelden mit Hinweis um.
 *
 * Eine aktive Sitzung beendet nur ein Aufruf von derselben Herkunft (kein Abmelden über einen Link oder ein Formular
 * einer fremden Seite): GET nur bei Sec-Fetch-Site same-origin oder none (direkt eingegeben), POST nur mit eigenem
 * Origin. Eine schon abgelaufene Sitzung (Umleitung des Proxys) wird immer beendet, sonst entstünde eine Schleife.
 */
function vonHier(request: NextRequest): boolean {
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    return !!origin && origin === request.nextUrl.origin;
  }
  const seite = request.headers.get("sec-fetch-site");
  if (seite) return seite === "same-origin" || seite === "none";
  // Ältere Browser ohne Fetch-Metadaten: nur mit eigenem Referer
  try {
    return new URL(request.headers.get("referer") ?? "").origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

async function abmelden(request: NextRequest) {
  const supabase = await createClient();
  if (!vonHier(request)) {
    const { data } = await supabase.auth.getClaims();
    const sitzung = typeof data?.claims?.session_id === "string" ? data.claims.session_id : undefined;
    if (await nochAktiv(request.cookies.get(AKTIV_COOKIE)?.value, sitzung)) return NextResponse.redirect(new URL("/", request.url), 303);
  }
  await supabase.auth.signOut({ scope: "local" });
  const grund = request.nextUrl.searchParams.get("grund");
  const ziel = new URL("/anmelden", request.url);
  ziel.searchParams.set("grund", grund && Object.hasOwn(ANMELDE_GRUENDE, grund) ? grund : "abgemeldet");
  const response = NextResponse.redirect(ziel, 303);
  response.cookies.delete(AKTIV_COOKIE);
  response.cookies.delete(LINK_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  // Zwischengespeicherte Seiten und Browser-Speicher der App löschen (Darstellung lädt die App nach der Anmeldung neu)
  response.headers.set("Clear-Site-Data", '"cache", "storage"');
  return response;
}

export const GET = abmelden;
export const POST = abmelden;
