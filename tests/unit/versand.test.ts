// Unit-Tests für den vorläufigen Versand: Dateiname, Adressen, mailto, Vorlage. Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adressenLesen, dateiTeil, mailtoLink, versandDateiname, versandVorlage } from "../../src/lib/versand.ts";

describe("Dateiname", () => {
  it("Nummer, Version, Belegart und Kunde ohne Sonderzeichen", () => {
    assert.equal(versandDateiname({ nummer: "AG1260432", version: 1, artText: "Angebot", kunde: "Müller & Söhne GmbH" }), "AG1260432_Angebot_Mueller_Soehne_GmbH.pdf");
    assert.equal(versandDateiname({ nummer: "AB2260227-01", version: 2, artText: "Teil-Auftragsbestätigung", kunde: "Familie Weiß" }), "AB2260227-01_V2_Teil-Auftragsbestaetigung_Familie_Weiss.pdf");
    assert.equal(versandDateiname({ nummer: "RE-1001", version: 1, artText: "Rechnung", kunde: null }), "RE-1001_Rechnung.pdf");
  });
  it("keine Pfadzeichen, Länge begrenzt", () => {
    assert.equal(dateiTeil("../../etc/passwd"), "etc_passwd");
    assert.equal(dateiTeil("x".repeat(80)).length, 40);
    assert.equal(dateiTeil("Café Ångström"), "Cafe_Angstroem");
  });
});

describe("Adressen", () => {
  it("mehrere Adressen, Dubletten entfernt; ungültige abgelehnt", () => {
    assert.deepEqual(adressenLesen("a@b.de; c@d.de, a@b.de"), ["a@b.de", "c@d.de"]);
    assert.deepEqual(adressenLesen(""), []);
    assert.equal(adressenLesen("kein-at.de"), null);
    assert.equal(adressenLesen("x@y.de\nbcc:evil@z.de"), null);
  });
});

describe("mailto", () => {
  it("kodiert Empfänger, BCC, Betreff und Text mit CRLF", () => {
    const l = mailtoLink({ an: ["kunde@example.com"], bcc: ["angebot@firma.de"], betreff: "Angebot AG1 – Haus & Hof", text: "Zeile 1\nZeile 2" });
    assert.equal(l, "mailto:kunde%40example.com?bcc=angebot%40firma.de&subject=Angebot%20AG1%20%E2%80%93%20Haus%20%26%20Hof&body=Zeile%201%0D%0AZeile%202");
  });
  it("ohne BCC kein bcc-Parameter; Kopfzeilen lassen sich nicht einschleusen", () => {
    const l = mailtoLink({ an: ["a@b.de"], bcc: [], betreff: "x\r\nBcc: evil@z.de", text: "" });
    assert.ok(!l.includes("bcc="));
    assert.ok(!/[\r\n]/.test(l));
  });
});

describe("Vorlage", () => {
  it("Betreff und Text je Belegart", () => {
    const v = versandVorlage({ art: "angebot", artText: "Angebot", nummer: "AG1260432", datum: "2026-11-11", bauvorhaben: "Neubau Weg 1", firma: "Sawin Bauelemente", version: 2 });
    assert.equal(v.betreff, "Angebot AG1260432 – Version 2 – Neubau Weg 1");
    assert.match(v.text, /^Guten Tag,\n\nanbei erhalten Sie unser Angebot AG1260432 vom 11\.11\.2026 zum Bauvorhaben Neubau Weg 1\./);
    assert.match(versandVorlage({ art: "lieferschein", artText: "Lieferschein", nummer: "LS1", datum: "2026-11-11", bauvorhaben: null, firma: null, version: 1 }).text, /unseren Lieferschein LS1/);
    assert.match(versandVorlage({ art: "rechnung", artText: "Rechnung", nummer: "R1", datum: "2026-11-11", bauvorhaben: null, firma: null, version: 1 }).text, /unsere Rechnung R1/);
  });
});
