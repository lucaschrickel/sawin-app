// Unit-Tests für die Logik der Plantafel: Raster, Ziehen und Ablegen, Duplizieren, Farben, Pipeline, Reihenfolge.
// Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  balkenFarbe,
  besetzungNachAblage,
  besetzungNeu,
  freigabeVorauswahl,
  gruppenOrdnen,
  inZeile,
  kontrast,
  naechsterWerktag,
  pipelineAblage,
  pipelineStufe,
  plusWerktage,
  schriftAuf,
  spurenVerteilen,
  stufeDatum,
  tagAusSlot,
  vorSchieben,
  zeileAus,
  zeitNachZug,
  zeitNeu,
  type TafelKolonne,
} from "../../src/lib/plantafel-logik.ts";
import { arbeitstage, arbeitstageWochen, lokalAus, slotAus, slotsGesamt, type Raster } from "../../src/lib/woche.ts";

const WOCHE: Raster = { tage: arbeitstage("2026-12-14"), von: 7, bis: 16 };
const VIER: Raster = { tage: arbeitstageWochen("2026-12-14", 4), von: 7, bis: 16, tagesgenau: true };
const KOL: TafelKolonne[] = [
  { id: "k1", name: "Kolonne 1", stammfahrzeug_id: "f1", mitglieder: ["anna", "ben"] },
  { id: "k2", name: "Kolonne 2", stammfahrzeug_id: null, mitglieder: [] },
];
const e = { monteure: ["anna"], fahrzeug_id: null, ressource_id: null };

describe("Raster", () => {
  it("1 Woche: 5 Tage × 9 Stunden, 4 Wochen: 20 Tage tagesgenau", () => {
    assert.equal(slotsGesamt(WOCHE), 45);
    assert.equal(slotsGesamt(VIER), 20);
    assert.equal(VIER.tage[5], "2026-12-21");
  });
  it("Stundenraster: Beginn rundet ab, Ende rundet auf; Ende am Tagesrand ist Arbeitsende", () => {
    assert.equal(slotAus("2026-12-14T08:30", WOCHE, "beginn"), 1);
    assert.equal(slotAus("2026-12-14T08:30", WOCHE, "ende"), 2);
    assert.equal(lokalAus(9, WOCHE, "ende"), "2026-12-14T16:00");
    assert.equal(lokalAus(9, WOCHE, "beginn"), "2026-12-15T07:00");
  });
  it("Wochenende und Tage außerhalb: Beginn am nächsten, Ende nach dem vorigen Arbeitstag", () => {
    assert.equal(slotAus("2026-12-12T07:00", WOCHE, "beginn"), 0, "Samstag davor");
    assert.equal(slotAus("2026-12-19T12:00", WOCHE, "ende"), 45, "Samstag danach");
    assert.equal(slotAus("2026-12-19T07:00", VIER, "beginn"), 5, "Samstag in der 4-Wochen-Ansicht → Montag");
    assert.equal(slotAus("2026-12-20T12:00", VIER, "ende"), 5, "Sonntag → nach Freitag");
  });
  it("tagesgenau: ein Slot je Tag, Ende nach dem Tag", () => {
    assert.equal(slotAus("2026-12-15T07:00", VIER, "beginn"), 1);
    assert.equal(slotAus("2026-12-16T16:00", VIER, "ende"), 3);
    assert.equal(lokalAus(3, VIER, "ende"), "2026-12-16T16:00");
    assert.equal(lokalAus(5, VIER, "beginn"), "2026-12-21T07:00");
  });
});

describe("Ziehen: Zeiten", () => {
  const ein = { beginn: "2026-12-14T08:00", ende: "2026-12-15T12:00" };
  it("Stundenraster: verschieben behält die Länge in Slots", () => {
    // Mo 8 (Slot 1) bis Di 12 (Slot 14) um 2 Stunden nach hinten
    assert.deepEqual(zeitNachZug(ein, "verschieben", 1, 14, 3, 16, WOCHE), { beginn: "2026-12-14T10:00", ende: "2026-12-15T14:00" });
  });
  it("Stundenraster: Enden ziehen ändert nur eine Seite; Ende vor Beginn abgelehnt; ohne Bewegung null", () => {
    assert.deepEqual(zeitNachZug(ein, "ende", 1, 14, 1, 18, WOCHE), { beginn: ein.beginn, ende: "2026-12-15T16:00" });
    assert.deepEqual(zeitNachZug(ein, "anfang", 1, 14, 0, 14, WOCHE), { beginn: "2026-12-14T07:00", ende: ein.ende });
    assert.equal(zeitNachZug(ein, "anfang", 1, 14, 14, 14, WOCHE), null);
    assert.equal(zeitNachZug(ein, "verschieben", 1, 14, 1, 14, WOCHE), null);
  });
  it("tagesgenau: verschieben um Werktage, Uhrzeiten bleiben, über das Wochenende", () => {
    const fr = { beginn: "2026-12-17T09:30", ende: "2026-12-18T14:00" }; // Do–Fr
    assert.deepEqual(zeitNachZug(fr, "verschieben", 3, 5, 4, 6, VIER), { beginn: "2026-12-18T09:30", ende: "2026-12-21T14:00" });
  });
  it("tagesgenau: Ende auf einen anderen Tag ziehen behält die Uhrzeit", () => {
    const fr = { beginn: "2026-12-17T09:30", ende: "2026-12-18T14:00" };
    assert.deepEqual(zeitNachZug(fr, "ende", 3, 5, 3, 8, VIER), { beginn: fr.beginn, ende: "2026-12-23T14:00" });
    assert.deepEqual(zeitNachZug(fr, "anfang", 3, 5, 1, 5, VIER), { beginn: "2026-12-15T09:30", ende: fr.ende });
    assert.equal(zeitNachZug(fr, "anfang", 3, 5, 5, 5, VIER), null, "Beginn nach dem Ende");
  });
  it("neuer Einsatz: ab der Stunde bis Arbeitsende bzw. ganzer Tag", () => {
    assert.deepEqual(zeitNeu(11, WOCHE), { beginn: "2026-12-15T09:00", ende: "2026-12-15T16:00" });
    assert.deepEqual(zeitNeu(6, VIER), { beginn: "2026-12-22T07:00", ende: "2026-12-22T16:00" });
    assert.equal(tagAusSlot(11, WOCHE), "2026-12-15");
    assert.equal(tagAusSlot(6, VIER), "2026-12-22");
  });
  it("Werktage: plus und minus über das Wochenende, nächster Werktag ohne Feiertag", () => {
    assert.equal(plusWerktage("2026-12-18", 1), "2026-12-21");
    assert.equal(plusWerktage("2026-12-21", -1), "2026-12-18");
    assert.equal(naechsterWerktag("2026-12-24", ["2026-12-25"]), "2026-12-28");
  });
});

describe("Ablegen: Team, Fahrzeug, Ressource", () => {
  it("Monteur zu Monteur: getauscht; Fahrzeug aus der Kolonne des Ziels", () => {
    assert.deepEqual(besetzungNachAblage({ ...e, monteure: ["carl"] }, { art: "m", id: "carl" }, { art: "m", id: "anna" }, false, KOL), { monteure: ["anna"], fahrzeug_id: "f1", ressource_id: null });
  });
  it("Monteur schon im Einsatz: Fehler", () => {
    assert.deepEqual(besetzungNachAblage({ ...e, monteure: ["anna", "ben"] }, { art: "m", id: "anna" }, { art: "m", id: "ben" }, false, KOL), { fehler: "Der Monteur ist schon in diesem Einsatz." });
  });
  it("auf die Kolonne: alle Mitglieder und das Stammfahrzeug; leere Kolonne abgelehnt", () => {
    assert.deepEqual(besetzungNachAblage(e, { art: "m", id: "anna" }, { art: "k", id: "k1" }, false, KOL), { monteure: ["anna", "ben"], fahrzeug_id: "f1", ressource_id: null });
    assert.ok("fehler" in besetzungNachAblage(e, { art: "m", id: "anna" }, { art: "k", id: "k2" }, false, KOL));
  });
  it("auf eine Ressource: Team bleibt; zurück auf einen Monteur: Ressource entfällt", () => {
    assert.deepEqual(besetzungNachAblage(e, { art: "m", id: "anna" }, { art: "r", id: "r1" }, false, KOL), { monteure: ["anna"], fahrzeug_id: null, ressource_id: "r1" });
    assert.deepEqual(besetzungNachAblage({ ...e, ressource_id: "r1" }, { art: "r", id: "r1" }, { art: "m", id: "ben" }, false, KOL), { monteure: ["ben"], fahrzeug_id: "f1", ressource_id: null });
  });
  it("Duplizieren auf einen Monteur: Kopie nur mit diesem Monteur, Ressource bleibt", () => {
    assert.deepEqual(besetzungNachAblage({ monteure: ["anna", "ben"], fahrzeug_id: "f9", ressource_id: "r1" }, { art: "m", id: "anna" }, { art: "m", id: "carl" }, true, KOL), { monteure: ["carl"], fahrzeug_id: "f9", ressource_id: "r1" });
  });
  it("neuer Einsatz aus der Pipeline: Monteur bzw. Kolonne", () => {
    assert.deepEqual(besetzungNeu({ art: "m", id: "ben" }, KOL), { monteure: ["ben"], fahrzeug_id: "f1", ressource_id: null });
    assert.deepEqual(besetzungNeu({ art: "k", id: "k1" }, KOL), { monteure: ["anna", "ben"], fahrzeug_id: "f1", ressource_id: null });
  });
  it("Zeilen: Kolonnenzeile nur, wenn alle Mitglieder im Team sind", () => {
    assert.equal(inZeile({ ...e, monteure: ["anna", "ben", "carl"] }, { art: "k", id: "k1" }, KOL), true);
    assert.equal(inZeile(e, { art: "k", id: "k1" }, KOL), false);
    assert.equal(inZeile({ ...e, ressource_id: "r1" }, { art: "r", id: "r1" }, KOL), true);
    assert.deepEqual(zeileAus("k:k1"), { art: "k", id: "k1" });
    assert.equal(zeileAus("x:1"), null);
  });
  it("Spuren: überlappende Balken untereinander, anschließende in derselben Spur", () => {
    const { balken, spuren } = spurenVerteilen([{ s: 0, en: 9 }, { s: 3, en: 5 }, { s: 9, en: 12 }]);
    assert.equal(spuren, 2);
    assert.deepEqual(balken.map((b) => b.spur), [0, 1, 0]);
  });
});

describe("Farben", () => {
  it("frei gewählte Farbe: Schrift mit mindestens 4,5:1", () => {
    for (const hex of ["#7A4FBF", "#FFE066", "#000000", "#FFFFFF", "#2E7D32", "#D2B19A", "#808080", "#1E88E5"]) {
      const s = schriftAuf(hex);
      assert.ok(kontrast(hex, s) >= 4.5, `${hex} mit ${s}: ${kontrast(hex, s).toFixed(2)}`);
    }
    assert.equal(schriftAuf("#FFE066"), "#171717");
    assert.equal(schriftAuf("#1A237E"), "#FFFFFF");
  });
  it("Standard nach Typ, Palette als Token, freie Farbe als Hex", () => {
    assert.deepEqual(balkenFarbe(null, "service"), { hintergrund: "var(--plan-2)", rand: "var(--plan-2)" });
    assert.deepEqual(balkenFarbe("plan-7", "auftrag"), { hintergrund: "var(--plan-7)", rand: "var(--plan-7)" });
    assert.equal(balkenFarbe("#7A4FBF", "auftrag").schrift, "#FFFFFF");
    assert.equal(balkenFarbe("url(x)", "reklamation").hintergrund, "var(--plan-5)", "ungültiger Wert fällt auf den Standard zurück");
  });
});

describe("Pipeline", () => {
  const a = { warten_auf_kunde: false, liefertermin: "2026-12-16", stufe_lieferung_datum: null, stufe_abschlag_datum: null, stufe_warten_datum: null, abschlaege_bezahlt: 0 };
  it("Stufe: Warten hat Vorrang, dann Abschlag bezahlt, sonst Lieferung", () => {
    assert.equal(pipelineStufe(a), "lieferung");
    assert.equal(pipelineStufe({ ...a, abschlaege_bezahlt: 1 }), "abschlag");
    assert.equal(pipelineStufe({ ...a, abschlaege_bezahlt: 1, warten_auf_kunde: true }), "warten");
  });
  it("Datum: eigenes Datum der Stufe, sonst Liefertermin, sonst nicht in der Pipeline", () => {
    assert.equal(stufeDatum(a), "2026-12-16");
    assert.equal(stufeDatum({ ...a, stufe_lieferung_datum: "2026-12-18" }), "2026-12-18");
    assert.equal(stufeDatum({ ...a, liefertermin: null }), null);
  });
  it("Ablegen: in „Warten“ setzt den Schalter, „Abschlag bezahlt“ entsteht nur durch Zahlung", () => {
    assert.deepEqual(pipelineAblage(a, "warten", "2026-12-17"), { warten_auf_kunde: true, stufe: "warten", feld: "stufe_warten_datum", datum: "2026-12-17" });
    assert.deepEqual(pipelineAblage(a, "abschlag", "2026-12-17"), { warten_auf_kunde: false, stufe: "lieferung", feld: "stufe_lieferung_datum", datum: "2026-12-17" });
    assert.deepEqual(pipelineAblage({ ...a, warten_auf_kunde: true, abschlaege_bezahlt: 2 }, "lieferung", "2026-12-17").stufe, "abschlag");
  });
});

describe("Reihenfolge und Freigabe", () => {
  it("vor ein anderes Element schieben, sonst ans Ende", () => {
    assert.deepEqual(vorSchieben(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
    assert.deepEqual(vorSchieben(["a", "b", "c"], "a", null), ["b", "c", "a"]);
  });
  it("Gruppen: gespeicherte Reihenfolge, neue Kolonnen vor „Ohne Kolonne“", () => {
    assert.deepEqual(gruppenOrdnen(["res", "kolonne:k1", "solo"], ["k1", "k2"]), ["res", "kolonne:k1", "kolonne:k2", "solo"]);
    assert.deepEqual(gruppenOrdnen(null, ["k1"]), ["kolonne:k1", "solo", "res"]);
    assert.deepEqual(gruppenOrdnen(["kolonne:weg", "solo"], []), ["solo", "res"]);
  });
  it("Sammelfreigabe: Einsätze mit Konflikt sind nicht vorausgewählt", () => {
    assert.deepEqual(freigabeVorauswahl([{ id: "a", konflikte: 0 }, { id: "b", konflikte: 2 }]), ["a"]);
  });
});
