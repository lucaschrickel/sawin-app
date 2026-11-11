// Unit-Tests für den Lexware-Webhook (Signatur, Inhalt, Doppelzustellungen) und den Cron-Zugang. Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { cronErlaubt, ereignisLesen, ereignisSchluessel, LEXWARE_WEBHOOK_SCHLUESSEL, signaturGueltig } from "../../src/lib/lexware/webhook-pruefung.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const signiere = (text: string) => sign("sha512", Buffer.from(text), privateKey).toString("base64");
const E = { organizationId: "aa93e8a8-2aa3-470b-b914-caad8a255dd8", eventType: "payment.changed", resourceId: "4d43ad14-671d-4e0c-fd4b-2fd8cc117eff", eventDate: "2026-11-12T12:30:00.000+01:00" };
const kompakt = JSON.stringify(E);

describe("signaturGueltig", () => {
  it("Lexware-Schlüssel ist ein gültiger RSA-4096-Schlüssel", () => {
    const k = createPublicKey(LEXWARE_WEBHOOK_SCHLUESSEL);
    assert.equal(k.asymmetricKeyType, "rsa");
    assert.equal(k.asymmetricKeyDetails?.modulusLength, 4096);
  });
  it("richtige Signatur über den kompakten Inhalt", () => {
    assert.equal(signaturGueltig(kompakt, signiere(kompakt), publicKey), true);
  });
  it("Inhalt mit Leerzeichen und Zeilenumbrüchen, signiert in kompakter Form", () => {
    const huebsch = JSON.stringify(E, null, 2);
    assert.equal(signaturGueltig(huebsch, signiere(kompakt), publicKey), true);
  });
  it("veränderter Inhalt, fremder Schlüssel, fehlende oder kaputte Signatur werden abgelehnt", () => {
    const sig = signiere(kompakt);
    assert.equal(signaturGueltig(kompakt.replace("payment", "invoice"), sig, publicKey), false);
    assert.equal(signaturGueltig(kompakt, sig), false, "echter Lexware-Schlüssel passt nicht zur Test-Signatur");
    assert.equal(signaturGueltig(kompakt, null, publicKey), false);
    assert.equal(signaturGueltig(kompakt, "", publicKey), false);
    assert.equal(signaturGueltig(kompakt, "kein base64 !", publicKey), false);
    assert.equal(signaturGueltig(kompakt, "AAAA", publicKey), false);
    assert.equal(signaturGueltig("kein json", signiere("kein json"), publicKey), false);
  });
});

describe("ereignisLesen", () => {
  it("gültiges Ereignis", () => {
    assert.deepEqual(ereignisLesen(kompakt), E);
  });
  it("ungültige Felder", () => {
    assert.equal(ereignisLesen("[]"), null);
    assert.equal(ereignisLesen(JSON.stringify({ ...E, resourceId: "lext-123" })), null);
    assert.equal(ereignisLesen(JSON.stringify({ ...E, eventType: "DROP TABLE" })), null);
    assert.equal(ereignisLesen(JSON.stringify({ ...E, eventDate: "gestern" })), null);
    assert.equal(ereignisLesen(JSON.stringify({ ...E, organizationId: undefined })), null);
  });
});

describe("ereignisSchluessel", () => {
  it("gleiche Zustellung → gleicher Schlüssel, auch mit anderer Zeitzonen-Schreibweise", () => {
    assert.equal(ereignisSchluessel(E), ereignisSchluessel({ ...E }));
    assert.equal(ereignisSchluessel(E), ereignisSchluessel({ ...E, eventDate: "2026-11-12T11:30:00.000Z" }));
  });
  it("anderer Zeitpunkt, anderes Ereignis oder anderer Beleg → anderer Schlüssel", () => {
    assert.notEqual(ereignisSchluessel(E), ereignisSchluessel({ ...E, eventDate: "2026-11-12T12:31:00.000+01:00" }));
    assert.notEqual(ereignisSchluessel(E), ereignisSchluessel({ ...E, eventType: "invoice.status.changed" }));
    assert.notEqual(ereignisSchluessel(E), ereignisSchluessel({ ...E, resourceId: "5d43ad14-671d-4e0c-fd4b-2fd8cc117eff" }));
  });
});

describe("cronErlaubt", () => {
  const g = "geheim-geheim-geheim-123";
  it("nur mit genau dem Geheimnis", () => {
    assert.equal(cronErlaubt(`Bearer ${g}`, g), true);
    assert.equal(cronErlaubt(`Bearer ${g}x`, g), false);
    assert.equal(cronErlaubt(g, g), false);
    assert.equal(cronErlaubt(null, g), false);
  });
  it("ohne oder mit zu kurzem Geheimnis nie", () => {
    assert.equal(cronErlaubt("Bearer ", ""), false);
    assert.equal(cronErlaubt("Bearer undefined", undefined), false);
    assert.equal(cronErlaubt("Bearer kurz", "kurz"), false);
  });
});
