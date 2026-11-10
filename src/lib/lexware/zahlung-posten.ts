/*
  Zahlungsposten aus Lexware (/v1/payments/{id} → paymentItems). Reines TypeScript ohne Abhängigkeiten.
  Unit-Tests: tests/unit/zahlung-posten.test.ts.
*/
import { rund } from "../beleg-summen.ts";

export type LexPosten = { paymentItemType: string; postingDate: string; amount: number };
export type Posten = { schluessel: string; art: string; datum: string; betrag: number };

/** Geldeingänge werden Zahlungen; Gutschriften, Abschlagsverrechnung, Skonto und Ausbuchungen ändern nur den offenen Betrag */
export const istGeldeingang = (art: string) => !/creditnote|downpayment|irrecoverable|discount/i.test(art);

/** Lexware vergibt für Zahlungsposten keine ID: Schlüssel aus Beleg, Art, Datum, Betrag und laufender Nummer */
export function postenSchluessel(lexId: string, posten: LexPosten[]): Posten[] {
  const gesehen = new Map<string, number>();
  return posten.map((p) => {
    const datum = p.postingDate.slice(0, 10);
    const betrag = rund(p.amount);
    const basis = `${lexId}:${p.paymentItemType}:${datum}:${betrag.toFixed(2)}`;
    const n = (gesehen.get(basis) ?? 0) + 1;
    gesehen.set(basis, n);
    return { schluessel: `${basis}:${n}`, art: p.paymentItemType, datum, betrag };
  });
}

/** Geldeingänge eines Belegs mit Schlüssel (für lexware_zahlungen) */
export const geldeingaenge = (lexId: string, posten: LexPosten[]) => postenSchluessel(lexId, posten).filter((p) => istGeldeingang(p.art) && p.betrag > 0);
