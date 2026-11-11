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

/** Nur interne Ziele erlauben (keine offenen Weiterleitungen). */
export function sicheresZiel(ziel: unknown, ersatz = "/"): string {
  return typeof ziel === "string" && ziel.startsWith("/") && !ziel.startsWith("//") && !ziel.startsWith("/\\")
    ? ziel
    : ersatz;
}

/** Hinweise auf der Anmeldeseite (?grund=…) */
export const ANMELDE_GRUENDE: Record<string, string> = {
  inaktiv: `Du wurdest nach ${INAKTIV_MINUTEN} Minuten ohne Aktivität abgemeldet.`,
  abgemeldet: "Du bist abgemeldet.",
  gesperrt: "Dein Zugang ist nicht aktiv. Bitte wende dich an einen Admin.",
  link: "Der Link ist ungültig oder abgelaufen. Fordere bitte einen neuen an.",
  passwort: "Dein Passwort ist gespeichert. Melde dich jetzt an.",
};
