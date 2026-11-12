// Unit-Tests für den Zurück-Verlauf je Browser-Tab. Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anzeige, maskeVon, ohneMaske, verlaufWeiter, zurueckPerHistorie, VERLAUF_MAX, type VerlaufEintrag } from "../../src/lib/verlauf.ts";

const geh = (v: VerlaufEintrag[], pfad: string, titel: string, laenge: number, seitenleiste = false) =>
  verlaufWeiter(v, { pfad, pathname: pfad.split("?")[0], titel, laenge }, seitenleiste);

describe("Masken", () => {
  it("Pfad ohne Filter; Beleg-Entwurf, Beleg und Bearbeiten zusammen", () => {
    assert.equal(maskeVon("/auftraege/"), "/auftraege");
    assert.equal(maskeVon("/beleg/abc"), "beleg:abc");
    assert.equal(maskeVon("/beleg/abc/bearbeiten"), "beleg:abc");
    assert.equal(maskeVon("/beleg/neu"), "beleg:neu");
  });
});

describe("Verlauf", () => {
  it("Seitenleiste beginnt neu, nur der Name der Maske; direkt geöffnet: fachlicher Pfad", () => {
    assert.deepEqual(anzeige(geh([], "/auftraege", "Aufträge", 2, true)), { art: "name" });
    assert.deepEqual(anzeige(geh([], "/auftraege/1", "AB1", 2)), { art: "pfad" });
  });
  it("Liste mit Filter → Auftrag → Reiter: zurück führt zur Liste mit Filter", () => {
    let v = geh([], "/auftraege", "Aufträge", 2, true);
    v = geh(v, "/auftraege?phase=montage", "Aufträge", 2);
    assert.equal(v.length, 1, "Filter ersetzt den Eintrag");
    v = geh(v, "/auftraege/1", "AB1 · Müller", 3);
    v = geh(v, "/auftraege/1?reiter=chat", "AB1 · Müller", 3);
    assert.equal(v.length, 2, "Reiter ersetzt den Eintrag");
    assert.deepEqual(anzeige(v), { art: "zurueck", titel: "Aufträge", pfad: "/auftraege?phase=montage" });
    assert.equal(v[1].pfad, "/auftraege/1?reiter=chat");
  });
  it("Nicht die fachliche Elternseite: Angebot aus der Liste „Angebote“ → zurück zu Angebote", () => {
    let v = geh([], "/belege/angebote", "Angebote", 2, true);
    v = geh(v, "/beleg/9", "AG1 · Angebot", 3);
    assert.deepEqual(anzeige(v), { art: "zurueck", titel: "Angebote", pfad: "/belege/angebote" });
  });
  it("Entwurf → gespeicherter Beleg und Bearbeiten → Ansicht ersetzen", () => {
    let v = geh([], "/auftraege/1", "AB1", 2);
    v = geh(v, "/beleg/neu?art=lieferschein", "Lieferschein erstellen", 3);
    v = geh(v, "/beleg/77", "LS1", 3);
    v = geh(v, "/beleg/77/bearbeiten", "LS1", 3);
    v = geh(v, "/beleg/77", "LS1", 3);
    assert.equal(v.length, 2);
    const a = anzeige(v);
    assert.equal(a.art === "zurueck" ? a.titel : null, "AB1");
  });
  it("Zurück (auch Browser-Zurück) zu einer früheren Maske kürzt den Verlauf", () => {
    let v = geh([], "/kunden", "Kunden", 2, true);
    v = geh(v, "/kunden/1", "Müller", 3);
    v = geh(v, "/auftraege/1", "AB1", 4);
    v = geh(v, "/kunden/1", "Müller", 3);
    assert.deepEqual(v.map((e) => e.titel), ["Kunden", "Müller"]);
    assert.deepEqual(anzeige(v), { art: "zurueck", titel: "Kunden", pfad: "/kunden" });
  });
  it("höchstens VERLAUF_MAX Einträge", () => {
    let v = geh([], "/", "Dashboard", 1, true);
    for (let i = 0; i < VERLAUF_MAX + 10; i++) v = geh(v, `/auftraege/${i}`, `A${i}`, i + 2);
    assert.equal(v.length, VERLAUF_MAX);
  });
});

describe("Gelöschter Vorgang", () => {
  it("verschwindet aus dem Verlauf; gleiche Nachbarn werden zusammengelegt", () => {
    let v = geh([], "/auftraege", "Aufträge", 2, true);
    v = geh(v, "/auftraege/1", "AB1", 3);
    v = geh(v, "/kunden/7", "Müller", 4);
    v = geh(v, "/auftraege/1?reiter=chat", "AB1", 5);
    assert.deepEqual(ohneMaske(v, "/auftraege/1").map((e) => e.titel), ["Aufträge"]);
    let w = geh([], "/kunden", "Kunden", 2, true);
    w = geh(w, "/auftraege/2", "AB2", 3);
    w = geh(w, "/kunden/7", "Müller", 4);
    w = geh(w, "/auftraege/1", "AB1", 5);
    w = geh(w, "/kunden/7", "Müller", 6);
    assert.deepEqual(w.map((e) => e.titel), ["Kunden", "AB2", "Müller"]);
  });
});

describe("Zurück per Browser-Verlauf", () => {
  it("nur, wenn die Maske mit einem Schritt betreten und seitdem nichts hinzugekommen ist", () => {
    let v = geh([], "/auftraege", "Aufträge", 2, true);
    v = geh(v, "/auftraege/1", "AB1", 3);
    assert.equal(zurueckPerHistorie(v, 3), true);
    assert.equal(zurueckPerHistorie(v, 4), false, "danach weitere Einträge im Browser");
    const direkt = geh([], "/auftraege/1", "AB1", 1);
    assert.equal(zurueckPerHistorie(direkt, 1), false);
    let z = geh([], "/auftraege", "Aufträge", 5, true);
    z = geh(z, "/auftraege/1", "AB1", 5); // nach Browser-Zurück und neuem Schritt bleibt die Länge gleich
    assert.equal(zurueckPerHistorie(z, 5), false);
  });
});
