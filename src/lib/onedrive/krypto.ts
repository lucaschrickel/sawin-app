import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/*
  Verschlüsselung des Graph-Zugriffstokens (AES-256-GCM). Der Schlüssel steht nur in MS_TOKEN_SCHLUESSEL (32 Byte,
  base64), nie in der Datenbank. Format: „v1.<iv>.<tag>.<daten>“ (base64url).
*/

export function schluesselLesen(wert: string | undefined): Buffer {
  const k = Buffer.from((wert ?? "").trim(), "base64");
  if (k.length !== 32) throw new Error("MS_TOKEN_SCHLUESSEL fehlt oder ist kein 32-Byte-Schlüssel (base64).");
  return k;
}

export function verschluesseln(text: string, schluessel: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", schluessel, iv);
  const daten = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), daten.toString("base64url")].join(".");
}

export function entschluesseln(wert: string, schluessel: Buffer): string {
  const [v, iv, tag, daten] = wert.split(".");
  if (v !== "v1" || !iv || !tag || daten === undefined) throw new Error("Unbekanntes Format");
  const d = createDecipheriv("aes-256-gcm", schluessel, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(daten, "base64url")), d.final()]).toString("utf8");
}
