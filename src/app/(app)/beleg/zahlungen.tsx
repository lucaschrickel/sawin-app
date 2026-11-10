"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormularDialog } from "@/components/ui/formular-dialog";
import { eur } from "@/lib/format";
import type { Zahlung } from "@/lib/belege";
import { alsBezahltMarkieren, zahlungEntfernen, zahlungsbestaetigungErstellen, zahlungsstandAbrufen } from "./aktionen";

const ART: Record<Zahlung["zahlungsart"], string> = { ueberweisung: "Überweisung", bar: "Bar", karte: "Karte", sonstiges: "Sonstiges" };
const datumDe = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Zahlungen einer Rechnung bzw. Abschlagsrechnung (CLAUDE.md „Zahlungen“): Liste mit Quelle, „in Lexware noch buchen“
 * für App-Buchungen, Zahlungsbestätigung je Zahlung, „Als bezahlt markieren“ und „Zahlungsstand abrufen“.
 */
export function ZahlungenKarte({
  belegId,
  offen,
  heute,
  zahlungen,
  markierbar,
}: {
  belegId: string;
  offen: number;
  heute: string;
  zahlungen: Zahlung[];
  /** Beleg ist offen (Als bezahlt markieren möglich) */
  markierbar: boolean;
}) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);
  const ausfuehren = (f: () => Promise<{ fehler?: string; hinweis?: string; id?: string }>, danach?: (id?: string) => void) =>
    starte(async () => {
      setMeldung(null);
      const r = await f();
      if (r.fehler) return setMeldung(r.fehler);
      if (r.hinweis) setMeldung(r.hinweis);
      if (danach) return danach(r.id);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3" data-zahlungen>
      {zahlungen.length ? (
        <ul className="flex flex-col text-sm">
          {zahlungen.map((z) => (
            <li key={z.id} className="flex flex-col gap-1 border-t border-line-soft py-2 first:border-t-0 first:pt-0" data-zahlung={z.quelle}>
              <div className="flex items-baseline justify-between gap-2">
                <span>
                  {datumDe(z.datum)} · {ART[z.zahlungsart]}
                  <span className="ml-1 text-xs text-muted-2">{z.quelle === "app" ? "in der App gebucht" : "aus Lexware"}</span>
                </span>
                <span className="font-semibold tabular">{eur(z.betrag)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {z.quelle === "app" && z.lex_abgleich === "offen" && (
                  <Badge tone="amber" data-lex-buchen>
                    in Lexware noch buchen
                  </Badge>
                )}
                {z.zahlungsbestaetigung ? (
                  <Link href={`/beleg/${z.zahlungsbestaetigung.id}`} className="text-xs text-accent-text hover:underline">
                    Zahlungsbestätigung {z.zahlungsbestaetigung.nummer}
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={laeuft}
                    className="text-xs text-accent-text hover:underline"
                    data-aktion="zahlungsbestaetigung"
                    onClick={() => ausfuehren(() => zahlungsbestaetigungErstellen(z.id), (id) => id && router.push(`/beleg/${id}`))}
                  >
                    Zahlungsbestätigung erstellen
                  </button>
                )}
                {z.quelle === "app" && z.lex_abgleich === "offen" && !z.zahlungsbestaetigung && (
                  <button
                    type="button"
                    disabled={laeuft}
                    aria-label="Zahlung entfernen"
                    title="Zahlung entfernen (falsch erfasst)"
                    className="ml-auto inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-tone-red-fg"
                    onClick={() => ausfuehren(() => zahlungEntfernen(z.id))}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Noch keine Zahlung eingegangen.</p>
      )}
      <div className="flex flex-col gap-2">
        {markierbar && offen > 0 && <BezahltDialog belegId={belegId} offen={offen} heute={heute} />}
        <Button size="sm" variant="ghost" disabled={laeuft} data-aktion="zahlungsstand" onClick={() => ausfuehren(() => zahlungsstandAbrufen(belegId))}>
          <RefreshCw className="size-3.5" /> Zahlungsstand abrufen
        </Button>
      </div>
      {meldung && <p className="text-xs text-tone-red-fg" role="alert">{meldung}</p>}
    </div>
  );
}

function BezahltDialog({ belegId, offen, heute }: { belegId: string; offen: number; heute: string }) {
  const router = useRouter();
  return (
    <FormularDialog
      titel="Als bezahlt markieren"
      beschreibung="Zahlung in der App erfassen, z. B. bar oder per Karte. Lexware nimmt Zahlungen über die Schnittstelle nicht an: Bitte die Zahlung auch in Lexware buchen; die App gleicht sie danach ab."
      ausloeser={
        <Button size="sm" variant="primary" data-aktion="bezahlt">
          Als bezahlt markieren
        </Button>
      }
    >
      {(s) => <BezahltFormular belegId={belegId} offen={offen} heute={heute} steuerung={s} weiter={(id) => (id ? router.push(`/beleg/${id}`) : router.refresh())} />}
    </FormularDialog>
  );
}

function BezahltFormular({
  belegId,
  offen,
  heute,
  steuerung,
  weiter,
}: {
  belegId: string;
  offen: number;
  heute: string;
  steuerung: { aenderung: () => void; fertig: () => void; abbrechen: () => void };
  weiter: (zahlungsbestaetigung?: string) => void;
}) {
  const [datum, setDatum] = useState(heute);
  const [betrag, setBetrag] = useState(offen.toFixed(2).replace(".", ","));
  const [zahlungsart, setZahlungsart] = useState("bar");
  const [bestaetigung, setBestaetigung] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const aendern = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    steuerung.aenderung();
  };
  return (
    <form
      className="flex flex-col gap-4"
      data-bezahlt-formular
      onSubmit={(e) => {
        e.preventDefault();
        starte(async () => {
          setFehler(null);
          const r = await alsBezahltMarkieren(belegId, { datum, betrag, zahlungsart, bestaetigung });
          if (r.fehler) return setFehler(r.fehler);
          steuerung.fertig();
          weiter(r.id);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Zahlungseingang am">{(p) => <Input {...p} type="date" name="datum" max={heute} value={datum} onChange={(e) => aendern(setDatum)(e.target.value)} />}</Field>
        <Field label="Betrag" hint={`offen: ${eur(offen)}; weniger = Teilzahlung`}>
          {(p) => <Input {...p} name="betrag" inputMode="decimal" className="text-right" value={betrag} onChange={(e) => aendern(setBetrag)(e.target.value)} />}
        </Field>
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1.5 text-[13px] font-medium text-ink-3">Zahlungsart</legend>
        {(Object.keys(ART) as Zahlung["zahlungsart"][]).map((a) => (
          <label key={a} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm has-[:checked]:border-ink has-[:checked]:font-semibold">
            <input type="radio" name="zahlungsart" value={a} checked={zahlungsart === a} onChange={() => aendern(setZahlungsart)(a)} className="sr-only" />
            {ART[a]}
          </label>
        ))}
      </fieldset>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="bestaetigung" checked={bestaetigung} onChange={(e) => aendern(setBestaetigung)(e.target.checked)} />
        Zahlungsbestätigung erstellen
      </label>
      <p className="text-xs text-muted-2">„Danach per E-Mail senden“ folgt mit dem E-Mail-Versand.</p>
      {fehler && (
        <p role="alert" className="text-sm text-tone-red-fg">
          {fehler}
        </p>
      )}
      <div className="flex justify-end gap-2.5">
        <Button type="button" onClick={steuerung.abbrechen}>
          Abbrechen
        </Button>
        <Button type="submit" variant="primary" disabled={laeuft}>
          Zahlung speichern
        </Button>
      </div>
    </form>
  );
}
