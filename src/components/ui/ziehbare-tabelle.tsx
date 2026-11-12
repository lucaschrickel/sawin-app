"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { spaltenbreitenSetzen } from "@/lib/ansicht-aktion";
import { cn } from "@/lib/cn";
import { breitenAus, geaendertGegenStandard, passendeBreite, type SpaltenDef } from "@/lib/spalten";
import { inhaltsBreiten, SpaltenGriff } from "./spalten-griff";

/**
 * Spaltenbreiten einer Tabelle: Zustand, Speichern je Benutzer (benutzer_einstellung.spaltenbreiten[tabelle]),
 * „passend“ per Doppelklick und Zurücksetzen. Zellen tragen data-spalte="<schluessel>" (für „passend“).
 */
export function useSpaltenbreiten(tabelle: string, spalten: SpaltenDef[], start?: Record<string, number>) {
  const ref = useRef<HTMLTableElement>(null);
  const [breiten, setBreiten] = useState(() => breitenAus(start, spalten));
  const breitenRef = useRef(breiten);
  const setzen = (schluessel: string, b: number) =>
    setBreiten((alt) => {
      const neu = { ...alt, [schluessel]: b };
      breitenRef.current = neu;
      return neu;
    });
  const merken = () => void spaltenbreitenSetzen(tabelle, breitenRef.current);
  const passend = (d: SpaltenDef) => {
    if (!ref.current) return;
    setzen(d.schluessel, passendeBreite(inhaltsBreiten(ref.current, d.schluessel), 4, d.min, d.max));
    setTimeout(merken, 0);
  };
  const zuruecksetzen = () => {
    const standard = breitenAus(undefined, spalten);
    breitenRef.current = standard;
    setBreiten(standard);
    void spaltenbreitenSetzen(tabelle, null);
  };
  /** Griff für den Spaltenkopf (th mit position: relative) */
  const griff = (d: SpaltenDef, amRand = false) => (
    <SpaltenGriff amRand={amRand} titel={d.titel} breite={breiten[d.schluessel]} min={d.min} max={d.max} onBreite={(b) => setzen(d.schluessel, b)} onEnde={merken} onPassend={() => passend(d)} />
  );
  return { ref, breiten, griff, geaendert: geaendertGegenStandard(breiten, spalten), zuruecksetzen };
}

/** Knopf „Spalten zurücksetzen“ (nur sichtbar, wenn eine Breite vom Standard abweicht) */
export function SpaltenZuruecksetzen({ sichtbar, onClick, className }: { sichtbar: boolean; onClick: () => void; className?: string }) {
  if (!sichtbar) return null;
  return (
    <Button size="sm" variant="ghost" onClick={onClick} className={className} data-spalten-zuruecksetzen>
      <RotateCcw className="size-4" /> Spalten zurücksetzen
    </Button>
  );
}

/** Ab dieser Fensterbreite sichtbar? (Spalten, die bei schmalen Fenstern entfallen) */
function useAbBreite(px: number | undefined) {
  const [ab, setAb] = useState(true);
  useEffect(() => {
    if (!px) return;
    const m = window.matchMedia(`(min-width: ${px + 1}px)`);
    const setzen = () => setAb(m.matches);
    setzen();
    m.addEventListener("change", setzen);
    return () => m.removeEventListener("change", setzen);
  }, [px]);
  return ab;
}

export type ZiehbareSpalte = (SpaltenDef & { rest?: false }) | { schluessel: string; titel: string; rest: true; min: number };
export type KopfSpalte = ZiehbareSpalte & {
  /** Inhalt des Spaltenkopfs (Standard: titel) */
  kopf?: ReactNode;
  /** Klassen der Kopfzelle (z. B. text-right, pl-4) */
  klasse?: string;
  /** Spalte entfällt unterhalb dieser Fensterbreite (die Zellen selbst blenden sich per CSS aus) */
  ausblendenBis?: number;
};

/**
 * Tabelle mit ziehbaren Spaltenbreiten (wie im Beleg-Editor): feste Breiten je Spalte, eine Spalte (rest) nimmt den
 * übrigen Platz mit Mindestbreite. Der Tabellenkörper kommt als children (auch vom Server).
 */
export function ZiehbareTabelle({
  tabelle,
  spalten,
  start,
  children,
  className,
  attribute,
  kopfKlasse = "border-b border-line text-left text-[11px] font-semibold tracking-[0.06em] text-muted-2 uppercase",
  zellenKlasse = "px-3 py-2.5",
}: {
  tabelle: string;
  spalten: KopfSpalte[];
  start?: Record<string, number>;
  children: ReactNode;
  className?: string;
  /** zusätzliche data-Attribute der Tabelle */
  attribute?: Record<string, string | boolean>;
  /** Klassen der Kopfzeile bzw. jeder Kopfzelle (Standard: Stil der Belegliste) */
  kopfKlasse?: string;
  zellenKlasse?: string;
}) {
  const ziehbar = spalten.filter((s): s is KopfSpalte & SpaltenDef => !s.rest);
  const { ref, breiten, griff, geaendert, zuruecksetzen } = useSpaltenbreiten(tabelle, ziehbar, start);
  const breit = useAbBreite(spalten.find((x) => x.ausblendenBis)?.ausblendenBis);
  const sichtbar = spalten.filter((x) => !x.ausblendenBis || breit);
  const rest = sichtbar.find((x) => x.rest);
  const minBreite = sichtbar.reduce((summe, x) => summe + (x.rest ? x.min : breiten[x.schluessel]), 0);
  return (
    <>
      <div className="overflow-x-auto">
        <table ref={ref} className={cn("w-full table-fixed border-collapse", className)} style={{ minWidth: minBreite }} {...attribute}>
          <colgroup>
            {sichtbar.map((x) => (
              <col key={x.schluessel} style={x.rest ? undefined : { width: breiten[x.schluessel] }} />
            ))}
          </colgroup>
          <thead>
            <tr className={kopfKlasse}>
              {sichtbar.map((x) => (
                <th key={x.schluessel} className={cn("relative", zellenKlasse, x.klasse)} data-spalte={x.schluessel}>
                  {x.kopf ?? x.titel}
                  {!x.rest && griff(x as SpaltenDef, x === sichtbar.at(-1))}
                </th>
              ))}
            </tr>
          </thead>
          {children}
        </table>
      </div>
      {rest && <SpaltenZuruecksetzen sichtbar={geaendert} onClick={zuruecksetzen} className="m-1.5" />}
    </>
  );
}
