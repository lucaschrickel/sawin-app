// Unit-Tests für die Zuordnung Airtable → App (Datenübernahme). Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anrede, einzeilig, kw, lexwareZuBeleg, lieferJahr, lieferungZerlegen, mehrzeilig, planen, plz, steuer, textZuHtml } from "../../scripts/airtable/zuordnung.mjs";
import { kontaktHash } from "../../src/lib/lexware/kontakt-daten.ts";

describe("Hilfen", () => {
  it("Texte, PLZ, Anrede", () => {
    assert.equal(einzeilig(" Max\n Muster \n"), "Max Muster");
    assert.equal(mehrzeilig("\\-\n"), null);
    assert.equal(mehrzeilig("Fenster\n\\- Tür\n"), "Fenster\n- Tür");
    assert.equal(plz(1234), "01234");
    assert.equal(plz(49074), "49074");
    assert.equal(anrede("Ehel.  "), "Eheleute");
    assert.equal(anrede("Fam"), "Familie");
    assert.equal(anrede("Hr."), "Herr");
    assert.equal(anrede(""), null);
  });
  it("Steuersatz aus netto und brutto", () => {
    assert.deepEqual(steuer(100, 119), { steuerart: "standard", steuern: [{ satz: 19, netto: 100, steuer: 19, brutto: 119 }], satz: 19 });
    assert.equal(steuer(500, 500).steuerart, "bauleistung_13b");
    assert.deepEqual(steuer(0, 0).steuern, []);
  });
  it("Lieferung KW zerlegen", () => {
    assert.deepEqual(lieferungZerlegen("BE KW 38, Ino KW 42, BE(Fensterbank) KW 41, BE! KW 3, unklar"), [
      { kuerzel: "BE", zusatz: null, kw: 38 },
      { kuerzel: "Ino", zusatz: null, kw: 42 },
      { kuerzel: "BE", zusatz: "Fensterbank", kw: 41 },
      { kuerzel: "BE", zusatz: null, kw: 3 },
      { rest: "unklar" },
    ]);
    assert.equal(kw("2026-11-12"), 46);
    assert.equal(lieferJahr(50, "2026-11-12"), 2026);
    assert.equal(lieferJahr(3, "2026-11-12"), 2027);
  });
});

// Kleine Base: Kunde mit Auftrag (Angebot → AB → 2 Abschläge, einer storniert → Rechnung), Kunde mit Angebot ohne
// Auftrag, Rechnung ohne Auftrag, in Lexware gelöschter Beleg
const K1 = { id: "recK1", fields: { Kundennummer: 10002, Anrede: "Herr", Vorname: "Max", Nachname: "Muster", "Straße 1": "Weg 1", "PLZ 1": 1234, "Ort 1": "Ort", "Land 1": "DE", "E-Mail 1": "MAX@EXAMPLE.ORG", "Lexware Contact ID": "lexK1", "Straße 2": "Baustelle 5", "PLZ 2": 49074, "Ort 2": "Osnabrück", Erstellt: "2026-07-22T08:00:00.000Z" } };
const K2 = { id: "recK2", fields: { Kundennummer: 10010, Firmenname: "Bau GmbH", Vorname: "Erika", Nachname: "Beispiel", Anrede: "Frau", "Lexware Contact ID": "lexK2" } };
const beleg = (id: string, art: string, nr: string, status: string, datum: string, extra: Record<string, unknown> = {}) => ({
  id,
  fields: { Belegart: art, Belegnummer: nr, Status: status, Belegdatum: datum, "Lexware-Beleg-ID": `lex-${id}`, "Betrag netto": 1000, "Betrag brutto": 1190, Deeplink: `https://app.lexware.de/permalink/x/view/lex-${id}`, Titel: art, ...extra },
});
const DATEN = {
  Kunden: [K1, K2],
  "Aufträge": [
    { id: "recA1", fields: { "AB-Nr.": "AB2260100", Kunden: ["recK1"], Status: "Bestellung", Montagestatus: "Offen", Fenster: true, Bestellstatus: "Bestellt", "Lieferung KW": "BE KW 50, Ino KW 2", Erstellt: "2026-11-01T08:00:00.000Z", "Link zum OneDrive-Ordner (URL)": "https://x.sharepoint.com/sites/S/Kundenprojekte/2026/26-0001_Muster", "OneDrive Ordner-ID": "01ABC" } },
    { id: "recA2", fields: { Kunden: ["recK2"], Status: "Montage", Erstellt: "2026-11-02T08:00:00.000Z" } },
  ],
  Belege: [
    beleg("recB1", "Angebot", "AG1260100", "Angenommen", "2026-10-01", { Auftrag: ["recA1"], Kunde: ["recK1"] }),
    beleg("recB2", "Auftragsbestätigung", "AB2260100", "Offen", "2026-10-05", { Auftrag: ["recA1"], Kunde: ["recK1"], "Vorgänger-IDs": "lex-recB1" }),
    beleg("recB3", "Abschlagsrechnung", "RE0900", "Bezahlt", "2026-10-06", { Kunde: ["recK1"], "Vorgänger-IDs": "lex-recB2", "Offener Betrag": 0 }),
    beleg("recB4", "Abschlagsrechnung", "RE0901", "Storniert", "2026-10-07", { Kunde: ["recK1"], "Vorgänger-IDs": "lex-recB2" }),
    beleg("recB5", "Rechnung", "RE0950", "Offen", "2026-11-01", { Kunde: ["recK1"], "Vorgänger-IDs": "lex-recB2\nlex-recB3", "Offener Betrag": 500 }),
    beleg("recB6", "Angebot", "AG1260200", "Offen", "2026-11-03", { "Lexware-Kontakt-ID": "lexK2" }),
    beleg("recB7", "Rechnung", "RE0700", "Bezahlt", "2025-12-01", { Kunde: ["recK2"] }),
    beleg("recB8", "Angebot", "AG1260300", "Offen", "2026-11-04", { Kunde: ["recK2"], "Gelöscht in Lexware": true }),
  ],
  Aufgaben: [{ id: "recT1", fields: { Aufgabe: "Rückruf", Auftrag: ["recA1"], Status: "In Arbeit", "Priorität": "Hoch", "Zuständig": [{ email: "buero@example.org", name: "Büro" }] } }],
  Anfragen: [],
  Zeiterfassung: [],
};

describe("Plan", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Plan aus reinem JavaScript (scripts/)
  const p: any = planen({ daten: DATEN, benutzer: new Map([["buero@example.org", "u1"]]), lieferanten: new Map([["be", "l1"]]), einstellung: { drive_id: "drive", angebot_gueltig_tage: 30 }, heute: "2026-11-12" });
  const b = (id: string) => p.belege.find((x: { airtable_id: string }) => x.airtable_id === id);

  it("Kunden mit Lexware-Prüfsumme, Anrede und Lieferadresse", () => {
    const k = p.kunden[0];
    assert.equal(k.name, "Max Muster");
    assert.equal(k.anrede, "Herr");
    assert.equal(k.plz, "01234");
    assert.equal(k.land, "Deutschland");
    assert.equal(k.email, "max@example.org");
    assert.equal(k.altbestand, true);
    assert.equal(k.lexware_hash, kontaktHash(k));
    assert.equal(p.lieferadressen.length, 1);
    const f = p.kunden[1];
    assert.equal(f.typ, "firma");
    assert.equal(f.anrede, null);
    assert.equal(f.ansprechpartner, "Frau Erika Beispiel");
  });

  it("Aufträge: mit AB-Nummer und ohne (neue Nummer, Prüfhinweis)", () => {
    const a1 = p.auftraege.find((a: { airtable_id: string }) => a.airtable_id === "recA1");
    assert.equal(a1.nummer, "AB2260100");
    assert.equal(a1.phase, "bestellung");
    assert.deepEqual(a1.produkte, ["Fenster"]);
    const a2 = p.auftraege.find((a: { airtable_id: string }) => a.airtable_id === "recA2");
    assert.equal(a2.nummer, null);
    assert.equal(a2.phase, "montage");
    assert.match(a2.pruefhinweis, /ohne Auftragsbestätigung/);
  });

  it("Kette: Belege ohne Auftrag-Link folgen der Kette, Abschläge nummeriert, Storno zählt nicht", () => {
    for (const id of ["recB1", "recB2", "recB3", "recB4", "recB5"]) assert.equal(b(id)._auftrag, "recA1", id);
    assert.equal(b("recB1")._wurzel, null);
    assert.equal(b("recB2")._wurzel, "recB1");
    assert.equal(b("recB2")._vorgaenger, "recB1");
    assert.equal(b("recB2").status, "fertiggestellt");
    assert.equal(b("recB3").abschlag_nr, 1);
    assert.equal(b("recB4").abschlag_nr, 2);
    assert.equal(b("recB4").status, "storniert");
    assert.equal(b("recB4").offen_betrag, 0);
    assert.equal(b("recB5").teil, false);
    assert.equal(b("recB5").offen_betrag, 500);
    assert.equal(b("recB5").lexware_status, "fertig");
    assert.equal(b("recB1").lexware_status, null);
    assert.equal(b("recB1").gueltig_bis, "2026-10-31");
  });

  it("Ohne Airtable-Auftrag: Angebot → Anfrage, Rechnung → nur am Kunden; gelöschte nicht", () => {
    assert.equal(b("recB6")._anfrage, "kette:recB6");
    assert.equal(b("recB6")._kunde, "recK2");
    assert.equal(p.anfragen.find((a: { airtable_id: string }) => a.airtable_id === "kette:recB6").status, "angebot_versendet");
    assert.equal(b("recB7")._auftrag, null);
    assert.equal(b("recB7")._anfrage, null);
    assert.equal(b("recB8"), undefined);
    assert.ok(p.probleme.some((x: { text: string }) => /gelöscht/.test(x.text)));
  });

  it("Ordner, Bestellungen, Aufgaben, Nummernkreise", () => {
    assert.equal(p.ordner[0].status, "angelegt");
    assert.equal(p.ordner[0].name, "26-0001_Muster");
    assert.equal(p.bestellungen.length, 1);
    assert.equal(p.bestellungen[0].liefer_kw, 50);
    assert.equal(p.bestellzeilen[0].artikeltext, "Lieferung BE");
    // Ino ist keinem Lieferanten zugeordnet: Text bleibt am Auftrag
    assert.match(p.auftraege[0].bemerkung, /Lieferung laut Airtable: BE KW 50, Ino KW 2/);
    assert.equal(p.aufgaben[0].zustaendig_id, "u1");
    assert.equal(p.aufgaben[0]._auftrag, "recA1");
    assert.deepEqual(p.nummernkreise, { angebot: 200, auftragsbestaetigung: 100, kunde: 10010 });
  });
});

describe("Positionen aus Lexware", () => {
  it("Brutto-Angebot mit Text- und optionaler Position", () => {
    const { kopf, positionen } = lexwareZuBeleg({
      title: "Angebot",
      introduction: "Hallo",
      taxConditions: { taxType: "gross" },
      totalPrice: { totalDiscountPercentage: 5 },
      address: { name: "Max Muster", street: "Weg 1", zip: "01234", city: "Ort" },
      lineItems: [
        { type: "custom", name: "Fenster", description: "• weiß\n• 3-fach", quantity: 2, unitName: "Stück", unitPrice: { netAmount: 100, grossAmount: 119, taxRatePercentage: 19 }, discountPercentage: 10 },
        { type: "text", name: "Hinweis", description: "a < b" },
        { type: "custom", name: "Extra", quantity: 1, unitName: "Stück", unitPrice: { netAmount: 10, grossAmount: 11.9, taxRatePercentage: 19 }, optional: true },
      ],
    });
    assert.equal(kopf.steuerart, "standard");
    assert.equal(kopf.preise_brutto, true);
    assert.equal(kopf.gesamtrabatt_prozent, 5);
    assert.equal(kopf.adresse_plz, "01234");
    assert.equal(positionen[0].einzelpreis, 119);
    assert.equal(positionen[0].beschreibung_html, "<p>• weiß<br>• 3-fach</p>");
    assert.equal(positionen[1].typ, "text");
    assert.equal(positionen[1].beschreibung_html, "<p>a &lt; b</p>");
    assert.equal(positionen[2].optional, true);
    assert.equal(textZuHtml(""), null);
  });
  it("§ 13b: netto, Satz 0", () => {
    const { kopf, positionen } = lexwareZuBeleg({ taxConditions: { taxType: "constructionService13b" }, lineItems: [{ type: "custom", name: "X", quantity: 1, unitName: "St", unitPrice: { netAmount: 50, taxRatePercentage: 0 } }] });
    assert.equal(kopf.steuerart, "bauleistung_13b");
    assert.equal(positionen[0].einzelpreis, 50);
    assert.equal(positionen[0].steuersatz, 0);
  });
});
