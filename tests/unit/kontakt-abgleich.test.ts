// Unit-Tests: vorhandenen Lexware-Kontakt finden statt doppelt anzulegen. Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kontaktAbgleich, normal, type LexKontakt } from "../../src/lib/lexware/kontakt-abgleich.ts";

const kunde = { nummer: "30001", name: "Max Mustermann", email: "max@example.org", strasse: "Ringstraße 12", plz: "38550" };
const k = (id: string, x: Partial<LexKontakt>): LexKontakt => ({ id, ...x });

describe("Kontaktabgleich", () => {
  it("Vergleichsform", () => {
    assert.equal(normal("Ringstraße 12"), normal("Ringstr. 12"));
    assert.equal(normal(" Müller-Lüdenscheidt "), "mullerludenscheidt");
  });
  it("keiner bei leerer Liste oder ohne Bezug", () => {
    assert.deepEqual(kontaktAbgleich(kunde, []), { art: "keiner" });
    assert.deepEqual(kontaktAbgleich(kunde, [k("a", { person: { lastName: "Andere" } })]), { art: "keiner" });
  });
  it("eindeutig: E-Mail und Name", () => {
    const r = kontaktAbgleich(kunde, [k("a", { person: { firstName: "Max", lastName: "Mustermann" }, emailAddresses: { business: ["MAX@example.org"] } })]);
    assert.equal(r.art, "eindeutig");
    assert.equal(r.art === "eindeutig" && r.id, "a");
  });
  it("eindeutig: Name und Adresse (Schreibweise Straße/Str.)", () => {
    const r = kontaktAbgleich(kunde, [k("a", { person: { firstName: "Max", lastName: "Mustermann" }, addresses: { billing: [{ street: "Ringstr. 12", zip: "38550", city: "Isenbüttel" }] } })]);
    assert.equal(r.art, "eindeutig");
  });
  it("eindeutig: Kundennummer", () => {
    const r = kontaktAbgleich(kunde, [k("a", { company: { name: "Ganz anders GmbH" }, roles: { customer: { number: 30001 } } })]);
    assert.equal(r.art, "eindeutig");
  });
  it("unsicher: nur gleicher Name, oder zwei sichere Treffer", () => {
    const nurName = kontaktAbgleich(kunde, [k("a", { person: { firstName: "Max", lastName: "Mustermann" } })]);
    assert.equal(nurName.art, "unsicher");
    const zwei = kontaktAbgleich(kunde, [
      k("a", { person: { firstName: "Max", lastName: "Mustermann" }, emailAddresses: { business: ["max@example.org"] } }),
      k("b", { person: { firstName: "Max", lastName: "Mustermann" }, addresses: { billing: [{ street: "Ringstraße 12", zip: "38550" }] } }),
    ]);
    assert.equal(zwei.art, "unsicher");
    assert.equal(zwei.art === "unsicher" && zwei.kandidaten.length, 2);
  });
  it("archivierte Kontakte zählen nicht", () => {
    assert.deepEqual(kontaktAbgleich(kunde, [k("a", { archived: true, person: { firstName: "Max", lastName: "Mustermann" }, emailAddresses: { business: ["max@example.org"] } })]), { art: "keiner" });
  });
});
