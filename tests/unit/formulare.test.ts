// Unit-Tests für Formulare & Protokolle: Aufmaß → Angebotspositionen, Maße, Checklisten, Dateinamen. Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aufmassZuPositionen, checklisteFuer, elementeSumme, formularDateiname, formularReihenfolge, masse, mm } from "../../src/lib/formular-logik.ts";

const katalog = [
  { bezeichnung: "Kunststofffenster 3-fach verglast", einheit: "Stk", preis_netto: 480, beschreibung_html: "<p>Uw 0,9</p>" },
  { bezeichnung: "Montage pauschal", einheit: "Pauschal", preis_netto: 350.5, beschreibung_html: null },
];
const konfig = { artikel: { Fenster: "Kunststofffenster 3-fach verglast", Haustür: "Haustür Aluminium" }, zusatz: ["Montage pauschal", "Entsorgung"] };
const zeile = (z: Partial<Parameters<typeof aufmassZuPositionen>[0][number]>) => ({ raum: null, element: null, breite_mm: null, hoehe_mm: null, anzahl: null, anschlag: null, bemerkung: null, ...z });

describe("Maße", () => {
  it("nur ganze Zahlen größer null", () => {
    assert.equal(mm("1230"), 1230);
    assert.equal(mm("1.230"), 1230);
    assert.equal(mm(" 980 "), 980);
    assert.equal(mm("0"), null);
    assert.equal(mm("-5"), null);
    assert.equal(mm("12,5"), null);
    assert.equal(mm(""), null);
    assert.equal(mm("1234567"), null);
  });
  it("Anzeige mit Tausenderpunkt", () => {
    assert.equal(masse(1230, "1480"), "1.230 × 1.480 mm");
    assert.equal(masse("900", null), "Breite 900 mm");
    assert.equal(masse(null, null), "");
  });
  it("Summe der Elemente (leere Anzahl zählt als 1)", () => {
    assert.equal(elementeSumme([{ anzahl: "2" }, { anzahl: "" }, { anzahl: 3 }]), 6);
    assert.equal(elementeSumme([]), 0);
  });
});

describe("Aufmaß in Angebot übernehmen", () => {
  it("Katalogartikel je Element mit Maß, Raum/Anschlag/Bemerkung vor der Artikelbeschreibung, Zusatzartikel danach", () => {
    const p = aufmassZuPositionen(
      [zeile({ raum: "Küche", element: "Fenster", breite_mm: 1230, hoehe_mm: 1480, anzahl: 2, anschlag: "DIN links", bemerkung: "Rollladen <alt>" }), zeile({ element: "Haustür", breite_mm: "1100", hoehe_mm: "2100" })],
      katalog,
      konfig,
      { brutto: false, frei: false },
    );
    assert.equal(p.length, 3);
    assert.equal(p[0].titel, "Kunststofffenster 3-fach verglast, 1.230 × 1.480 mm");
    assert.equal(p[0].beschreibung, "<p>Küche · DIN links · Rollladen &lt;alt&gt;</p><p>Uw 0,9</p>");
    assert.equal(p[0].menge, "2");
    assert.equal(p[0].einzelpreis, "480");
    assert.equal(p[0].steuersatz, "19");
    // Haustür: Artikel fehlt im Katalog → Element als Titel, ohne Preis
    assert.equal(p[1].titel, "Haustür, 1.100 × 2.100 mm");
    assert.equal(p[1].einzelpreis, "");
    assert.equal(p[1].einheit, "Stk");
    assert.equal(p[1].menge, "1");
    // nur Zusatzartikel, die es im Katalog gibt
    assert.equal(p[2].titel, "Montage pauschal");
    assert.equal(p[2].einheit, "Pauschal");
    assert.equal(p[2].einzelpreis, "350,5");
    assert.notEqual(p[0].key, p[1].key);
  });
  it("Brutto-Eingabe rechnet 19 % auf, § 13b / steuerfrei mit 0 %", () => {
    const b = aufmassZuPositionen([zeile({ element: "Fenster" })], katalog, konfig, { brutto: true, frei: false });
    assert.equal(b[0].einzelpreis, "571,2");
    const f = aufmassZuPositionen([zeile({ element: "Fenster" })], katalog, konfig, { brutto: true, frei: true });
    assert.equal(f[0].einzelpreis, "480");
    assert.equal(f[0].steuersatz, "0");
  });
  it("Zeilen ohne Element entfallen; ohne Elemente keine Zusatzartikel", () => {
    assert.deepEqual(aufmassZuPositionen([zeile({ element: "  " })], katalog, konfig, { brutto: false, frei: false }), []);
  });
  it("Katalogname ohne Unterschied in Groß-/Kleinschreibung, sonst Element direkt im Katalog", () => {
    const p = aufmassZuPositionen([zeile({ element: "Montage pauschal" })], [{ ...katalog[1], bezeichnung: "montage PAUSCHAL" }], { artikel: {}, zusatz: [] }, { brutto: false, frei: false });
    assert.equal(p[0].titel, "montage PAUSCHAL");
    assert.equal(p[0].einzelpreis, "350,5");
  });
});

describe("Checkliste und Reihenfolge", () => {
  it("Punkte je Produkt in Reihenfolge der Produkte, ohne Dopplungen und ohne Produkte ohne Liste", () => {
    const c = checklisteFuer(["Fenster", "Markise", "Fenster", "Haustür"], { Haustür: ["a", "b"], Fenster: ["c"] });
    assert.deepEqual(c, [{ produkt: "Fenster", punkte: ["c"] }, { produkt: "Haustür", punkte: ["a", "b"] }]);
  });
  it("am Ticket zuerst der Servicebericht", () => {
    assert.equal(formularReihenfolge(true)[0], "servicebericht");
    assert.equal(formularReihenfolge(false)[0], "aufmass");
  });
});

describe("Dateiname", () => {
  it("<Nummer>_<Formular>_<Kunde>[_n].pdf ohne Sonderzeichen", () => {
    assert.equal(formularDateiname("aufmass", "AB2260227", "Müller & Söhne"), "AB2260227_Aufmassblatt_Mueller_Soehne.pdf");
    assert.equal(formularDateiname("uebergabeprotokoll", "ST-26-0004", null, 2), "ST-26-0004_Uebergabeprotokoll_2.pdf");
    assert.equal(formularDateiname("montageprotokoll", "../AB1", "a/b"), "AB1_Montageprotokoll_a_b.pdf");
  });
});
