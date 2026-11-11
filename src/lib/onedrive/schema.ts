/*
  Ordnerschema der OneDrive-Ablage (CLAUDE.md „OneDrive“, wie das bisherige Make-Szenario). Ohne Abhängigkeiten,
  im Browser, auf dem Server und in den Unit-Tests (tests/unit/onedrive.test.ts) nutzbar.
*/

export const UNTERORDNER = ["01 Anfrage", "02 Angebot", "03 Aufmaß - Freigabe", "04 Auftrag", "05 ABs", "06 Abnahme - Rechnung - Sonstiges"] as const;
export type Unterordner = (typeof UNTERORDNER)[number];
export const SERVICE_UNTERORDNER = "07 Service";
export const SERVICE_ORDNER = "Service";
export const TESTORDNER = "_App-Test";

/** Unterordner für das PDF einer Belegart */
export function unterordnerFuer(art: string): Unterordner {
  if (art === "angebot") return "02 Angebot";
  if (art === "auftragsbestaetigung" || art === "teil_ab") return "05 ABs";
  if (art === "lieferschein") return "04 Auftrag";
  return "06 Abnahme - Rechnung - Sonstiges";
}

/** Formulare und Protokolle (sobald gebaut): Aufmaß in 03, Montageprotokoll in 04, Übergabe in 06 */
export const FORMULAR_UNTERORDNER: Record<string, Unterordner> = {
  aufmass: "03 Aufmaß - Freigabe",
  montageprotokoll: "04 Auftrag",
  servicebericht: "06 Abnahme - Rechnung - Sonstiges",
  uebergabeprotokoll: "06 Abnahme - Rechnung - Sonstiges",
};

/**
 * Name für SharePoint/OneDrive: ohne die gesperrten Zeichen " * : < > ? / \ | und Steuerzeichen, ohne führende oder
 * abschließende Punkte und Leerzeichen, höchstens 120 Zeichen (der ganze Pfad darf 400 nicht überschreiten).
 */
export function sharepointName(text: string, max = 120): string {
  const t = text
    .replace(/[\u0000-\u001f"*:<>?/\\|#%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s~]+|[.\s]+$/g, "");
  return t.slice(0, max).replace(/[.\s]+$/, "") || "Ohne Namen";
}

/** Ordner eines Vorgangs: <Nummer>_<Kunde> (erst Angebotsnummer, mit der AB die AB-Nummer) */
export function ordnerName(nummer: string, kunde: string | null): string {
  return sharepointName([nummer.trim(), kunde?.trim()].filter(Boolean).join("_"));
}

/** Basisordner-Pfad aus der Eingabe: Schrägstriche vereinheitlicht, ohne leere Teile; null bei ungültigen Teilen */
export function basisPfad(eingabe: string): string | null {
  const teile = eingabe
    .replace(/\\/g, "/")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!teile.length || teile.some((x) => x === "." || x === ".." || sharepointName(x) !== x)) return null;
  return teile.join("/");
}

/** Pfad für Graph-Adressen (/root:/<pfad>): je Teil kodiert, Schrägstriche bleiben */
export const pfadKodieren = (pfad: string) => pfad.split("/").map(encodeURIComponent).join("/");

/** Erlaubte Uploads (Scans, Fotos, Dokumente) und Prüfung am Dateianfang */
export const UPLOAD_GRENZE = 50 * 1024 * 1024;
export function dateiTypErkennen(kopf: Uint8Array): string | null {
  const b = (i: number) => kopf[i];
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "application/pdf";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  // HEIC/HEIF (iPhone): „ftyp“ ab Byte 4 mit heic/heix/mif1
  if (b(4) === 0x66 && b(5) === 0x74 && b(6) === 0x79 && b(7) === 0x70) {
    const marke = String.fromCharCode(b(8), b(9), b(10), b(11));
    if (["heic", "heix", "mif1", "msf1", "hevc"].includes(marke)) return "image/heic";
  }
  // Office-Dokumente (docx, xlsx) sind ZIP
  if (b(0) === 0x50 && b(1) === 0x4b && b(2) === 0x03 && b(3) === 0x04) return "application/zip";
  return null;
}
