import { createHash, createPublicKey, timingSafeEqual, verify, type KeyObject } from "node:crypto";

/*
  Prüfung eingehender Lexware-Webhooks (ohne Server-Abhängigkeiten, damit die Unit-Tests sie direkt laden können).
  Lexware signiert jede Zustellung mit RSA-SHA512; die Signatur steht base64-kodiert im Header X-Lxo-Signature.
  Signiert ist der JSON-Inhalt ohne Leerzeichen und Zeilenumbrüche. Öffentlicher Schlüssel laut Doku:
  https://developers.lexware.io/webhookSignature/public/public_key.pub (RSA 4096, kein Geheimnis).
*/

export const LEXWARE_WEBHOOK_SCHLUESSEL = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAtCkZXZqT2zFRmA83KsBC
tQSv9t+AaWiZpRWvzE4wiQEh0aHzNYkT/DlP419pngqoLxnqW9SsgWfKOG3utoEV
z+Lru9odZntW/n/yaRK3f0AcMtuWs/Z1PZ4BbN/RlFYyqlPg0VfuAvZMAa+J9WAl
Fuy0T4Y0EdO0d+EL8BpzSLqj3XLI+YuK4hUhlTOxHmdDtNUkugnT9b9khb+oPDmB
3yxRP6Rmo2qo6waSc+pihCdOiZKzwA4fA1HT8DM54OaNQ4qd9NRf5uECijFlpQu6
vZdW7Z+LZ8HTgGQVSsJdCzUtM1wiWOERrHvd8IpBMvUAvGM/qaJnAmwsEr4J/El4
yCmur8wwYBtSUH0Xue42YysdmSS0pOMMUAAvr70HQMDHagYkErMtu6FAyAmPz8p/
tAqJJpwAhxITbnc5WsmZOu0Ke255nXQ/2Go1TKv+45mSb7RLsvpmhVZ4nFByFt24
vG6IwNReuLhJJL468jrdTpxyZRn0QqkxiQV7jDd9Dp1NVd/W3+n86Aos9LnJa+ut
kN+jOOWmJdJjnQetJlbDVg3ex+XHVmCjiRYggCGPlpXVJwdEUNGzxhPGKjxmeiQT
ahwFA9iHtwBw7yK5VfM/hA+JeF2FXYhTdehfClAQt1YCYXkgUEFxm9idRdBoCY6U
bmFUXQLdi7tZyDor8Rxoq2MCAwEAAQ==
-----END PUBLIC KEY-----`;

let standardSchluessel: KeyObject | null = null;

/** Prüft die Signatur einer Zustellung: erst gegen den Inhalt wie empfangen, dann gegen die kompakte JSON-Form */
export function signaturGueltig(inhalt: string, signatur: string | null | undefined, schluessel?: KeyObject | string): boolean {
  if (!signatur || !/^[A-Za-z0-9+/=\s]+$/.test(signatur)) return false;
  const sig = Buffer.from(signatur.replace(/\s/g, ""), "base64");
  if (sig.length < 64) return false;
  const key = schluessel ? (typeof schluessel === "string" ? createPublicKey(schluessel) : schluessel) : (standardSchluessel ??= createPublicKey(LEXWARE_WEBHOOK_SCHLUESSEL));
  const kandidaten = [inhalt];
  try {
    const kompakt = JSON.stringify(JSON.parse(inhalt));
    if (kompakt !== inhalt) kandidaten.push(kompakt);
  } catch {
    return false;
  }
  return kandidaten.some((k) => {
    try {
      return verify("sha512", Buffer.from(k, "utf8"), key, sig);
    } catch {
      return false;
    }
  });
}

export type LexwareEreignis = { organizationId: string; eventType: string; resourceId: string; eventDate: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Liest und prüft den Inhalt einer Zustellung; null bei ungültigem Aufbau */
export function ereignisLesen(inhalt: string): LexwareEreignis | null {
  let d: unknown;
  try {
    d = JSON.parse(inhalt);
  } catch {
    return null;
  }
  const e = d as Partial<LexwareEreignis> | null;
  if (!e || typeof e !== "object") return null;
  if (typeof e.eventType !== "string" || !/^[a-z-]+(\.[a-z-]+)+$/.test(e.eventType)) return null;
  if (typeof e.resourceId !== "string" || !UUID.test(e.resourceId)) return null;
  if (typeof e.organizationId !== "string" || !UUID.test(e.organizationId)) return null;
  if (typeof e.eventDate !== "string" || Number.isNaN(Date.parse(e.eventDate))) return null;
  return { organizationId: e.organizationId, eventType: e.eventType, resourceId: e.resourceId, eventDate: e.eventDate };
}

/** Schlüssel für Doppelzustellungen (Lexware liefert keine Ereignis-ID) */
export function ereignisSchluessel(e: LexwareEreignis): string {
  return createHash("sha256").update([e.organizationId, e.eventType, e.resourceId, new Date(e.eventDate).toISOString()].join("|")).digest("hex");
}

/** Ereignisse, die den Zahlungsstand eines Belegs ändern können */
export const ZAHLUNGS_EREIGNISSE = ["payment.changed", "invoice.status.changed", "credit-note.status.changed"];

/** Vergleich des Cron-Geheimnisses in konstanter Zeit; ohne gesetztes Geheimnis ist nichts erlaubt */
export function cronErlaubt(authorization: string | null, geheimnis: string | undefined): boolean {
  const g = geheimnis?.trim();
  if (!g || g.length < 16 || !authorization) return false;
  const a = Buffer.from(authorization);
  const b = Buffer.from(`Bearer ${g}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
