import { createHash } from "node:crypto";

/*
  Lexware-Kontakt aus dem Kunden der App (App → Lexware, nie zurück). Ohne weitere Importe, damit auch das
  Import-Skript (scripts/airtable-import.mjs) dieselbe Prüfsumme bilden kann: Ein übernommener Kunde gilt dann als
  „unverändert“ und sein Kontakt in Lexware wird erst aktualisiert, wenn jemand den Kunden in der App ändert.
*/

const LAENDER: Record<string, string> = {
  deutschland: "DE", germany: "DE", österreich: "AT", oesterreich: "AT", austria: "AT", schweiz: "CH", niederlande: "NL",
  belgien: "BE", luxemburg: "LU", frankreich: "FR", dänemark: "DK", daenemark: "DK", polen: "PL", tschechien: "CZ",
  italien: "IT", spanien: "ES",
};
export function landCode(land: string | null | undefined): string {
  const l = (land ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(l)) return l.toUpperCase();
  return LAENDER[l.toLowerCase()] ?? "DE";
}

export type KundeLex = {
  id: string;
  nummer: string;
  name: string;
  typ: "privat" | "firma";
  anrede: string | null;
  bauleister_13b: boolean;
  ansprechpartner: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
  telefon: string | null;
  email: string | null;
  lexware_kontakt_id: string | null;
  lexware_hash: string | null;
  altbestand: boolean;
};

type KontaktFelder = Pick<KundeLex, "nummer" | "name" | "typ" | "anrede" | "bauleister_13b" | "ansprechpartner" | "strasse" | "plz" | "ort" | "land" | "telefon" | "email">;

export function kontaktDaten(k: KontaktFelder) {
  return {
    roles: { customer: {} },
    ...(k.typ === "firma"
      ? {
          company: {
            name: k.name,
            // § 13b: Lexware nimmt Bauleistungs-Rechnungen nur für Firmenkontakte mit dieser Freigabe an
            allowTaxFreeInvoices: k.bauleister_13b,
            contactPersons: k.ansprechpartner?.trim() ? [{ lastName: k.ansprechpartner.trim().slice(0, 255), primary: true }] : [],
          },
        }
      : { person: { ...(k.anrede ? { salutation: k.anrede } : {}), lastName: k.name.slice(0, 255) } }),
    addresses: { billing: [{ street: k.strasse ?? "", zip: k.plz ?? "", city: k.ort ?? "", countryCode: landCode(k.land) }] },
    ...(k.email?.trim() ? { emailAddresses: { business: [k.email.trim()] } } : {}),
    ...(k.telefon?.trim() ? { phoneNumbers: { business: [k.telefon.trim()] } } : {}),
    note: `Kunde ${k.nummer} aus der Sawin-App`,
  };
}

/** Prüfsumme der Kontaktdaten (Änderung erkennen: lexware_hash am Kunden) */
export function kontaktHash(k: KontaktFelder): string {
  return createHash("sha256").update(JSON.stringify(kontaktDaten(k))).digest("hex");
}
