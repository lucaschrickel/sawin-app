/*
  Abschläge und Schlussrechnung (Entscheidung 10.11.2026, CLAUDE.md „Abschläge“). Reines TypeScript ohne
  Abhängigkeiten, für Editor (Client) und Server. Unit-Tests: tests/unit/abschlag.test.ts.

  Die App legt jeden Abschlag als normale Lexware-Rechnung an (eine Position je Steuersatz). Die Schlussrechnung
  enthält die volle Leistung und darunter jeden Abschlag als Minusposition. Lexware rechnet die Umsatzsteuer je Satz
  auf die Summe des Belegs. Damit Netto, Steuer und Restbetrag der Schlussrechnung exakt stimmen, muss für jeden Satz
  gelten:  Steuer(Rest der Leistung) = Steuer(volle Leistung) − Σ Steuer(Abschläge).
  Wegen der Rundung auf Cent gilt das nicht immer von selbst. Die App wählt deshalb beim Anlegen eines Abschlags den
  Betrag je Satz so, dass die Gleichung nach diesem Abschlag gilt, und zwar so nah wie möglich am gewünschten Betrag
  (meist exakt, sonst um wenige Cent; bei 19 % höchstens etwa 3 Cent, bei 7 % etwa 8 Cent). Die Abweichung wird im Editor angezeigt.

  Prozent und Betrag beziehen sich auf den Auftragswert brutto (AB). Bei mehreren Steuersätzen wird der Abschlag im
  Verhältnis der Bruttobeträge je Satz aufgeteilt. Bei § 13b und steuerfrei ist alles netto (Satz 0).
*/

import { rund } from "./beleg-summen.ts";

export type SatzBetrag = { satz: number; netto: number; steuer: number; brutto: number };

export type AbschlagEingabe = { art: "prozent" | "betrag"; wert: number };

export type AuftragsWert = {
  /** Beträge je Steuersatz der AB (bei Lexware-Abschlägen die Werte laut Lexware) */
  steuern: SatzBetrag[];
  brutto: number;
  /** AB in Brutto-Eingabe: Abschläge und Schlussrechnung ebenfalls brutto */
  brutto_eingabe: boolean;
};

export type AbschlagZeile = SatzBetrag & { /** Einzelpreis in der Eingabeart (netto bzw. brutto) */ betrag: number };

export type AbschlagErgebnis = {
  /** gewünschter Bruttobetrag */
  ziel: number;
  zeilen: AbschlagZeile[];
  netto: number;
  steuer: number;
  brutto: number;
  /** brutto − ziel (Anpassung, damit die Schlussrechnung centgenau aufgeht) */
  abweichung: number;
  bisher_brutto: number;
  /** Auftragswert − bisherige Abschläge − dieser Abschlag */
  rest: number;
  /** Summe der Abschläge übersteigt den Auftragswert */
  ueberschritten: boolean;
};

/** Steuer zu einem Betrag in der Eingabeart (netto: Betrag × Satz; brutto: Betrag × Satz ÷ (100 + Satz)) */
export function steuerAus(betrag: number, satz: number, brutto: boolean): number {
  return rund(brutto ? (betrag * satz) / (100 + satz) : (betrag * satz) / 100);
}

const summe = (zs: SatzBetrag[], f: (z: SatzBetrag) => number) => rund(zs.reduce((s, z) => s + f(z), 0));
const jeSatz = (zs: SatzBetrag[], satz: number) => zs.find((z) => z.satz === satz);

/** Zielbetrag brutto aus der Eingabe (Prozent vom Auftragswert brutto oder Betrag) */
export function abschlagZiel(e: AbschlagEingabe, auftragBrutto: number): number {
  return e.art === "prozent" ? rund((auftragBrutto * e.wert) / 100) : rund(e.wert);
}

/** Bruttobetrag auf die Steuersätze verteilen (im Verhältnis der Bruttobeträge des Auftrags, Rest auf den letzten) */
function verteilen(ziel: number, auftrag: SatzBetrag[]): { satz: number; ziel: number }[] {
  const saetze = auftrag.filter((z) => z.brutto > 0);
  const gesamt = summe(saetze, (z) => z.brutto);
  if (!saetze.length || gesamt <= 0) return [];
  let vergeben = 0;
  return saetze.map((z, i) => {
    const teil = i === saetze.length - 1 ? rund(ziel - vergeben) : rund((ziel * z.brutto) / gesamt);
    vergeben = rund(vergeben + teil);
    return { satz: z.satz, ziel: teil };
  });
}

/**
 * Abschlag berechnen: Beträge je Satz so, dass die Schlussrechnung centgenau aufgeht, und möglichst nah am Ziel.
 * `bisher` sind die Beträge der schon angelegten Abschläge (laut Lexware), je Abschlag die Zeilen je Satz.
 */
export function abschlagBerechnen(eingabe: AbschlagEingabe, auftrag: AuftragsWert, bisher: SatzBetrag[][]): AbschlagErgebnis {
  const ziel = abschlagZiel(eingabe, auftrag.brutto);
  const be = auftrag.brutto_eingabe;
  const inEingabe = (z: SatzBetrag) => (be ? z.brutto : z.netto);
  const zeilen: AbschlagZeile[] = verteilen(ziel, auftrag.steuern).map(({ satz, ziel: g }) => {
    const a = jeSatz(auftrag.steuern, satz)!;
    const vorher = bisher.map((b) => jeSatz(b, satz)).filter((x): x is SatzBetrag => !!x);
    const X = inEingabe(a);
    const T = a.steuer;
    const xBisher = summe(vorher, inEingabe);
    const tBisher = summe(vorher, (z) => z.steuer);
    const x0 = be || satz === 0 ? g : rund(g / (1 + satz / 100));
    const zeile = (x: number): AbschlagZeile => {
      const steuer = steuerAus(x, satz, be);
      return be ? { satz, betrag: x, netto: rund(x - steuer), steuer, brutto: x } : { satz, betrag: x, netto: x, steuer, brutto: rund(x + steuer) };
    };
    // Rest nach diesem Abschlag muss Lexware-konform sein: Steuer(Rest) = T − Σt
    const passt = (x: number) => {
      const rest = rund(X - xBisher - x);
      if (rest <= 0) return true;
      return steuerAus(rest, satz, be) === rund(T - tBisher - steuerAus(x, satz, be));
    };
    let beste: AbschlagZeile | null = null;
    for (let i = 0; i <= 24; i++) {
      const k = i % 2 ? (i + 1) / 2 : -i / 2;
      const x = rund(x0 + k / 100);
      if (x <= 0 || !passt(x)) continue;
      const z = zeile(x);
      if (!beste || Math.abs(z.brutto - g) < Math.abs(beste.brutto - g) - 1e-9) beste = z;
    }
    return beste ?? zeile(x0);
  });
  const netto = summe(zeilen, (z) => z.netto);
  const steuer = summe(zeilen, (z) => z.steuer);
  const brutto = rund(netto + steuer);
  const bisherBrutto = summe(bisher.flat(), (z) => z.brutto);
  const rest = rund(auftrag.brutto - bisherBrutto - brutto);
  return { ziel, zeilen, netto, steuer, brutto, abweichung: rund(brutto - ziel), bisher_brutto: bisherBrutto, rest, ueberschritten: rest < 0 };
}

/** Bereits berechneter Betrag, den die Schlussrechnung abzieht: Abschlag (mit Nummer „n.“) oder Teilrechnung */
export type AbschlagFuerAbzug = { id: string; nr: number | null; nummer: string | null; datum: string; steuern: SatzBetrag[]; bezeichnung?: string };

const datumDe = (iso: string) => {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
};
const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

/**
 * Abzugspositionen der Schlussrechnung: je Abschlag bzw. Teilrechnung und Steuersatz eine Minusposition (Nummer,
 * Datum, Netto, Steuer). Reihenfolge: Abschläge nach Nummer, dann Teilrechnungen nach Datum.
 */
export function abzugPositionen(abschlaege: AbschlagFuerAbzug[], bruttoEingabe: boolean) {
  return [...abschlaege]
    .sort((a, b) => (a.nr ?? 1e6) - (b.nr ?? 1e6) || a.datum.localeCompare(b.datum))
    .flatMap((a) =>
      a.steuern
        .filter((z) => z.netto !== 0 || z.brutto !== 0)
        .map((z) => ({
          abzug_beleg_id: a.id,
          titel: `abzgl. ${a.nr ? `${a.nr}. ` : ""}${a.bezeichnung ?? "Abschlagsrechnung"} ${a.nummer ?? ""} vom ${datumDe(a.datum)}`.replace(/\s+/g, " "),
          beschreibung:
            z.satz > 0
              ? `Netto ${euro(z.netto)} zzgl. ${String(z.satz).replace(".", ",")} % USt ${euro(z.steuer)} = ${euro(z.brutto)}`
              : `Netto ${euro(z.netto)} ohne Umsatzsteuer`,
          menge: 1,
          einheit: "pauschal",
          einzelpreis: -(bruttoEingabe ? z.brutto : z.netto),
          steuersatz: z.satz,
        })),
    );
}

/**
 * Prüfung der Schlussrechnung: erwartete Restbeträge je Satz (volle Leistung − Abschläge) gegen das, was Lexware
 * rechnen wird (Summen des Belegs mit Abzugspositionen). Leere Liste = centgenau.
 */
export function schlussAbweichungen(voll: SatzBetrag[], abschlaege: SatzBetrag[][], mitAbzug: SatzBetrag[]): { satz: number; erwartet: SatzBetrag; lexware: SatzBetrag }[] {
  const saetze = [...new Set([...voll, ...mitAbzug].map((z) => z.satz))];
  return saetze.flatMap((satz) => {
    const v = jeSatz(voll, satz) ?? { satz, netto: 0, steuer: 0, brutto: 0 };
    const a = abschlaege.map((b) => jeSatz(b, satz)).filter((x): x is SatzBetrag => !!x);
    const erwartet = {
      satz,
      netto: rund(v.netto - summe(a, (z) => z.netto)),
      steuer: rund(v.steuer - summe(a, (z) => z.steuer)),
      brutto: rund(v.brutto - summe(a, (z) => z.brutto)),
    };
    const lexware = jeSatz(mitAbzug, satz) ?? { satz, netto: 0, steuer: 0, brutto: 0 };
    return erwartet.netto === lexware.netto && erwartet.steuer === lexware.steuer && erwartet.brutto === lexware.brutto ? [] : [{ satz, erwartet, lexware }];
  });
}

/** Positionen der Abschlagsrechnung (eine je Steuersatz) mit Bezug auf die AB */
export function abschlagPositionen(e: AbschlagErgebnis, eingabe: AbschlagEingabe, ab: { nummer: string; brutto: number }) {
  const mehrere = e.zeilen.length > 1;
  const anteil = eingabe.art === "prozent" ? `${String(rund(eingabe.wert * 10000) / 10000).replace(".", ",")} % ` : "";
  return e.zeilen.map((z) => ({
    titel: `Abschlag ${anteil}auf Auftrag ${ab.nummer}${mehrere ? ` (${String(z.satz).replace(".", ",")} % USt)` : ""}`,
    beschreibung: `gemäß Auftragsbestätigung ${ab.nummer}, Auftragswert ${euro(ab.brutto)} brutto`,
    menge: 1,
    einheit: "pauschal",
    einzelpreis: z.betrag,
    steuersatz: z.satz,
  }));
}
