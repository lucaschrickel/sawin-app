"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { TerminierbaresTicket } from "@/lib/service";
import { TICKET_ART_TEXT } from "@/lib/status";
import { lokalAus, stundenJeTag } from "@/lib/woche";
import { einsatzSpeichern } from "../montageplan/aktionen";
import { LABEL, Plantafel, SLOT } from "../montageplan/plantafel";
import { vorabDatumSetzen } from "../service/aktionen";

type Props = Omit<ComponentProps<typeof Plantafel>, "plan" | "planungszeilen" | "beiAblegen"> & { terminierbar: TerminierbaresTicket[] };

const ZEILE = 38;

/**
 * Service-Plan: dieselbe Plantafel wie der Montageplan, mit der Planungszeile „Terminierbar“ (CLAUDE.md).
 * Ziehen eines Tickets auf einen Monteur plant es ein (vorgeplant, zwei Stunden), Ziehen innerhalb der Zeile
 * verschiebt den Tag, ein Klick öffnet den Termin-Dialog mit dem Ticket.
 */
export function ServiceTafel({ terminierbar, ...p }: Props) {
  const { raster } = p;
  const n = stundenJeTag(raster);
  const [liste, setListe] = useState(terminierbar);
  const [quelle, setQuelle] = useState(terminierbar);
  if (quelle !== terminierbar) {
    setQuelle(terminierbar);
    setListe(terminierbar);
  }
  const [ziel, setZiel] = useState(false);
  const [, starten] = useTransition();

  // Tag in der Woche: frühere (überfällige) am Montag, Wochenende am Freitag
  const tagIndex = (d: string) => (d < raster.tage[0] ? 0 : d > raster.tage[4] ? 4 : raster.tage.indexOf(d));
  const nachTag = raster.tage.map((_, i) => liste.filter((t) => tagIndex(t.vorab_datum) === i));
  const spuren = Math.max(1, ...nachTag.map((l) => l.length));

  const beiAblegen = async (daten: string, monteurId: string, slot: number) => {
    if (!daten.startsWith("ticket:")) return;
    const t = liste.find((x) => x.id === daten.slice(7));
    if (!t) return;
    const tagEnde = (Math.floor(slot / n) + 1) * n;
    setListe((l) => l.filter((x) => x.id !== t.id));
    const r = await einsatzSpeichern({
      id: null,
      auftrag_id: null,
      ticket_id: t.id,
      fahrzeug_id: null,
      beginn: lokalAus(slot, raster, "beginn"),
      ende: lokalAus(Math.min(slot + 2, tagEnde), raster, "ende"),
      monteure: [monteurId],
      fest: false,
      hinweis: null,
    });
    if (r.fehler) setListe(terminierbar);
    return r;
  };

  return (
    <Plantafel
      {...p}
      plan="service"
      beiAblegen={beiAblegen}
      planungszeilen={({ breite, neuerEinsatz, setMeldung }) => (
        <div className="flex border-b border-line bg-surface-muted" data-planungszeile="terminierbar">
          <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-line bg-surface-muted px-3" style={{ width: LABEL }}>
            <span className="text-sm font-semibold">Terminierbar</span>
            <span className="text-xs text-muted-2">{liste.length ? `${liste.length} ${liste.length === 1 ? "Ticket" : "Tickets"} ohne Termin` : "keine offenen Tickets"}</span>
          </div>
          <div
            className={cn("relative", ziel && "outline-2 -outline-offset-2 outline-dashed outline-line-strong")}
            style={{ width: breite, height: spuren * ZEILE + 8 }}
            onDragOver={(e) => { e.preventDefault(); setZiel(true); }}
            onDragLeave={() => setZiel(false)}
            onDrop={(e) => {
              e.preventDefault();
              setZiel(false);
              const daten = e.dataTransfer.getData("text/plain");
              const t = liste.find((x) => `ticket:${x.id}` === daten);
              if (!t) return;
              const tag = raster.tage[Math.min(Math.max(Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / (n * SLOT)), 0), 4)];
              if (tag === t.vorab_datum) return;
              const vorher = liste;
              setListe((l) => l.map((x) => (x.id === t.id ? { ...x, vorab_datum: tag } : x)));
              starten(async () => {
                const r = await vorabDatumSetzen(t.id, tag);
                if (r.fehler) {
                  setListe(vorher);
                  setMeldung({ fehler: r.fehler });
                }
              });
            }}
          >
            {nachTag.flatMap((l, i) =>
              l.map((t, spur) => {
                const ueberfaellig = t.vorab_datum < p.heute;
                return (
                  <button
                    key={t.id}
                    type="button"
                    draggable
                    data-terminierbar={t.id}
                    data-tag={t.vorab_datum}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", `ticket:${t.id}`); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() =>
                      neuerEinsatz({
                        beginn: `${raster.tage[i]}T${String(raster.von).padStart(2, "0")}:00`,
                        ende: `${raster.tage[i]}T${String(Math.min(raster.von + 2, raster.bis)).padStart(2, "0")}:00`,
                        monteure: [],
                        bezug: { art: "ticket", id: t.id, nummer: t.nummer, titel: t.thema, kunde: t.kunde },
                      })
                    }
                    title={`${t.nummer} · ${t.kunde} · ${t.thema}\nTag in „Terminierbar“: ${t.vorab_datum.split("-").reverse().join(".")}${ueberfaellig ? " (überschritten)" : ""}\nAuf einen Monteur ziehen, um einzuplanen`}
                    className={cn(
                      "absolute flex cursor-grab items-center gap-1.5 overflow-hidden rounded-md border-2 border-dashed px-2 text-left text-[12.5px] active:cursor-grabbing",
                      ueberfaellig ? "border-tone-red-fg bg-tone-red-bg text-tone-red-fg" : "border-(--plan-2) bg-surface text-ink-3",
                    )}
                    style={{ left: i * n * SLOT + 2, width: n * SLOT - 4, top: 4 + spur * ZEILE, height: ZEILE - 4 }}
                  >
                    <b className="truncate font-semibold">{t.kunde || t.nummer}</b>
                    <span className="truncate font-mono text-[11px] opacity-75">{t.nummer}</span>
                    {t.prioritaet === "hoch" && <Badge tone="red" className="shrink-0">Hoch</Badge>}
                    <span className="sr-only">{TICKET_ART_TEXT[t.art]}</span>
                  </button>
                );
              }),
            )}
          </div>
        </div>
      )}
    />
  );
}
