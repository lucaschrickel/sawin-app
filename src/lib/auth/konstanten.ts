/** Automatische Abmeldung nach so vielen Minuten ohne Aktivität (Browser und Server). */
export const INAKTIV_MINUTEN = 60;

/** Cookie mit dem Zeitpunkt der letzten Aktivität (vom Server gesetzt, nur httpOnly). */
export const AKTIV_COOKIE = "app_letzte_aktivitaet";

/** Seiten ohne Anmeldung. Alles andere verlangt eine Sitzung. */
export const OEFFENTLICHE_PFADE = ["/anmelden", "/passwort-vergessen", "/auth/", "/abmelden"];

/**
 * Endpunkte für Maschinen (Vercel-Cron, Lexware-Webhook): ohne Sitzung, ohne Umleitung. Sie prüfen ihren Zugang selbst
 * (CRON_SECRET bzw. Signatur von Lexware).
 */
export const MASCHINEN_PFADE = ["/api/cron/", "/api/lexware/"];
export const istMaschinenPfad = (pfad: string) => MASCHINEN_PFADE.some((p) => pfad.startsWith(p));

export const istOeffentlich = (pfad: string) =>
  OEFFENTLICHE_PFADE.some((p) => (p.endsWith("/") ? pfad.startsWith(p) : pfad === p || pfad.startsWith(p + "/")));

/** Anmeldeschritte: öffentliche Seiten und das Setzen des Passworts nach einem Link (noch ohne Aktivitäts-Cookie) */
export const istAnmeldeSchritt = (pfad: string) => istOeffentlich(pfad) || pfad === "/passwort-setzen";

/** Steuerzeichen (Tab, Zeilenumbruch …) und Backslash */
const UNSICHER = /[\u0000-\u001f\u007f\\]/;

/**
 * Nur interne Ziele erlauben (keine offenen Weiterleitungen). Abgelehnt werden Steuerzeichen (Tab, Zeilenumbruch: der
 * Browser entfernt sie, aus „/<Tab>/fremd“ würde „//fremd“), Backslashes und alles, was nicht auf dieselbe Herkunft
 * führt, auch in kodierter Form (%09, %2F, %5C). Zurück kommen nur Pfad, Suche und Anker.
 */
export function sicheresZiel(ziel: unknown, ersatz = "/"): string {
  if (typeof ziel !== "string" || !ziel.startsWith("/") || ziel.length > 2000 || UNSICHER.test(ziel)) return ersatz;
  let roh: string;
  try {
    roh = decodeURIComponent(ziel);
  } catch {
    return ersatz;
  }
  if (UNSICHER.test(roh) || roh.startsWith("//")) return ersatz;
  const basis = "https://intern.invalid";
  let u: URL;
  try {
    u = new URL(ziel, basis);
  } catch {
    return ersatz;
  }
  if (u.origin !== basis || u.pathname.startsWith("//")) return ersatz;
  return u.pathname + u.search + u.hash;
}

/** Hinweise auf der Anmeldeseite (?grund=…) */
export const ANMELDE_GRUENDE: Record<string, string> = {
  inaktiv: `Du wurdest nach ${INAKTIV_MINUTEN} Minuten ohne Aktivität abgemeldet.`,
  abgemeldet: "Du bist abgemeldet.",
  gesperrt: "Dein Zugang ist nicht aktiv. Bitte wende dich an einen Admin.",
  link: "Der Link ist ungültig oder abgelaufen. Fordere bitte einen neuen an.",
  passwort: "Dein Passwort ist gespeichert. Melde dich jetzt an.",
};
