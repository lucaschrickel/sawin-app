/*
  Aktivitäts-Cookie für die automatische Abmeldung nach INAKTIV_MINUTEN (proxy.ts und pruefeSitzung).

  Wert: „<Zeitpunkt>.<Signatur>“. Die Signatur (HMAC-SHA-256) bindet den Zeitpunkt an die Supabase-Sitzung (session_id
  aus dem JWT); ein kopierter oder selbst gebauter Wert gilt nicht. Fehlt das Cookie bei einer bestehenden Sitzung (z. B.
  nach dem Schließen des Browsers oder bei kopierten Sitzungs-Cookies), gilt die Sitzung als abgelaufen. Gesetzt wird es
  erst, wenn der zweite Faktor bestätigt ist (Anmelde-Aktionen), danach bei jeder Anfrage neu (Proxy).

  Schlüssel: aus SUPABASE_SERVICE_ROLE_KEY abgeleitet (HMAC mit eigenem Zweck), damit keine weitere Umgebungsvariable
  nötig ist. Ein neuer Secret Key meldet alle Benutzer einmal ab. Läuft im Proxy und auf dem Server (Web Crypto).
*/
import { AKTIV_COOKIE, INAKTIV_MINUTEN } from "./konstanten.ts";

/** Längste Lebensdauer des Cookies (entspricht der Höchstdauer der Sitzung in Supabase, 12 Stunden) */
export const AKTIV_MAX_SEKUNDEN = 12 * 60 * 60;

const enc = new TextEncoder();
let schluessel: Promise<CryptoKey> | null = null;

function hmacSchluessel(): Promise<CryptoKey> {
  if (!schluessel) {
    const geheim = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!geheim) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt (nur serverseitig setzen).");
    schluessel = crypto.subtle
      .importKey("raw", enc.encode(geheim), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      .then((basis) => crypto.subtle.sign("HMAC", basis, enc.encode("sawin-app:aktivitaet:v1")))
      .then((abgeleitet) => crypto.subtle.importKey("raw", abgeleitet, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
  }
  return schluessel;
}

const b64url = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const b64Bytes = (s: string) => {
  const t = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
};

/** Cookie-Wert für die Sitzung zum Zeitpunkt `zeit` (ms) */
export async function aktivWert(sitzung: string, zeit = Date.now()): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacSchluessel(), enc.encode(`${sitzung}.${zeit}`));
  return `${zeit}.${b64url(sig)}`;
}

/** Zeitpunkt der letzten Aktivität aus dem Cookie, nur wenn die Signatur zur Sitzung passt; sonst null */
export async function aktivZeit(wert: string | undefined, sitzung: string | undefined): Promise<number | null> {
  if (!wert || !sitzung) return null;
  const m = /^(\d{10,16})\.([A-Za-z0-9_-]{20,})$/.exec(wert);
  if (!m) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacSchluessel(), b64Bytes(m[2]), enc.encode(`${sitzung}.${m[1]}`));
    return ok ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** Ist die Sitzung laut Cookie noch aktiv (gültig signiert und jünger als INAKTIV_MINUTEN)? */
export async function nochAktiv(wert: string | undefined, sitzung: string | undefined, jetzt = Date.now()): Promise<boolean> {
  const zeit = await aktivZeit(wert, sitzung);
  return zeit !== null && zeit <= jetzt + 60_000 && jetzt - zeit <= INAKTIV_MINUTEN * 60_000;
}

/** Optionen des Cookies (httpOnly, nur über HTTPS außer lokal) */
export const aktivCookie = (sicher: boolean) => ({
  name: AKTIV_COOKIE,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: sicher,
  path: "/",
  maxAge: AKTIV_MAX_SEKUNDEN,
});

/*
  Link-Cookie: Das Einlösen eines Einladungs- oder „Passwort vergessen“-Links erlaubt für 60 Minuten, das Passwort ohne
  das bisherige zu setzen (/passwort-setzen). Gebunden an die Sitzung wie das Aktivitäts-Cookie.
*/
export const LINK_COOKIE = "app_passwort_link";
const LINK_MINUTEN = 60;

export const linkWert = (sitzung: string, zeit = Date.now()) => aktivWert(`${sitzung}:link`, zeit);

export async function linkGueltig(wert: string | undefined, sitzung: string | undefined, jetzt = Date.now()): Promise<boolean> {
  const zeit = await aktivZeit(wert, sitzung ? `${sitzung}:link` : undefined);
  return zeit !== null && zeit <= jetzt + 60_000 && jetzt - zeit <= LINK_MINUTEN * 60_000;
}

export const linkCookie = (sicher: boolean) => ({
  name: LINK_COOKIE,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: sicher,
  path: "/",
  maxAge: LINK_MINUTEN * 60,
});
