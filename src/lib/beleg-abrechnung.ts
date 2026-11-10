import "server-only";
import { abschlagBerechnen, abschlagPositionen } from "@/lib/abschlag";
import { zahl } from "@/lib/beleg-summen";
import { neuerSchluessel, type EditorZustand, type PositionEingabe } from "@/lib/beleg-typen";
import { abzugZeilen, ladeAbrechnung } from "@/lib/belege";

const dez = (n: number) => String(n).replace(".", ",");

/**
 * Vor dem Speichern: Abschlags- und Abzugspositionen rechnet der Server neu (aus AB und angelegten Abschlägen).
 *   * Abschlagsrechnung: Positionen aus der Eingabe (Prozent bzw. Betrag), centgenau für die Schlussrechnung
 *   * Rechnung am Auftrag: Abzugspositionen aller angelegten Abschläge, nicht abwählbar
 */
export async function abrechnungAnwenden(z: EditorZustand): Promise<EditorZustand | { fehler: string }> {
  const k = z.kopf;
  if (k.art !== "abschlagsrechnung" && k.art !== "rechnung") return z;
  // Teilrechnung: nur die Positionen der Teil-AB, kein Abzug (das Kennzeichen „teil“ setzt die Datenbank)
  if (k.art === "rechnung" && k.teil) return { ...z, positionen: z.positionen.filter((p) => !p.abzug_beleg_id) };
  if (k.bezug.art !== "auftrag" || !k.bezug.id) return k.art === "abschlagsrechnung" ? { fehler: "Eine Abschlagsrechnung gehört zu einem Auftrag." } : z;
  const ab = await ladeAbrechnung(k.bezug.id);
  if (!ab) return { fehler: "Der Auftrag hat noch keine fertiggestellte Auftragsbestätigung." };
  if (k.art === "abschlagsrechnung") {
    const wert = zahl(k.abschlag_wert);
    if (!(wert > 0)) return { fehler: k.abschlag_art === "prozent" ? "Bitte den Abschlag in Prozent angeben." : "Bitte den Abschlag als Betrag angeben." };
    if (k.abschlag_art === "prozent" && wert > 100) return { fehler: "Der Abschlag liegt zwischen 0 und 100 %." };
    const eingabe = { art: k.abschlag_art, wert };
    const e = abschlagBerechnen(eingabe, ab.wert, ab.abzuege.map((a) => a.steuern));
    const positionen: PositionEingabe[] = abschlagPositionen(e, eingabe, ab.ab).map((p, i) => ({
      key: z.positionen[i]?.key ?? neuerSchluessel(),
      id: z.positionen[i]?.id ?? null,
      typ: "artikel",
      titel: p.titel,
      beschreibung: p.beschreibung,
      optional: false,
      menge: "1",
      einheit: p.einheit,
      einzelpreis: dez(p.einzelpreis),
      rabatt_prozent: "",
      steuersatz: String(p.steuersatz),
    }));
    return {
      kopf: { ...k, steuerart: ab.ab.steuerart, preise_brutto: ab.wert.brutto_eingabe, gesamtrabatt_prozent: "" },
      positionen,
    };
  }
  // Rechnung: eigene Positionen bleiben, Abzüge werden neu gesetzt (bestehende Zeilen-IDs bleiben erhalten)
  const alte = z.positionen.filter((p) => p.abzug_beleg_id);
  const abzug = abzugZeilen(ab).map((p) => {
    const vorher = alte.find((a) => a.abzug_beleg_id === p.abzug_beleg_id && a.steuersatz === p.steuersatz);
    return vorher ? { ...p, key: vorher.key, id: vorher.id } : p;
  });
  // Mit Abzügen gelten Steuerart und Eingabeart der AB (die Abzüge stehen netto bzw. brutto wie die Abschläge)
  return { kopf: { ...k, ...(abzug.length ? { steuerart: ab.ab.steuerart, preise_brutto: ab.wert.brutto_eingabe } : {}) }, positionen: [...z.positionen.filter((p) => !p.abzug_beleg_id), ...abzug] };
}
