// Unit-Tests für den Chat: Erwähnungen, Hervorhebung, Dateiname der Fotos. Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chatFotoName, erwaehnte, erwaehnungAnfuegen, textTeile } from "../../src/lib/chat-logik.ts";

const personen = [
  { id: "1", name: "Anna Bauer", kuerzel: "AB" },
  { id: "2", name: "Jörg Özdemir", kuerzel: "JÖ" },
  { id: "3", name: "Lea Klein", kuerzel: "LK" },
];

describe("Erwähnungen", () => {
  it("findet Kürzel ohne Unterschied in Groß-/Kleinschreibung, jede Person einmal, nicht den Autor", () => {
    const e = erwaehnte("@ab bitte prüfen, @JÖ auch. Nochmal @AB und @LK", personen, "3");
    assert.deepEqual(e.map((p) => p.id), ["1", "2"]);
  });
  it("keine Erwähnung in E-Mail-Adressen, mitten im Wort oder bei unbekanntem Kürzel", () => {
    assert.deepEqual(erwaehnte("Mail an info@ab.de, xx@AB, @ABC, @@AB", personen), []);
    assert.deepEqual(erwaehnte("(@AB)", personen).map((p) => p.id), ["1"]);
  });
  it("Zeilenanfang und Satzzeichen danach", () => {
    assert.deepEqual(erwaehnte("@LK: Termin?\n@JÖ!", personen).map((p) => p.id), ["3", "2"]);
  });
});

describe("Hervorhebung", () => {
  it("nur bekannte Kürzel, Rest unverändert", () => {
    assert.deepEqual(textTeile("Hallo @AB und @XY, siehe <b>", ["AB"]), [
      { text: "Hallo ", erwaehnung: false },
      { text: "@AB", erwaehnung: true },
      { text: " und @XY, siehe <b>", erwaehnung: false },
    ]);
    assert.deepEqual(textTeile("ohne", ["AB"]), [{ text: "ohne", erwaehnung: false }]);
    assert.deepEqual(textTeile("@AB", ["AB"]), [{ text: "@AB", erwaehnung: true }]);
  });
  it("Erwähnung anfügen", () => {
    assert.equal(erwaehnungAnfuegen("", "AB"), "@AB ");
    assert.equal(erwaehnungAnfuegen("Hallo  ", "AB"), "Hallo @AB ");
  });
});

describe("Foto-Dateiname", () => {
  it("Chat_<Datum_Zeit>_<Kürzel>.<Endung>", () => {
    assert.equal(chatFotoName("2026-11-12T14:05:33", "AB", "image/jpeg"), "Chat_2026-11-12_1405_AB.jpg");
    assert.equal(chatFotoName("2026-11-12T08:00", null, "image/png"), "Chat_2026-11-12_0800.png");
    assert.equal(chatFotoName("2026-11-12T08:00", "LK", "image/heic"), "Chat_2026-11-12_0800_LK.heic");
  });
});
