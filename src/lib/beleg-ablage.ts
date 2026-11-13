import "server-only";
import { createHash } from "node:crypto";
import { getCustomer } from "@/customers";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { belegPdfAblegen, imHintergrund } from "@/lib/onedrive/ablage";
import { ladeFirma, ZAHLUNGSART_TEXT, type BelegDetail } from "@/lib/belege";
import { belegPdf, pdfDateiname, type PdfBeleg, type PdfPosition } from "@/lib/pdf/beleg-pdf";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  PDFs der App-Belege: erzeugen (Entwurf mit Wasserzeichen, fertiggestellt als Original) und im privaten
  Speicher „belege“ ablegen. Pfad: <beleg_id>/<Nummer>[_V<n>]_<Belegart>.pdf. Schreiben darf in den Speicher nur der
  Server (Service-Rolle, nach pruefeSitzung); Pfad und SHA-256 setzt die Datenbankfunktion beleg_pdf_setzen bzw.
  lexware_fertig/lexware_pdf, damit beides im Audit-Log steht. Benutzer lesen nur.
*/

export const BUCKET = "belege";

/** SHA-256 einer Datei (hex), steht am Beleg und im Audit-Log */
export const sha256 = (datei: Buffer) => createHash("sha256").update(datei).digest("hex");

/** PDF in den Speicher „belege“ schreiben (nur Server). Aufrufer prüfen vorher die Sitzung. */
export async function pdfSpeichern(pfad: string, pdf: Buffer): Promise<string> {
  const { error } = await createAdminClient().storage.from(BUCKET).upload(pfad, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error("Das PDF konnte nicht abgelegt werden.");
  return sha256(pdf);
}

/** Gespeicherten Beleg → Druckdaten */
export function druckDaten(d: BelegDetail): { b: PdfBeleg; positionen: PdfPosition[] } {
  const b = d.beleg;
  return {
    b: {
      art: b.art,
      nummer: b.nummer,
      version: b.version,
      datum: b.datum,
      kundennummer: b.kundennummer,
      bezug_nummer: b.auftrag?.nummer ?? null,
      adresse_name: b.adresse_name,
      adresse_zusatz: b.adresse_zusatz,
      adresse_strasse: b.adresse_strasse,
      adresse_plz: b.adresse_plz,
      adresse_ort: b.adresse_ort,
      adresse_land: b.adresse_land,
      titel: b.titel,
      bauvorhaben: b.bauvorhaben,
      objekt: b.objekt,
      einleitung: b.einleitung,
      lieferbedingungen: b.lieferbedingungen,
      nachbemerkung: b.nachbemerkung,
      zahlungsbedingung_text: b.zahlungsbedingung_text,
      zahlungsziel_tage: b.zahlungsziel_tage,
      skontoziel_tage: b.skontoziel_tage,
      skonto_prozent: b.skonto_prozent,
      steuerart: b.steuerart,
      preise_brutto: b.preise_brutto,
      gesamtrabatt_prozent: b.gesamtrabatt_prozent,
      gueltig_bis: b.gueltig_bis,
      liefertermin: b.liefertermin,
      leistung_von: b.leistung_von,
      leistung_bis: b.leistung_bis,
      bestaetigung: d.bestaetigt
        ? { ...d.bestaetigt, zahlungsart: ZAHLUNGSART_TEXT[d.bestaetigt.zahlungsart as keyof typeof ZAHLUNGSART_TEXT] ?? d.bestaetigt.zahlungsart, rest: b.offen_betrag ?? 0 }
        : null,
    },
    positionen: d.positionen,
  };
}

export async function erzeugePdf(daten: { b: PdfBeleg; positionen: PdfPosition[] }, entwurf: boolean): Promise<Buffer> {
  const firma = await ladeFirma();
  const kunde = getCustomer();
  return belegPdf({ ...daten, firma, logo: kunde.logoPfade, briefkopf: kunde.briefkopf, entwurf });
}

/** Original-PDF eines fertiggestellten App-Belegs erzeugen und ablegen; setzt beleg.pdf_pfad */
export async function pdfAblegen(d: BelegDetail): Promise<string> {
  const { benutzer } = await pruefeSitzung();
  const pdf = await erzeugePdf(druckDaten(d), false);
  const pfad = `${d.beleg.id}/${pdfDateiname(d.beleg)}`;
  const pruefsumme = await pdfSpeichern(pfad, pdf);
  const { error: e2 } = await createAdminClient().rpc("beleg_pdf_setzen", { p_id: d.beleg.id, p_benutzer: benutzer.id, p_pfad: pfad, p_sha256: pruefsumme });
  if (e2) throw new Error("PDF-Pfad konnte nicht gespeichert werden.");
  // zusätzlich in den OneDrive-Ordner (im Hintergrund; ohne Verbindung in den Zwischenspeicher)
  imHintergrund(() => belegPdfAblegen(d.beleg.id, pdf, benutzer.id), "Beleg-PDF");
  return pfad;
}

export async function pdfLaden(pfad: string): Promise<Buffer | null> {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.storage.from(BUCKET).download(pfad);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}
