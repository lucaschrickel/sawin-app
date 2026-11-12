// Unit-Tests für die Passwortregeln. Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { passwortRegeln } from "../../src/lib/passwort.ts";

const offen = (neu: string, alt?: string) => passwortRegeln(neu, alt).filter((r) => !r.erfuellt).map((r) => r.schluessel);

describe("Passwortregeln", () => {
  it("Länge, Groß/klein, Ziffer", () => {
    assert.deepEqual(offen("kurz"), ["laenge", "gross_klein", "ziffer"]);
    assert.deepEqual(offen("langesPasswortOhne"), ["ziffer"]);
    assert.deepEqual(offen("LangesPasswort1"), []);
  });
  it("nicht gleich dem alten", () => {
    assert.deepEqual(offen("LangesPasswort1", "LangesPasswort1"), ["anders"]);
    assert.deepEqual(offen("LangesPasswort2", "LangesPasswort1"), []);
  });
});
