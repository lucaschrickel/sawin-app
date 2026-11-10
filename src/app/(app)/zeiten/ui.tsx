"use client";

import Link from "next/link";
import { Check, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { stundenText, ZEIT_ART_TEXT } from "@/lib/team";
import { freigabeSetzen, type Ergebnis } from "./aktionen";
import { ZeitDialog, type ZeitBuchung, type ZeitDialogDaten } from "./zeit-dialog";

export type Zeile = ZeitBuchung & { stunden: number; freigabe: "offen" | "freigegeben"; mitarbeiter: { id: string; name: string; kuerzel: string } };

const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const datumKurz = (d: string) => `${WT[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** Buchungen mit Freigabe (einzeln und gesammelt); Klick auf eine offene Buchung öffnet sie zum Bearbeiten */
export function BuchungenTabelle({ zeilen, daten, summen }: { zeilen: Zeile[]; daten: ZeitDialogDaten; summen: { name: string; stunden: number }[] }) {
  const [offen, setOffen] = useState<Zeile | null>(null);
  const [meldung, setMeldung] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  const offeneIds = zeilen.filter((z) => z.freigabe === "offen").map((z) => z.id);
  const setzen = (ids: string[], f: "offen" | "freigegeben") => starten(async () => setMeldung(await freigabeSetzen(ids, f)));

  return (
    <div className="flex flex-col gap-3">
      {(meldung.fehler || meldung.hinweis) && (
        <p role={meldung.fehler ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-sm", meldung.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}>
          {meldung.fehler ?? meldung.hinweis}
        </p>
      )}
      <div className="rounded-lg border border-line-soft bg-surface">
        {zeilen.length ? (
          <Table className="min-w-[900px]">
            <thead>
              <tr>
                <Th className="pl-4">Datum</Th>
                <Th>Mitarbeiter</Th>
                <Th>Bezug</Th>
                <Th>Zeit</Th>
                <Th className="text-right">Pause</Th>
                <Th className="text-right">Stunden</Th>
                <Th>Art</Th>
                <Th className="pr-4">Freigabe</Th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr
                  key={z.id}
                  data-buchung={z.id}
                  onClick={(e) => { if (z.freigabe === "offen" && !(e.target as HTMLElement).closest("a, button")) setOffen(z); }}
                  className={cn(z.freigabe === "offen" ? "cursor-pointer hover:bg-surface-muted" : "text-ink-3")}
                >
                  <Td className="pl-4 whitespace-nowrap">{datumKurz(z.datum)}</Td>
                  <Td className="whitespace-nowrap">
                    <Link href={`/mitarbeiter/${z.mitarbeiter.id}`} className="hover:underline">{z.mitarbeiter.name}</Link>
                  </Td>
                  <Td>
                    {z.auftrag ? (
                      <Link href={z.auftrag.art === "auftrag" ? `/auftraege/${z.auftrag.id}` : `/service/${z.auftrag.id}`} className="hover:underline">
                        <span className="font-mono text-[13px]">{z.auftrag.nummer}</span> <span className="text-sm text-muted">{z.auftrag.kunde}</span>
                      </Link>
                    ) : (
                      <span className="text-sm text-muted">ohne Bezug</span>
                    )}
                    {z.taetigkeit && <div className="text-xs text-muted-2">{z.taetigkeit}</div>}
                  </Td>
                  <Td className="font-mono text-[13px] whitespace-nowrap">{z.beginn}–{z.ende}</Td>
                  <Td className="text-right text-sm whitespace-nowrap">{z.pause_min} min</Td>
                  <Td className="text-right font-mono text-[13px]">{stundenText(z.stunden)}</Td>
                  <Td className="text-sm whitespace-nowrap">{ZEIT_ART_TEXT[z.art]}</Td>
                  <Td className="pr-4 whitespace-nowrap">
                    {z.freigabe === "offen" ? (
                      <Button size="xs" disabled={laeuft} onClick={() => setzen([z.id], "freigegeben")}>
                        <Check className="size-3.5" />
                        Freigeben
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Badge tone="green">Freigegeben</Badge>
                        <button type="button" disabled={laeuft} onClick={() => setzen([z.id], "offen")} aria-label="Freigabe zurücknehmen" title="Freigabe zurücknehmen" className="grid size-7 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-ink">
                          <Undo2 className="size-3.5" />
                        </button>
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
            {summen.length > 0 && (
              <tfoot>
                <tr className="border-t border-line">
                  <Td className="pl-4 text-sm font-semibold" colSpan={2}>Summe im Zeitraum</Td>
                  <Td colSpan={6} className="pr-4 text-sm">
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      {summen.map((s) => (
                        <span key={s.name}>{s.name} <b className="font-mono text-[13px] font-semibold">{stundenText(s.stunden)}</b></span>
                      ))}
                    </span>
                  </Td>
                </tr>
              </tfoot>
            )}
          </Table>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted">Keine Zeiten für diese Auswahl.</p>
        )}
      </div>
      {offeneIds.length > 0 && (
        <div className="flex justify-end">
          <Button disabled={laeuft} onClick={() => setzen(offeneIds, "freigegeben")}>
            <Check className="size-[15px]" />
            {offeneIds.length === 1 ? "Offene Buchung freigeben" : `Alle ${offeneIds.length} offenen freigeben`}
          </Button>
        </div>
      )}
      {offen && <ZeitDialog key={offen.id} daten={daten} buchung={offen} beiSchliessen={() => setOffen(null)} />}
    </div>
  );
}
