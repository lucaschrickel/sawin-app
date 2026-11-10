// Unit-Tests für Abschläge und Schlussrechnung (Rundung auf Cent). Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { belegSummen, rund, type SummenPosition } from "../../src/lib/beleg-summen.ts";
import { abschlagBerechnen, abschlagZiel, abzugPositionen, schlussAbweichungen, steuerAus, type AuftragsWert, type SatzBetrag } from "../../src/lib/abschlag.ts";

const pos = (einzelpreis: number, steuersatz = 19, menge = 1): SummenPosition => ({ typ: "artikel", menge, einzelpreis, rabatt_prozent: 0, steuersatz });

/** Auftragswert aus Positionen (wie die AB) */
function auftrag(positionen: SummenPosition[], brutto = false, rabatt = 0) {
  const kopf = { steuerart: "standard" as const, preise_brutto: brutto, gesamtrabatt_prozent: rabatt };
  const s = belegSummen(positionen, kopf);
  const wert: AuftragsWert = { steuern: s.steuern, brutto: s.brutto, brutto_eingabe: brutto };
  return { wert, positionen, kopf };
}

/** So rechnet Lexware den Abschlag: eine Position je Satz */
function lexwareAbschlag(zeilen: { satz: number; betrag: number }[], brutto: boolean): SatzBetrag[] {
  return belegSummen(zeilen.map((z) => pos(z.betrag, z.satz)), { steuerart: "standard", preise_brutto: brutto, gesamtrabatt_prozent: 0 }).steuern;
}

/** So rechnet Lexware die Schlussrechnung: volle Leistung plus Abzugspositionen */
function schluss(a: ReturnType<typeof auftrag>, abschlaege: SatzBetrag[][]) {
  const abzug = abzugPositionen(
    abschlaege.map((steuern, i) => ({ id: `a${i}`, nr: i + 1, nummer: `RE00${i + 1}`, datum: "2026-11-10", steuern })),
    a.kopf.preise_brutto,
  );
  const positionen: SummenPosition[] = [
    ...a.positionen,
    ...abzug.map((p) => ({ typ: "artikel" as const, menge: 1, einzelpreis: p.einzelpreis, rabatt_prozent: 0, steuersatz: p.steuersatz, abzug: true })),
  ];
  return belegSummen(positionen, a.kopf);
}

describe("steuerAus", () => {
  it("netto: Betrag × Satz, brutto: herausgerechnet", () => {
    assert.equal(steuerAus(420.17, 19, false), 79.83);
    assert.equal(steuerAus(500, 19, true), 79.83);
    assert.equal(steuerAus(0.05, 7, true), 0);
  });
});

describe("abschlagZiel", () => {
  it("Prozent vom Auftragswert brutto, auf Cent gerundet", () => {
    assert.equal(abschlagZiel({ art: "prozent", wert: 50 }, 11900), 5950);
    assert.equal(abschlagZiel({ art: "prozent", wert: 33.33 }, 1000.01), 333.3);
    assert.equal(abschlagZiel({ art: "betrag", wert: 1234.565 }, 99999), 1234.57);
  });
});

describe("abschlagBerechnen", () => {
  it("50 % von 10.000 € netto: genau 5.950,00 € brutto", () => {
    const a = auftrag([pos(10000)]);
    const e = abschlagBerechnen({ art: "prozent", wert: 50 }, a.wert, []);
    assert.equal(e.brutto, 5950);
    assert.equal(e.netto, 5000);
    assert.equal(e.steuer, 950);
    assert.equal(e.abweichung, 0);
    assert.equal(e.rest, 5950);
    assert.equal(e.ueberschritten, false);
  });

  it("Betrag brutto bei netto-Auftrag: Netto herausgerechnet", () => {
    const a = auftrag([pos(1000)]);
    const e = abschlagBerechnen({ art: "betrag", wert: 500 }, a.wert, []);
    assert.deepEqual(
      e.zeilen.map((z) => [z.satz, z.betrag, z.netto, z.steuer, z.brutto]),
      [[19, 420.17, 420.17, 79.83, 500]],
    );
  });

  it("mehrere Steuersätze: im Verhältnis der Bruttobeträge aufgeteilt", () => {
    const a = auftrag([pos(1000, 19), pos(500, 7)]);
    const e = abschlagBerechnen({ art: "prozent", wert: 30 }, a.wert, []);
    assert.equal(e.zeilen.length, 2);
    assert.equal(e.ziel, rund(a.wert.brutto * 0.3));
    assert.ok(Math.abs(e.abweichung) <= 0.02);
    const z19 = e.zeilen.find((z) => z.satz === 19)!;
    const z7 = e.zeilen.find((z) => z.satz === 7)!;
    assert.ok(Math.abs(z19.brutto - 357) <= 0.01);
    assert.ok(Math.abs(z7.brutto - 160.5) <= 0.01);
  });

  it("§ 13b: alles netto ohne Steuer", () => {
    const s = belegSummen([pos(8000, 0)], { steuerart: "bauleistung_13b", preise_brutto: false, gesamtrabatt_prozent: 0 });
    const e = abschlagBerechnen({ art: "prozent", wert: 40 }, { steuern: s.steuern, brutto: s.brutto, brutto_eingabe: false }, []);
    assert.deepEqual([e.netto, e.steuer, e.brutto, e.abweichung], [3200, 0, 3200, 0]);
  });

  it("warnt, wenn die Abschläge den Auftragswert übersteigen", () => {
    const a = auftrag([pos(1000)]);
    const erster = abschlagBerechnen({ art: "prozent", wert: 80 }, a.wert, []);
    const zweiter = abschlagBerechnen({ art: "prozent", wert: 30 }, a.wert, [lexwareAbschlag(erster.zeilen, false)]);
    assert.equal(zweiter.bisher_brutto, 952);
    assert.equal(zweiter.ueberschritten, true);
    assert.ok(zweiter.rest < 0);
  });

  it("Ergebnis entspricht dem, was Lexware für den Abschlag rechnet", () => {
    const a = auftrag([pos(1234.56, 19), pos(98.7, 7)]);
    const e = abschlagBerechnen({ art: "prozent", wert: 33.3333 }, a.wert, []);
    const lex = lexwareAbschlag(e.zeilen, false);
    assert.deepEqual(
      lex.map((z) => [z.satz, z.netto, z.steuer, z.brutto]),
      e.zeilen.map((z) => [z.satz, z.netto, z.steuer, z.brutto]),
    );
  });
});

describe("Schlussrechnung", () => {
  it("Beispiel: 10.000 € netto, zwei Abschläge, Rest stimmt auf den Cent", () => {
    const a = auftrag([pos(10000)]);
    const e1 = abschlagBerechnen({ art: "prozent", wert: 30 }, a.wert, []);
    const l1 = lexwareAbschlag(e1.zeilen, false);
    const e2 = abschlagBerechnen({ art: "betrag", wert: 2500 }, a.wert, [l1]);
    const l2 = lexwareAbschlag(e2.zeilen, false);
    const s = schluss(a, [l1, l2]);
    assert.equal(s.netto, rund(10000 - l1[0].netto - l2[0].netto));
    assert.equal(s.steuer, rund(1900 - l1[0].steuer - l2[0].steuer));
    assert.equal(s.brutto, rund(11900 - l1[0].brutto - l2[0].brutto));
    assert.deepEqual(schlussAbweichungen(a.wert.steuern, [l1, l2], s.steuern), []);
  });

  it("Gesamtrabatt gilt nicht für die Abzugspositionen", () => {
    const a = auftrag([pos(1000), pos(333.33)], false, 5);
    const e1 = abschlagBerechnen({ art: "prozent", wert: 50 }, a.wert, []);
    const l1 = lexwareAbschlag(e1.zeilen, false);
    const s = schluss(a, [l1]);
    assert.equal(s.brutto, rund(a.wert.brutto - l1[0].brutto));
    assert.deepEqual(schlussAbweichungen(a.wert.steuern, [l1], s.steuern), []);
  });

  it("Fälle mit Rundungsdifferenz: die Anpassung löst sie auf (höchstens 0,03 € Abweichung bei 19 %)", () => {
    let gefunden = 0;
    for (let cent = 0; cent < 300; cent++) {
      const a = auftrag([pos(1000 + cent / 100)]);
      const g = rund(500 + cent / 7);
      const naiv = rund(g / 1.19);
      const rest = rund(a.wert.steuern[0].netto - naiv);
      const differenz = rund(steuerAus(rest, 19, false) - (a.wert.steuern[0].steuer - steuerAus(naiv, 19, false)));
      if (differenz === 0) continue;
      gefunden++;
      const e = abschlagBerechnen({ art: "betrag", wert: g }, a.wert, []);
      const l = lexwareAbschlag(e.zeilen, false);
      assert.deepEqual(schlussAbweichungen(a.wert.steuern, [l], schluss(a, [l]).steuern), []);
      assert.ok(Math.abs(e.abweichung) <= 0.03, `Abweichung ${e.abweichung}`);
    }
    assert.ok(gefunden > 0, "mindestens ein Fall mit Rundungsdifferenz");
  });

  it("Zufallsprüfung: netto und brutto, 1 bis 4 Abschläge, ein oder zwei Sätze, mit Rabatt – immer centgenau", () => {
    let seed = 42;
    const zufall = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let lauf = 0; lauf < 3000; lauf++) {
      const brutto = zufall() < 0.5;
      const positionen = [pos(rund(100 + zufall() * 50000), 19, rund(1 + zufall() * 3))];
      if (zufall() < 0.4) positionen.push(pos(rund(10 + zufall() * 5000), 7));
      const a = auftrag(positionen, brutto, zufall() < 0.2 ? rund(zufall() * 10) : 0);
      const anzahl = 1 + Math.floor(zufall() * 4);
      const bisher: SatzBetrag[][] = [];
      for (let i = 0; i < anzahl; i++) {
        const eingabe =
          zufall() < 0.5
            ? { art: "prozent" as const, wert: rund(5 + zufall() * 15) }
            : { art: "betrag" as const, wert: rund(50 + zufall() * a.wert.brutto * 0.15) };
        const e = abschlagBerechnen(eingabe, a.wert, bisher);
        assert.ok(Math.abs(e.abweichung) <= 0.12, `Lauf ${lauf}: Abweichung ${e.abweichung}`);
        bisher.push(lexwareAbschlag(e.zeilen, brutto));
      }
      const s = schluss(a, bisher);
      assert.deepEqual(schlussAbweichungen(a.wert.steuern, bisher, s.steuern), [], `Lauf ${lauf}`);
      assert.equal(s.brutto, rund(a.wert.brutto - bisher.flat().reduce((x, z) => x + z.brutto, 0)), `Lauf ${lauf}: Restbetrag`);
    }
  });
});

describe("abzugPositionen", () => {
  it("je Abschlag und Satz eine Minusposition mit Nummer, Datum, Netto und Steuer", () => {
    const steuern = [{ satz: 19, netto: 420.17, steuer: 79.83, brutto: 500 }];
    const p = abzugPositionen([{ id: "x", nr: 2, nummer: "RE0020", datum: "2026-11-10", steuern }], false);
    assert.equal(p.length, 1);
    assert.equal(p[0].titel, "abzgl. 2. Abschlagsrechnung RE0020 vom 10.11.2026");
    assert.equal(p[0].einzelpreis, -420.17);
    assert.match(p[0].beschreibung, /420,17\s€ zzgl\. 19 % USt 79,83\s€ = 500,00\s€/);
    assert.equal(abzugPositionen([{ id: "x", nr: 1, nummer: "R", datum: "2026-11-10", steuern }], true)[0].einzelpreis, -500);
  });
});
