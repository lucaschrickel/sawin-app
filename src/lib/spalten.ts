/*
  Ziehbare Spaltenbreiten (Positionstabelle im Beleg-Editor): reine Rechenlogik ohne Oberfläche
  (Unit-Tests: tests/unit/spalten.test.ts). Bedienung wie in Excel: am rechten Spaltenrand ziehen, Doppelklick passt
  die Breite an den Inhalt an; per Tastatur Pfeil links/rechts (mit Umschalt größere Schritte), Pos1/Ende für Minimum
  und Maximum, Enter für „passend“.
*/

export type SpaltenDef = { schluessel: string; titel: string; standard: number; min: number; max: number };

export const begrenzen = (wert: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, wert)));

/** Neue Breite nach einem Tastendruck am Griff; null = Taste gehört nicht dazu (bzw. Enter: passend, eigener Weg) */
export function tastenBreite(taste: string, umschalt: boolean, breite: number, min: number, max: number): number | null {
  const schritt = umschalt ? 32 : 8;
  switch (taste) {
    case "ArrowLeft":
      return begrenzen(breite - schritt, min, max);
    case "ArrowRight":
      return begrenzen(breite + schritt, min, max);
    case "Home":
      return min;
    case "End":
      return max;
    default:
      return null;
  }
}

/** Passende Breite: breitester Inhalt plus Innenabstand, innerhalb der Grenzen */
export function passendeBreite(inhaltsBreiten: number[], polster: number, min: number, max: number): number {
  const breitester = inhaltsBreiten.reduce((m, b) => Math.max(m, b), 0);
  return begrenzen(Math.ceil(breitester + polster), min, max);
}

/** Gespeicherte Breiten mit den Standardwerten zusammenführen (unbekannte oder ungültige Werte fallen weg) */
export function breitenAus(gespeichert: Record<string, number> | undefined, spalten: SpaltenDef[]): Record<string, number> {
  return Object.fromEntries(spalten.map((s) => [s.schluessel, typeof gespeichert?.[s.schluessel] === "number" ? begrenzen(gespeichert[s.schluessel], s.min, s.max) : s.standard]));
}

/** Weichen die Breiten vom Standard ab? (Knopf „Spalten zurücksetzen“) */
export const geaendertGegenStandard = (breiten: Record<string, number>, spalten: SpaltenDef[]) => spalten.some((s) => breiten[s.schluessel] !== s.standard);
