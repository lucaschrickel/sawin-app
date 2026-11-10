import "server-only";
import { belegSummen, zahl } from "@/lib/beleg-summen";
import type { EditorZustand } from "@/lib/beleg-typen";
import { htmlBereinigen } from "@/lib/html";
import { EDITOR_BELEGARTEN } from "@/lib/belege-status";

/* Eingaben des Beleg-Editors prüfen und für die Datenbank aufbereiten (Speichern und Vorschau) */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const STEUERARTEN = ["standard", "bauleistung_13b", "steuerfrei"] as const;
const kurz = (s: unknown, max: number) => String(s ?? "").slice(0, max);
const ganz = (s: string) => (s.trim() === "" ? "" : String(Math.max(0, Math.round(zahl(s)))));

/** Fehler der Datenbank in verständliche Meldungen übersetzen (eigene Meldungen der Funktionen durchreichen) */
export function meldung(error: { code?: string; message?: string } | null, standard: string): string {
  if (!error) return standard;
  if (["23514", "23505", "P0001", "P0002", "22023", "42501"].includes(error.code ?? "") && error.message && !/violates|policy|permission denied/i.test(error.message))
    return error.message;
  return standard;
}

/** Eingaben prüfen und für beleg_speichern aufbereiten (Summen rechnet der Server) */
export function aufbereiten(z: EditorZustand): { fehler: string } | { kopf: Record<string, unknown>; positionen: Record<string, unknown>[] } {
  const k = z.kopf;
  if (!EDITOR_BELEGARTEN.includes(k.art)) return { fehler: "Diese Belegart wird hier nicht angelegt." };
  if (k.id && !UUID.test(k.id)) return { fehler: "Beleg nicht gefunden." };
  if (!UUID.test(k.kunde_id)) return { fehler: "Bitte einen Kunden wählen." };
  if (!STEUERARTEN.includes(k.steuerart)) return { fehler: "Bitte eine Steuerart wählen." };
  for (const [name, wert] of [["Datum", k.datum], ["Gültig bis", k.gueltig_bis], ["Lieferdatum", k.liefertermin], ["Zeitraum von", k.leistung_von], ["Zeitraum bis", k.leistung_bis]] as const)
    if (wert && !DATUM.test(wert)) return { fehler: `${name}: ungültiges Datum.` };
  if (k.leistung_von && k.leistung_bis && k.leistung_bis < k.leistung_von) return { fehler: "Das Ende des Zeitraums liegt vor dem Beginn." };
  if (k.zahlungsbedingung_id && !UUID.test(k.zahlungsbedingung_id)) return { fehler: "Bitte eine Zahlungsbedingung wählen." };
  if (z.positionen.length > 500) return { fehler: "Höchstens 500 Positionen je Beleg." };
  const rabatt = zahl(k.gesamtrabatt_prozent);
  if (rabatt < 0 || rabatt > 100) return { fehler: "Der Gesamtrabatt liegt zwischen 0 und 100 %." };

  const ohneZahlung = k.art === "lieferschein" || k.art === "gutschrift";
  const mitLeistung = k.art === "auftragsbestaetigung" || k.art === "rechnung" || k.art === "abschlagsrechnung" || k.art === "gutschrift";
  const positionen = z.positionen.map((p) => ({
    id: p.id && UUID.test(p.id) ? p.id : null,
    typ: p.typ === "text" ? "text" : "artikel",
    titel: kurz(p.titel, 300).trim(),
    // formatierter Text: serverseitig nach Whitelist bereinigt (CLAUDE.md Sicherheit Punkt 11)
    beschreibung_html: htmlBereinigen(p.beschreibung),
    optional: k.art === "angebot" && !!p.optional,
    menge: zahl(p.menge),
    einheit: kurz(p.einheit, 20).trim(),
    einzelpreis: zahl(p.einzelpreis),
    rabatt_prozent: Math.min(Math.max(zahl(p.rabatt_prozent), 0), 100),
    steuersatz: k.steuerart === "standard" ? Math.min(Math.max(zahl(p.steuersatz), 0), 100) : 0,
    abzug_beleg_id: k.art === "rechnung" && p.abzug_beleg_id && UUID.test(p.abzug_beleg_id) ? p.abzug_beleg_id : null,
  }));
  const s = belegSummen(
    positionen.map((p) => ({ ...p, abzug: !!p.abzug_beleg_id })) as Parameters<typeof belegSummen>[0],
    { steuerart: k.steuerart, preise_brutto: k.preise_brutto, gesamtrabatt_prozent: rabatt },
  );
  const abschlagWert = zahl(k.abschlag_wert);
  const kopf = {
    art: k.art,
    vorgaenger_id: k.vorgaenger_id,
    anfrage_id: k.bezug.art === "anfrage" ? k.bezug.id : null,
    auftrag_id: k.bezug.art === "auftrag" ? k.bezug.id : null,
    ticket_id: k.bezug.art === "ticket" ? k.bezug.id : null,
    kunde_id: k.kunde_id,
    adresse_name: kurz(k.adresse_name, 200),
    adresse_zusatz: kurz(k.adresse_zusatz, 200),
    adresse_strasse: kurz(k.adresse_strasse, 200),
    adresse_plz: kurz(k.adresse_plz, 20),
    adresse_ort: kurz(k.adresse_ort, 120),
    adresse_land: kurz(k.adresse_land, 80),
    datum: k.datum,
    titel: kurz(k.titel, 200),
    bauvorhaben: kurz(k.bauvorhaben, 300),
    objekt: kurz(k.objekt, 300),
    einleitung: kurz(k.einleitung, 4000),
    lieferbedingungen: k.art === "auftragsbestaetigung" || k.art === "teil_ab" ? kurz(k.lieferbedingungen, 4000) : "",
    nachbemerkung: kurz(k.nachbemerkung, 4000),
    zahlungsbedingung_id: ohneZahlung ? "" : k.zahlungsbedingung_id,
    zahlungsbedingung_text: ohneZahlung ? "" : kurz(k.zahlungsbedingung_text, 4000),
    zahlungsziel_tage: ohneZahlung ? "" : ganz(k.zahlungsziel_tage),
    skontoziel_tage: ohneZahlung ? "" : ganz(k.skontoziel_tage),
    skonto_prozent: ohneZahlung || !k.skonto_prozent.trim() ? "" : String(Math.min(Math.max(zahl(k.skonto_prozent), 0), 99.99)),
    steuerart: k.steuerart,
    preise_brutto: k.steuerart === "standard" && k.preise_brutto,
    gesamtrabatt_prozent: k.art === "abschlagsrechnung" ? "0" : String(rabatt),
    gueltig_bis: k.art === "angebot" ? k.gueltig_bis : "",
    liefertermin: k.art === "lieferschein" || k.art === "teil_ab" ? k.liefertermin : "",
    leistung_von: mitLeistung ? k.leistung_von : "",
    leistung_bis: mitLeistung ? k.leistung_bis : "",
    abschlag_prozent: k.art === "abschlagsrechnung" && k.abschlag_art === "prozent" && abschlagWert > 0 ? String(Math.min(abschlagWert, 100)) : "",
    abschlag_betrag: k.art === "abschlagsrechnung" && k.abschlag_art === "betrag" && abschlagWert > 0 ? String(abschlagWert) : "",
    summe_netto: String(s.netto),
    summe_brutto: String(s.brutto),
    tags: [...new Set(k.tags.map((t) => kurz(t, 40).trim()).filter(Boolean))].slice(0, 30),
    kommentar_intern: kurz(k.kommentar_intern, 4000),
  };
  return { kopf, positionen };
}

