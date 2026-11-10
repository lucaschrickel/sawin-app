import "server-only";
import { belegSummen, zahl } from "@/lib/beleg-summen";
import { textZuHtml, type EditorZustand } from "@/lib/beleg-typen";
import { APP_BELEGARTEN } from "@/lib/belege-status";

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
  if (!APP_BELEGARTEN.includes(k.art)) return { fehler: "Diese Belegart wird hier nicht angelegt." };
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

  const positionen = z.positionen.map((p) => ({
    id: p.id && UUID.test(p.id) ? p.id : null,
    typ: p.typ === "text" ? "text" : "artikel",
    titel: kurz(p.titel, 300).trim(),
    beschreibung_html: textZuHtml(kurz(p.beschreibung, 8000)),
    optional: k.art === "angebot" && !!p.optional,
    menge: zahl(p.menge),
    einheit: kurz(p.einheit, 20).trim(),
    einzelpreis: zahl(p.einzelpreis),
    rabatt_prozent: Math.min(Math.max(zahl(p.rabatt_prozent), 0), 100),
    steuersatz: k.steuerart === "standard" ? Math.min(Math.max(zahl(p.steuersatz), 0), 100) : 0,
  }));
  const s = belegSummen(positionen as Parameters<typeof belegSummen>[0], { steuerart: k.steuerart, preise_brutto: k.preise_brutto, gesamtrabatt_prozent: rabatt });
  const kopf = {
    art: k.art,
    vorgaenger_id: k.vorgaenger_id,
    anfrage_id: k.bezug.art === "anfrage" ? k.bezug.id : null,
    auftrag_id: k.bezug.art === "auftrag" ? k.bezug.id : null,
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
    lieferbedingungen: k.art === "auftragsbestaetigung" ? kurz(k.lieferbedingungen, 4000) : "",
    nachbemerkung: kurz(k.nachbemerkung, 4000),
    zahlungsbedingung_id: k.art === "lieferschein" ? "" : k.zahlungsbedingung_id,
    zahlungsbedingung_text: k.art === "lieferschein" ? "" : kurz(k.zahlungsbedingung_text, 4000),
    zahlungsziel_tage: k.art === "lieferschein" ? "" : ganz(k.zahlungsziel_tage),
    skontoziel_tage: k.art === "lieferschein" ? "" : ganz(k.skontoziel_tage),
    skonto_prozent: k.art === "lieferschein" || !k.skonto_prozent.trim() ? "" : String(Math.min(Math.max(zahl(k.skonto_prozent), 0), 99.99)),
    steuerart: k.steuerart,
    preise_brutto: k.steuerart === "standard" && k.preise_brutto,
    gesamtrabatt_prozent: String(rabatt),
    gueltig_bis: k.art === "angebot" ? k.gueltig_bis : "",
    liefertermin: k.art === "lieferschein" ? k.liefertermin : "",
    leistung_von: k.art === "auftragsbestaetigung" ? k.leistung_von : "",
    leistung_bis: k.art === "auftragsbestaetigung" ? k.leistung_bis : "",
    summe_netto: String(s.netto),
    summe_brutto: String(s.brutto),
    tags: [...new Set(k.tags.map((t) => kurz(t, 40).trim()).filter(Boolean))].slice(0, 30),
    kommentar_intern: kurz(k.kommentar_intern, 4000),
  };
  return { kopf, positionen };
}

