// Unit-Tests für die OneDrive-Ablage: Ordnerschema, Namen, Pfade, Dateitypen, Token-Verschlüsselung. Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { entschluesseln, schluesselLesen, verschluesseln } from "../../src/lib/onedrive/krypto.ts";
import { basisPfad, dateiTypErkennen, ordnerName, pfadKodieren, sharepointName, unterordnerFuer, UNTERORDNER } from "../../src/lib/onedrive/schema.ts";

describe("Ordnerschema", () => {
  it("Unterordner wie im Make-Szenario", () => {
    assert.deepEqual([...UNTERORDNER], ["01 Anfrage", "02 Angebot", "03 Aufmaß - Freigabe", "04 Auftrag", "05 ABs", "06 Abnahme - Rechnung - Sonstiges"]);
  });
  it("Belegart → Unterordner", () => {
    assert.equal(unterordnerFuer("angebot"), "02 Angebot");
    assert.equal(unterordnerFuer("auftragsbestaetigung"), "05 ABs");
    assert.equal(unterordnerFuer("teil_ab"), "05 ABs");
    assert.equal(unterordnerFuer("lieferschein"), "04 Auftrag");
    for (const a of ["rechnung", "abschlagsrechnung", "gutschrift", "zahlungsbestaetigung"]) assert.equal(unterordnerFuer(a), "06 Abnahme - Rechnung - Sonstiges");
  });
  it("Ordnername <Nummer>_<Kunde>, gesperrte Zeichen entfernt", () => {
    assert.equal(ordnerName("AG1260432", "Müller & Söhne"), "AG1260432_Müller & Söhne");
    assert.equal(ordnerName("AB2260227", 'Firma "A/B": Test?'), "AB2260227_Firma A B Test");
    assert.equal(ordnerName("ST-26-0001", null), "ST-26-0001");
    assert.equal(sharepointName("  ..Ordner.  "), "Ordner");
    assert.equal(sharepointName("x".repeat(200)).length, 120);
  });
  it("Basisordner-Pfad: vereinheitlicht, ohne .. und gesperrte Zeichen", () => {
    assert.equal(basisPfad("Kunden\\Aufträge/"), "Kunden/Aufträge");
    assert.equal(basisPfad("_App-Test"), "_App-Test");
    assert.equal(basisPfad("../geheim"), null);
    assert.equal(basisPfad("a/b:c"), null);
    assert.equal(basisPfad(""), null);
    assert.equal(pfadKodieren("Kunden/Auf träge"), "Kunden/Auf%20tr%C3%A4ge");
  });
});

describe("Dateitypen am Dateianfang", () => {
  it("PDF, JPEG, PNG, HEIC; sonst null", () => {
    assert.equal(dateiTypErkennen(Buffer.from("%PDF-1.7")), "application/pdf");
    assert.equal(dateiTypErkennen(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    assert.equal(dateiTypErkennen(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), "image/png");
    assert.equal(dateiTypErkennen(Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])), "image/heic");
    assert.equal(dateiTypErkennen(Buffer.from("<html><script>")), null);
    assert.equal(dateiTypErkennen(Buffer.from("MZ\x90\x00")), null, "ausführbare Datei");
  });
});

describe("Token-Verschlüsselung", () => {
  const k = randomBytes(32);
  it("hin und zurück; jedes Mal andere Ausgabe", () => {
    const a = verschluesseln("geheimes-token", k);
    const b = verschluesseln("geheimes-token", k);
    assert.notEqual(a, b);
    assert.ok(!a.includes("geheimes"));
    assert.equal(entschluesseln(a, k), "geheimes-token");
  });
  it("falscher Schlüssel oder veränderte Daten werden erkannt", () => {
    const a = verschluesseln("geheimes-token", k);
    assert.throws(() => entschluesseln(a, randomBytes(32)));
    const teile = a.split(".");
    teile[3] = Buffer.from("anders").toString("base64url");
    assert.throws(() => entschluesseln(teile.join("."), k));
  });
  it("Schlüssel muss 32 Byte (base64) sein", () => {
    assert.equal(schluesselLesen(k.toString("base64")).length, 32);
    assert.throws(() => schluesselLesen("zu-kurz"));
    assert.throws(() => schluesselLesen(undefined));
  });
});
