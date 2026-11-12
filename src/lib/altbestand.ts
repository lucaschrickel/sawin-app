import "server-only";

/*
  Altbestand aus der Airtable-Übernahme (docs/airtable-uebernahme.md): Übernommene Kunden, Belege und OneDrive-Ordner
  tragen Lexware-IDs bzw. Ordner aus Sawins echtem Lexware und SharePoint. Die App spricht sie nur an, wenn der
  jeweilige Schalter auf dem Server „aktiv“ ist (Produktion ab Go-live). In Staging fehlen beide: Dort liegen die IDs
  nur in der Datenbank, nichts geht an Lexware und nichts wird in die echten Kundenordner geschrieben.
*/

/** LEXWARE_ALTBESTAND=aktiv: übernommene Lexware-IDs gehören zu diesem Lexware-Konto (Zahlungsabgleich, PDF, Kontakt) */
export const lexwareAltbestandAktiv = () => process.env.LEXWARE_ALTBESTAND?.trim() === "aktiv";

/** ONEDRIVE_ALTBESTAND=aktiv: in übernommene OneDrive-Ordner darf die App schreiben */
export const onedriveAltbestandAktiv = () => process.env.ONEDRIVE_ALTBESTAND?.trim() === "aktiv";
