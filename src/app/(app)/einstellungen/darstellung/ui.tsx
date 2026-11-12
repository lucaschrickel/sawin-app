"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState, useTransition } from "react";
import { darstellungAnwenden } from "@/components/app/darstellung";
import { cn } from "@/lib/cn";
import { FARBSCHEMA_TEXT, type Darstellung, type Farbschema } from "@/lib/darstellung";
import { darstellungSpeichern } from "./aktionen";

const SYMBOL: Record<Farbschema, typeof Sun> = { hell: Sun, dunkel: Moon, system: Monitor };
const BESCHREIBUNG: Record<Farbschema, string> = {
  hell: "Helle Flächen, dunkle Schrift",
  dunkel: "Dunkle Flächen, Seitenleiste immer dunkel",
  system: "Folgt der Einstellung von Windows, macOS bzw. des Tablets",
};

/** Auswahl wirkt sofort und wird je Benutzer gespeichert (kein Speichern-Knopf nötig) */
export function DarstellungFormular({ start }: { start: Darstellung }) {
  const [d, setD] = useState(start);
  const [fehler, setFehler] = useState<string>();
  // Server-Aktionen laufen nacheinander; die letzte Auswahl gewinnt (Knöpfe bleiben bedienbar)
  const [, starten] = useTransition();

  const waehlen = (neu: Darstellung) => {
    const vorher = d;
    setD(neu);
    darstellungAnwenden(neu);
    starten(async () => {
      const r = await darstellungSpeichern(neu);
      if (r.fehler) {
        setFehler(r.fehler);
        setD(vorher);
        darstellungAnwenden(vorher);
      } else setFehler(undefined);
    });
  };
  const karte = (aktiv: boolean) =>
    cn("flex flex-1 cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-left transition", aktiv ? "border-ink bg-surface-muted" : "border-line hover:border-line-strong");

  return (
    <div className="flex flex-col gap-6" data-darstellung={d.farbschema}>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Farbschema</legend>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Farbschema">
          {(["hell", "dunkel", "system"] as const).map((f) => {
            const Symbol = SYMBOL[f];
            return (
              <button key={f} type="button" role="radio" aria-checked={d.farbschema === f} className={karte(d.farbschema === f)} onClick={() => waehlen({ ...d, farbschema: f })} data-farbschema={f}>
                <Symbol className="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
                <span>
                  <span className="block font-medium">{FARBSCHEMA_TEXT[f]}</span>
                  <span className="block text-xs text-muted">{BESCHREIBUNG[f]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Seitenleiste</legend>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Seitenleiste">
          {([false, true] as const).map((hell) => (
            <button key={String(hell)} type="button" role="radio" aria-checked={d.seitenleisteHell === hell} className={cn(karte(d.seitenleisteHell === hell), "max-w-[260px]")} onClick={() => waehlen({ ...d, seitenleisteHell: hell })} data-seitenleiste-wahl={hell ? "hell" : "dunkel"}>
              <span>
                <span className="block font-medium">{hell ? "Hell" : "Dunkel"}</span>
                <span className="block text-xs text-muted">{hell ? "Nur im hellen Farbschema; im Dunkelmodus bleibt sie dunkel" : "Anthrazit wie im Prototyp"}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      {fehler && <p role="alert" className="text-sm text-tone-red-fg">{fehler}</p>}
      <p className="text-xs text-muted-2">Gilt nur für Sie und wird auf jedem Gerät übernommen. Belege, Formulare und Wochenpläne bleiben immer hell (Papier).</p>
    </div>
  );
}
