import { NextResponse, type NextRequest } from "next/server";
import { AKTIV_COOKIE, ANMELDE_GRUENDE } from "@/lib/auth/konstanten";
import { createClient } from "@/lib/supabase/server";

/**
 * Abmelden (Knopf in der Seitenleiste per POST, automatische Abmeldung und gesperrter Zugang per GET).
 * Beendet die Sitzung und leitet auf /anmelden mit Hinweis um.
 */
async function abmelden(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const grund = request.nextUrl.searchParams.get("grund");
  const ziel = new URL("/anmelden", request.url);
  ziel.searchParams.set("grund", grund && grund in ANMELDE_GRUENDE ? grund : "abgemeldet");
  const response = NextResponse.redirect(ziel, 303);
  response.cookies.delete(AKTIV_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const GET = abmelden;
export const POST = abmelden;
