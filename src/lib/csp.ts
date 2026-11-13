/*
  Content-Security-Policy mit Nonce (docs/sicherheit.md M3). Der Proxy erzeugt je Anfrage eine Nonce und setzt die Policy
  auf Anfrage (Next.js liest daraus die Nonce und versieht seine Skripte damit) und Antwort.

  - script-src: nur Skripte mit der Nonce dieser Anfrage und das feste Darstellungs-Skript im <head> (per SHA-256);
    'strict-dynamic' erlaubt die Chunks, die diese Skripte nachladen. Kein 'unsafe-inline' (wird mit Nonce ohnehin
    ignoriert), kein 'unsafe-eval' außer in der Entwicklung (React rekonstruiert dort Fehler-Stacks per eval).
  - Verbindungen und Bilder nur zur eigenen Herkunft und zum eigenen Supabase-Projekt (signierte Upload- und
    Anzeige-Adressen); die Adresse kommt aus NEXT_PUBLIC_SUPABASE_URL, nie fest im Code.
  - style-src 'unsafe-inline': React setzt Inline-Styles (z. B. Spaltenbreiten, Farben der Einsätze).
  - frame-ancestors: nie einbettbar, nur die PDF-Ansichten (/pdf/…) in Seiten derselben Herkunft.
*/
import { DARSTELLUNG_SKRIPT } from "./darstellung";

const enc = new TextEncoder();
let darstellungHash: Promise<string> | null = null;

/** SHA-256 des Darstellungs-Skripts im <head> (fester Text, base64) */
function hashDarstellung(): Promise<string> {
  darstellungHash ??= crypto.subtle.digest("SHA-256", enc.encode(DARSTELLUNG_SKRIPT)).then((h) => btoa(String.fromCharCode(...new Uint8Array(h))));
  return darstellungHash;
}

export function neueNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}

function supabaseHerkunft(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
}

export async function cspKopf(nonce: string, pfad: string): Promise<string> {
  const dev = process.env.NODE_ENV === "development";
  const sb = supabaseHerkunft();
  const direktiven = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'sha256-${await hashDarstellung()}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${sb}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${sb}${dev ? " ws: wss:" : ""}`.trim(),
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${pfad.startsWith("/pdf/") ? "'self'" : "'none'"}`,
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return direktiven.join("; ");
}
