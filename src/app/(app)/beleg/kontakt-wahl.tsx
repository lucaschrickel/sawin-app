"use client";

import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GRUND_TEXT, type Kandidat } from "@/lib/lexware/kontakt-abgleich";
import { lexwareKontaktFestlegen } from "./aktionen";

export type KontaktWahl = { kundeId: string; kandidaten: Kandidat[] };

/**
 * „Gibt es den Kunden schon in Lexware?“ Bei unsicheren Treffern wählt das Büro: vorhandenen Kontakt verwenden oder
 * neu anlegen. Danach geht „Fertigstellen“ von selbst weiter (onGewaehlt).
 */
export function KontaktWahlDialog({ wahl, onSchliessen, onGewaehlt }: { wahl: KontaktWahl | null; onSchliessen: () => void; onGewaehlt: () => void }) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const waehlen = (x: string) =>
    starte(async () => {
      setFehler(null);
      const r = await lexwareKontaktFestlegen(wahl!.kundeId, x);
      if (r.fehler) return setFehler(r.fehler);
      onGewaehlt();
    });
  return (
    <Dialog open={!!wahl} onOpenChange={(o) => !o && onSchliessen()}>
      <DialogContent title="Kunde schon in Lexware?" wide>
        <div className="flex flex-col gap-3" data-kontakt-wahl>
          <p className="text-sm text-ink-3">
            In Lexware gibt es möglicherweise schon einen Kontakt für diesen Kunden. Bitte den passenden verwenden, damit keine doppelten Kunden entstehen, oder einen neuen anlegen.
          </p>
          {fehler && (
            <p role="alert" className="rounded-md bg-tone-red-bg px-3 py-2 text-sm text-tone-red-fg">
              {fehler}
            </p>
          )}
          <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line-soft">
            {wahl?.kandidaten.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5" data-kandidat={k.id}>
                <span className="min-w-0">
                  <b className="block font-medium">{k.name}</b>
                  <span className="block text-sm text-muted">
                    {[k.nummer ? `Kd.-Nr. ${k.nummer}` : null, k.email, k.adresse].filter(Boolean).join(" · ") || "keine weiteren Angaben"}
                  </span>
                  <span className="block text-xs text-muted-2">übereinstimmend: {k.gruende.map((g) => GRUND_TEXT[g] ?? g).join(", ")}</span>
                </span>
                <Button size="sm" disabled={laeuft} onClick={() => waehlen(k.id)}>
                  Diesen Kontakt verwenden
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2.5 pt-1">
            <Button onClick={onSchliessen} disabled={laeuft}>
              Abbrechen
            </Button>
            <Button variant="primary" disabled={laeuft} onClick={() => waehlen("neu")} data-kontakt-neu>
              <UserPlus className="size-4" /> Neuen Kontakt anlegen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
