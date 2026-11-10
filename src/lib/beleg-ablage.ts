import "server-only";
import { getCustomer } from "@/customers";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeFirma, ZAHLUNGSART_TEXT, type BelegDetail } from "@/lib/belege";
import { belegPdf, pdfDateiname, type PdfBeleg, type PdfPosition } from "@/lib/pdf/beleg-pdf";

/*
  PDFs der App-Belege: erzeugen (Entwurf mit Wasserzeichen, fertiggestellt als Original) und im privaten
  Speicher „belege“ ablegen. Pfad: <beleg_id>/<Nummer>[_V<n>]_<Belegart>.pdf. Die Ablage in OneDrive folgt mit dem
  OneDrive-Modul.
*/

export const BUCKET = "belege";

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
  return belegPdf({ ...daten, firma, logo: getCustomer().logoPfade, entwurf });
}

/** Original-PDF eines fertiggestellten App-Belegs erzeugen und ablegen; setzt beleg.pdf_pfad */
export async function pdfAblegen(d: BelegDetail): Promise<string> {
  const { supabase } = await pruefeSitzung();
  const pdf = await erzeugePdf(druckDaten(d), false);
  const pfad = `${d.beleg.id}/${pdfDateiname(d.beleg)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(pfad, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`PDF konnte nicht abgelegt werden: ${error.message}`);
  const { error: e2 } = await supabase.from("beleg").update({ pdf_pfad: pfad }).eq("id", d.beleg.id);
  if (e2) throw new Error("PDF-Pfad konnte nicht gespeichert werden.");
  return pfad;
}

export async function pdfLaden(pfad: string): Promise<Buffer | null> {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.storage.from(BUCKET).download(pfad);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}
