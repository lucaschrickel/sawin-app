// Unit-Tests für ziehbare Spaltenbreiten (Positionstabelle im Beleg-Editor). Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { begrenzen, breitenAus, geaendertGegenStandard, passendeBreite, tastenBreite, type SpaltenDef } from "../../src/lib/spalten.ts";

const SP: SpaltenDef[] = [
  { schluessel: "menge", titel: "Menge", standard: 64, min: 48, max: 200 },
  { schluessel: "preis", titel: "Einzelpreis", standard: 96, min: 72, max: 240 },
];

describe("Spaltenbreiten", () => {
  it("Grenzen und Tastatur", () => {
    assert.equal(begrenzen(10, 48, 200), 48);
    assert.equal(begrenzen(250.4, 48, 200), 200);
    assert.equal(tastenBreite("ArrowRight", false, 64, 48, 200), 72);
    assert.equal(tastenBreite("ArrowLeft", true, 64, 48, 200), 48);
    assert.equal(tastenBreite("Home", false, 64, 48, 200), 48);
    assert.equal(tastenBreite("End", false, 64, 48, 200), 200);
    assert.equal(tastenBreite("a", false, 64, 48, 200), null);
  });
  it("passend an den Inhalt, innerhalb der Grenzen", () => {
    assert.equal(passendeBreite([30, 57.2, 41], 4, 48, 200), 62);
    assert.equal(passendeBreite([], 4, 48, 200), 48);
    assert.equal(passendeBreite([900], 4, 48, 200), 200);
  });
  it("gespeicherte Breiten mit Standard zusammenführen, Zurücksetzen erkennen", () => {
    assert.deepEqual(breitenAus(undefined, SP), { menge: 64, preis: 96 });
    assert.deepEqual(breitenAus({ menge: 30, preis: 120, fremd: 5 }, SP), { menge: 48, preis: 120 });
    assert.equal(geaendertGegenStandard({ menge: 64, preis: 96 }, SP), false);
    assert.equal(geaendertGegenStandard({ menge: 70, preis: 96 }, SP), true);
  });
});
