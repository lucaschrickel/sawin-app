import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { aktivCookie, aktivWert, nochAktiv } from "@/lib/auth/aktivitaet";
import { AKTIV_COOKIE, istAnmeldeSchritt, istMaschinenPfad, istOeffentlich } from "@/lib/auth/konstanten";
import { authCookieOptionen } from "@/lib/supabase/env";

/**
 * Läuft vor jeder Anfrage:
 * 1. erneuert die Supabase-Sitzung in den Cookies (nötig für Server-Komponenten),
 * 2. leitet ohne Sitzung schnell auf /anmelden um (nur eine Vorprüfung; geschützt wird über pruefeSitzung()
 *    auf dem Server und RLS in der Datenbank),
 * 3. meldet nach INAKTIV_MINUTEN ohne Anfrage ab. Das Aktivitäts-Cookie ist an die Sitzung gebunden (signiert); fehlt
 *    es bei einer bestehenden Sitzung (Browser war geschlossen, kopierte Sitzungs-Cookies), gilt die Sitzung als
 *    abgelaufen. Gesetzt wird es erst nach dem zweiten Faktor (Anmelde-Aktionen), danach hier bei jeder Anfrage neu.
 */
export async function proxy(request: NextRequest) {
  // Cron und Webhook: kein Cookie, keine Sitzung; der Endpunkt prüft selbst
  if (istMaschinenPfad(request.nextUrl.pathname)) return NextResponse.next();
  const sicher = request.nextUrl.protocol === "https:";
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: authCookieOptionen(sicher),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const pfad = request.nextUrl.pathname;

  if (!claims) {
    // Zeitstempel einer früheren Sitzung darf die nächste Anmeldung nicht sofort beenden
    if (request.cookies.has(AKTIV_COOKIE)) response.cookies.delete(AKTIV_COOKIE);
    if (istOeffentlich(pfad)) return response;
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/anmelden";
    ziel.search = "";
    return NextResponse.redirect(ziel);
  }

  const sitzung = typeof claims.session_id === "string" ? claims.session_id : undefined;
  const aktiv = await nochAktiv(request.cookies.get(AKTIV_COOKIE)?.value, sitzung);
  // Ohne zweiten Faktor (aal1) leitet pruefeSitzung zum Code-Schritt; Daten gibt es erst mit aal2 (RLS)
  if (!aktiv && claims.aal === "aal2" && !istAnmeldeSchritt(pfad)) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/abmelden";
    ziel.search = "?grund=inaktiv";
    return NextResponse.redirect(ziel);
  }
  if (aktiv && sitzung) response.cookies.set({ ...aktivCookie(sicher), value: await aktivWert(sitzung) });
  return response;
}

export const config = {
  // Nur Build-Dateien, Bildoptimierung und die festen Dateien aus public/ ohne Proxy (keine Endungs-Ausnahme, damit
  // dynamische Pfade wie /pdf/…/x.png nicht an der Prüfung vorbeigehen)
  matcher: ["/((?!_next/static/|_next/image|favicon\\.ico$|brand/).*)"],
};
