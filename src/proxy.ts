import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AKTIV_COOKIE, INAKTIV_MINUTEN, istOeffentlich } from "@/lib/auth/konstanten";

/**
 * Läuft vor jeder Anfrage:
 * 1. erneuert die Supabase-Sitzung in den Cookies (nötig für Server-Komponenten),
 * 2. leitet ohne Sitzung schnell auf /anmelden um (nur eine Vorprüfung; geschützt wird über pruefeSitzung()
 *    auf dem Server und RLS in der Datenbank),
 * 3. meldet nach INAKTIV_MINUTEN ohne Anfrage ab, auch wenn der Browser zwischendurch geschlossen war.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
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
  const angemeldet = !!data?.claims;
  const pfad = request.nextUrl.pathname;

  if (!angemeldet) {
    // Zeitstempel einer früheren Sitzung darf die nächste Anmeldung nicht sofort beenden
    if (request.cookies.has(AKTIV_COOKIE)) response.cookies.delete(AKTIV_COOKIE);
    if (istOeffentlich(pfad)) return response;
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/anmelden";
    ziel.search = "";
    return NextResponse.redirect(ziel);
  }

  // Inaktivität: Zeitpunkt der letzten Anfrage im httpOnly-Cookie
  const jetzt = Date.now();
  const zuletzt = Number(request.cookies.get(AKTIV_COOKIE)?.value ?? 0);
  if (zuletzt && jetzt - zuletzt > INAKTIV_MINUTEN * 60_000 && pfad !== "/abmelden") {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/abmelden";
    ziel.search = "?grund=inaktiv";
    return NextResponse.redirect(ziel);
  }
  response.cookies.set(AKTIV_COOKIE, String(jetzt), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
  });
  return response;
}

export const config = {
  // Nicht für statische Dateien und Bilder
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
