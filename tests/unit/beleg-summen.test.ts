// Unit-Tests für die Belegsummen (Rundung auf Cent). Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { belegSummen, rund, zahl, zeilenBetrag, type SummenPosition } from "../../src/lib/beleg-summen.ts";

const pos = (einzelpreis: number, menge = 1, steuersatz = 19, extra: Partial<SummenPosition> = {}): SummenPosition => ({
  typ: "artikel",
  menge,
  einzelpreis,
  rabatt_prozent: 0,
  steuersatz,
  ...extra,
});
const std = { steuerart: "standard" as const, preise_brutto: false, gesamtrabatt_prozent: 0 };

describe("rund", () => {
  it("rundet kaufmännisch, auch bei Gleitkomma-Resten", () => {
    assert.equal(rund(1.005), 1.01);
    assert.equal(rund(2.675), 2.68);
    assert.equal(rund(0.125), 0.13);
    assert.equal(rund(1.004999), 1);
  });
  it("rundet negative Beträge vom Nullpunkt weg", () => {
    assert.equal(rund(-1.005), -1.01);
    assert.equal(rund(-0.004), -0);
  });
});

describe("zahl", () => {
  it("liest deutsche und technische Schreibweise", () => {
    assert.equal(zahl("1.234,56"), 1234.56);
    assert.equal(zahl("1234.56"), 1234.56);
    assert.equal(zahl(""), 0);
    assert.equal(zahl("abc"), 0);
  });
});

describe("belegSummen", () => {
  it("einfacher Beleg netto mit 19 %", () => {
    const s = belegSummen([pos(1000), pos(250.5, 2)], std);
    assert.equal(s.netto, 1501);
    assert.equal(s.steuer, 285.19);
    assert.equal(s.brutto, 1786.19);
  });
  it("Zeilen werden auf Cent gerundet, Steuer je Satz auf die Summe", () => {
    // 3 × 33,333 = 99,999 → 100,00 je Zeile
    const s = belegSummen([pos(33.333, 3), pos(33.333, 3)], std);
    assert.deepEqual(s.zeilen, [100, 100]);
    assert.equal(s.netto, 200);
    assert.equal(s.steuer, 38);
  });
  it("Positionsrabatt und Gesamtrabatt", () => {
    const s = belegSummen([pos(100, 1, 19, { rabatt_prozent: 10 }), pos(50)], { ...std, gesamtrabatt_prozent: 5 });
    assert.equal(s.zwischensumme, 140);
    assert.equal(s.netto, 133);
    assert.equal(s.rabatt, 7);
    assert.equal(s.steuer, 25.27);
    assert.equal(s.brutto, 158.27);
  });
  it("gemischte Steuersätze, nach Satz absteigend", () => {
    const s = belegSummen([pos(100, 1, 7), pos(200, 1, 19)], std);
    assert.deepEqual(s.steuern.map((z) => [z.satz, z.netto, z.steuer]), [[19, 200, 38], [7, 100, 7]]);
    assert.equal(s.brutto, 345);
  });
  it("optionale Positionen und Freitext zählen nicht", () => {
    const s = belegSummen([pos(100), pos(999, 1, 19, { optional: true }), { ...pos(0), typ: "text" }], std);
    assert.equal(s.netto, 100);
    assert.equal(s.zeilen[1], 999);
    assert.equal(s.zeilen[2], null);
  });
  it("§ 13b: ohne Umsatzsteuer, Brutto-Eingabe wird ignoriert", () => {
    const s = belegSummen([pos(1000)], { steuerart: "bauleistung_13b", preise_brutto: true, gesamtrabatt_prozent: 0 });
    assert.equal(s.ohne_steuer, true);
    assert.equal(s.brutto_eingabe, false);
    assert.equal(s.steuer, 0);
    assert.equal(s.brutto, 1000);
  });
  it("Brutto-Eingabe: Brutto bleibt exakt, Steuer herausgerechnet", () => {
    const s = belegSummen([pos(1190), pos(99.99)], { ...std, preise_brutto: true });
    assert.equal(s.brutto, 1289.99);
    assert.equal(s.steuer, 205.96); // 1.289,99 × 19 ÷ 119 = 205,964
    assert.equal(s.netto, 1084.03);
  });
  it("leerer Beleg", () => {
    const s = belegSummen([], std);
    assert.equal(s.netto, 0);
    assert.equal(s.brutto, 0);
  });
});

describe("zeilenBetrag", () => {
  it("Rabatt wird auf 0 bis 100 % begrenzt", () => {
    assert.equal(zeilenBetrag({ menge: 2, einzelpreis: 10, rabatt_prozent: 150 }), 0);
    assert.equal(zeilenBetrag({ menge: 2, einzelpreis: 10, rabatt_prozent: -5 }), 20);
  });
});
