/*
  Summen von Belegen. Reines TypeScript ohne Abhängigkeiten (Unit-Tests: tests/unit/beleg-summen.test.ts).

  Rechenweg (wie auf dem gedruckten Beleg nachvollziehbar):
    1. Zeilenbetrag = Menge × Einzelpreis × (1 − Rabatt), auf Cent gerundet. In der Netto-Eingabe ist er netto,
       in der Brutto-Eingabe brutto.
    2. Je Steuersatz die Zeilenbeträge summieren, Gesamtrabatt je Satz abziehen (auf Cent gerundet).
    3. Netto-Eingabe: Steuer je Satz = Netto des Satzes × Satz, auf Cent gerundet.
       Brutto-Eingabe: Steuer je Satz = Brutto des Satzes × Satz ÷ (100 + Satz), auf Cent gerundet; Netto = Brutto − Steuer.
    4. Optionale Positionen und Freitext zählen nicht. Bei § 13b und steuerfrei ist der Satz 0 und es gilt immer netto.
  Gerundet wird kaufmännisch (halbe Cent vom Nullpunkt weg), auch bei negativen Beträgen.
*/

export type Steuerart = "standard" | "bauleistung_13b" | "steuerfrei";

export type SummenPosition = {
  typ: "artikel" | "text";
  optional?: boolean;
  menge: number;
  einzelpreis: number;
  rabatt_prozent: number;
  steuersatz: number;
};

export type SummenKopf = { steuerart: Steuerart; preise_brutto: boolean; gesamtrabatt_prozent: number };

export type SteuerZeile = { satz: number; netto: number; steuer: number; brutto: number };

export type Summen = {
  /** Eingabe in Brutto (nur bei Steuerart Standard) */
  brutto_eingabe: boolean;
  /** ohne Umsatzsteuer (§ 13b oder steuerfrei) */
  ohne_steuer: boolean;
  /** Zeilenbetrag je Position (in der Eingabeart); null bei Freitext */
  zeilen: (number | null)[];
  /** Summe der Zeilen vor Gesamtrabatt (in der Eingabeart) */
  zwischensumme: number;
  /** Gesamtrabatt als Betrag (in der Eingabeart) */
  rabatt: number;
  netto: number;
  steuern: SteuerZeile[];
  steuer: number;
  brutto: number;
};

/** Kaufmännisch auf Cent runden (halbe Cent vom Nullpunkt weg), robust gegen Gleitkomma-Reste wie 1,005 */
export function rund(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const v = Math.round(Number((Math.abs(n) * 100).toPrecision(12))) / 100;
  return n < 0 ? -v : v;
}

/** Zahl aus Eingabe („1.234,5“, „1234.5“, leer) */
export function zahl(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

const ohneSteuer = (art: Steuerart) => art === "bauleistung_13b" || art === "steuerfrei";

/** Zeilenbetrag einer Position (in der Eingabeart), auf Cent gerundet */
export function zeilenBetrag(p: Pick<SummenPosition, "menge" | "einzelpreis" | "rabatt_prozent">): number {
  return rund(zahl(p.menge) * zahl(p.einzelpreis) * (1 - Math.min(Math.max(zahl(p.rabatt_prozent), 0), 100) / 100));
}

export function belegSummen(positionen: SummenPosition[], kopf: SummenKopf): Summen {
  const frei = ohneSteuer(kopf.steuerart);
  const bruttoEingabe = kopf.preise_brutto && !frei;
  const gr = Math.min(Math.max(zahl(kopf.gesamtrabatt_prozent), 0), 100) / 100;

  const zeilen = positionen.map((p) => (p.typ === "text" ? null : zeilenBetrag(p)));
  const jeSatz = new Map<number, number>();
  let zwischensumme = 0;
  positionen.forEach((p, i) => {
    if (p.typ === "text" || p.optional) return;
    const satz = frei ? 0 : zahl(p.steuersatz);
    const b = zeilen[i] ?? 0;
    jeSatz.set(satz, rund((jeSatz.get(satz) ?? 0) + b));
    zwischensumme = rund(zwischensumme + b);
  });

  const steuern: SteuerZeile[] = [...jeSatz.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([satz, summe]) => {
      const nachRabatt = rund(summe * (1 - gr));
      if (bruttoEingabe) {
        const steuer = rund((nachRabatt * satz) / (100 + satz));
        return { satz, netto: rund(nachRabatt - steuer), steuer, brutto: nachRabatt };
      }
      const steuer = rund((nachRabatt * satz) / 100);
      return { satz, netto: nachRabatt, steuer, brutto: rund(nachRabatt + steuer) };
    });

  const netto = rund(steuern.reduce((s, z) => s + z.netto, 0));
  const steuer = rund(steuern.reduce((s, z) => s + z.steuer, 0));
  const brutto = rund(netto + steuer);
  const nachRabattEingabe = bruttoEingabe ? brutto : netto;
  return {
    brutto_eingabe: bruttoEingabe,
    ohne_steuer: frei,
    zeilen,
    zwischensumme,
    rabatt: rund(zwischensumme - nachRabattEingabe),
    netto,
    steuern: steuern.filter((z) => z.netto !== 0 || z.steuer !== 0 || steuern.length === 1),
    steuer,
    brutto,
  };
}
