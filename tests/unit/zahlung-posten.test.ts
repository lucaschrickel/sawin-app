// Unit-Tests für Zahlungsposten aus Lexware. Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { geldeingaenge, istGeldeingang, postenSchluessel } from "../../src/lib/lexware/zahlung-posten.ts";

const D = "2026-11-12T00:00:00.000+01:00";

describe("istGeldeingang", () => {
  it("Überweisung ja; Gutschrift, Abschlagsverrechnung, Skonto, Ausbuchung nein", () => {
    assert.equal(istGeldeingang("partPaymentFinancialTransaction"), true);
    assert.equal(istGeldeingang("partPaymentCreditNote"), false);
    assert.equal(istGeldeingang("partPaymentDownPaymentInvoice"), false);
    assert.equal(istGeldeingang("irrecoverableReceivable"), false);
    assert.equal(istGeldeingang("cashDiscount"), false);
  });
});

describe("postenSchluessel", () => {
  it("gleich bleibende Schlüssel, gleiche Posten werden durchnummeriert", () => {
    const p = [
      { paymentItemType: "partPaymentFinancialTransaction", postingDate: D, amount: 500 },
      { paymentItemType: "partPaymentFinancialTransaction", postingDate: D, amount: 500 },
      { paymentItemType: "partPaymentFinancialTransaction", postingDate: D, amount: 250.5 },
    ];
    const s = postenSchluessel("lex-1", p);
    assert.deepEqual(s.map((x) => x.schluessel), [
      "lex-1:partPaymentFinancialTransaction:2026-11-12:500.00:1",
      "lex-1:partPaymentFinancialTransaction:2026-11-12:500.00:2",
      "lex-1:partPaymentFinancialTransaction:2026-11-12:250.50:1",
    ]);
    assert.deepEqual(postenSchluessel("lex-1", p), s, "zweiter Abruf ergibt dieselben Schlüssel");
    assert.equal(s[0].datum, "2026-11-12");
  });
  it("geldeingaenge filtert Gutschriften und Beträge ≤ 0", () => {
    const g = geldeingaenge("lex-2", [
      { paymentItemType: "partPaymentCreditNote", postingDate: D, amount: 80.92 },
      { paymentItemType: "partPaymentFinancialTransaction", postingDate: D, amount: 100 },
      { paymentItemType: "partPaymentFinancialTransaction", postingDate: D, amount: 0 },
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].betrag, 100);
  });
});
