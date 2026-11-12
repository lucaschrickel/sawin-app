"use client";

import { verlaufVergessen } from "@/components/app/verlauf";
import { Check, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { allesGeliefert, bestellungLoeschen, zeileGeliefert, type Ergebnis } from "./aktionen";

function Meldung({ e }: { e: Ergebnis }) {
  if (!e.fehler && !e.hinweis) return null;
  return (
    <p role={e.fehler ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-sm", e.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}>
      {e.fehler ?? e.hinweis}
    </p>
  );
}

export type BestellAuswahl = {
  lieferanten: { id: string; name: string }[];
  auftraege: { id: string; nummer: string; titel: string; kunde: string; nochNichtBestellt: string | null }[];
};
/** Häkchen „geliefert“ je Zeile */
export function GeliefertSchalter({ id, geliefert, text }: { id: string; geliefert: boolean; text: string }) {
  const [wert, setWert] = useState(geliefert);
  const [laeuft, starten] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={wert}
        disabled={laeuft}
        aria-label={`${text} geliefert`}
        data-geliefert={id}
        onChange={(e) => {
          const neu = e.target.checked;
          setWert(neu);
          starten(async () => {
            const r = await zeileGeliefert(id, neu);
            if (r.fehler) setWert(!neu);
          });
        }}
        className="size-4 [accent-color:var(--ink)]"
      />
      {wert ? "geliefert" : "offen"}
    </label>
  );
}

export function AllesGeliefert({ id }: { id: string }) {
  const [laeuft, starten] = useTransition();
  const [e, setE] = useState<Ergebnis>({});
  return (
    <>
      <Button disabled={laeuft} onClick={() => starten(async () => setE(await allesGeliefert(id)))}>
        <Check className="size-[15px]" />
        Alles geliefert
      </Button>
      {e.fehler && <div className="basis-full"><Meldung e={e} /></div>}
    </>
  );
}

export function BestellungLoeschen({ id, nummer }: { id: string; nummer: string }) {
  const [e, setE] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Bestaetigen
        titel="Bestellung löschen?"
        text={<>Bestellung <b className="font-mono text-ink">{nummer}</b> wird samt Positionen als gelöscht markiert. Schon (teilweise) gelieferte Bestellungen bleiben erhalten.</>}
        knopf="Löschen"
        gefahr
        ausfuehren={() => starten(async () => (verlaufVergessen(), setE((await bestellungLoeschen(id)) ?? {})))}
      >
        <Button variant="danger" disabled={laeuft}>
          <Trash2 className="size-[15px]" />
          Löschen
        </Button>
      </Bestaetigen>
      {e.fehler && <div className="basis-full"><Meldung e={e} /></div>}
    </>
  );
}
