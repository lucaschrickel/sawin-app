"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { besetzungNeu, tagAusSlot, zeitNeu, type Zeile } from "@/lib/plantafel-logik";
import type { TerminierbaresTicket } from "@/lib/service";
import { TICKET_ART_TEXT } from "@/lib/ticket-status";
import { lokalAus } from "@/lib/woche";
import { einsatzSpeichern, type Ergebnis } from "../montageplan/aktionen";
import { LABEL, Plantafel } from "../montageplan/plantafel";
import { vorabDatumSetzen } from "../service/aktionen";

type Props = Omit<ComponentProps<typeof Plantafel>, "plan" | "planungszeilen" | "beiAblegen"> & { terminierbar: TerminierbaresTicket[] };

const ZEILE = 34;

/**
 * Service-Plan: dieselbe Plantafel wie der Montageplan, mit der Planungszeile „Terminierbar“ (CLAUDE.md).
 * Ziehen eines Tickets auf einen Monteur, eine Kolonne oder eine Ressource plant es ein (vorgeplant, zwei Stunden bzw.
 * in der 4-Wochen-Ansicht der Arbeitstag), Ziehen innerhalb der Zeile verschiebt den Tag, ein Klick öffnet den
 * Termin-Dialog mit dem Ticket. Ein Einsatz zurück in die Zeile nimmt den Termin heraus.
 */
export function ServiceTafel({ terminierbar, ...p }: Props) {
  const { raster } = p;
  const [liste, setListe] = useState(terminierbar);
  const [quelle, setQuelle] = useState(terminierbar);
  if (quelle !== terminierbar) {
    setQuelle(terminierbar);
    setListe(terminierbar);
  }
  const [ziel, setZiel] = useState(false);
  const [, starten] = useTransition();

  // Tag in der Tafel: frühere (überfällige) am ersten Tag, Wochenende am nächsten Werktag, spätere am letzten Tag
  const tagIndex = (d: string) => {
    if (d < raster.tage[0]) return 0;
    const i = raster.tage.findIndex((t) => t >= d);
    return i < 0 ? raster.tage.length - 1 : i;
  };
  const nachTag = raster.tage.map((_, i) => liste.filter((t) => tagIndex(t.vorab_datum) === i));
  const spuren = Math.max(1, ...nachTag.map((l) => l.length));

  const zeitFuer = (slot: number) => {
    if (raster.tagesgenau) return zeitNeu(slot, raster);
    const n = raster.bis - raster.von;
    const tagEnde = (Math.floor(slot / n) + 1) * n;
    return { beginn: lokalAus(slot, raster, "beginn"), ende: lokalAus(Math.min(slot + 2, tagEnde), raster, "ende") };
  };

  const beiAblegen = async (daten: string, zeile: Zeile, slot: number): Promise<Ergebnis | void> => {
    if (!daten.startsWith("ticket:")) return;
    const t = liste.find((x) => x.id === daten.slice(7));
    if (!t) return;
    const b = besetzungNeu(zeile, p.kolonnen);
    if ("fehler" in b) return { fehler: b.fehler };
    setListe((l) => l.filter((x) => x.id !== t.id));
    const r = await einsatzSpeichern({ id: null, auftrag_id: null, ticket_id: t.id, fahrzeug_id: b.fahrzeug_id, ressource_id: b.ressource_id, monteure: b.monteure, ...zeitFuer(slot), fest: false, hinweis: null });
    if (r.fehler) setListe(terminierbar);
    return r;
  };

  return (
    <Plantafel
      {...p}
      plan="service"
      beiAblegen={beiAblegen}
      planungszeilen={({ breite, slot, n, neuerEinsatz, setMeldung, zielAktiv }) => (
        <div className="flex border-b border-line bg-surface-muted" data-planungszeile="terminierbar">
          <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-line bg-surface-muted px-3" style={{ width: LABEL }}>
            <span className="text-sm font-semibold">Terminierbar</span>
            <span className="text-xs text-muted-2">{liste.length ? `${liste.length} ${liste.length === 1 ? "Ticket" : "Tickets"} ohne Termin` : "keine offenen Tickets"}</span>
          </div>
          <div
            data-ziel="p:terminierbar"
            className={cn("relative", (ziel || zielAktiv("p:terminierbar")) && "outline-2 -outline-offset-2 outline-dashed outline-line-strong")}
            style={{ width: breite, height: spuren * ZEILE + 8 }}
            onDragOver={(e) => { e.preventDefault(); setZiel(true); }}
            onDragLeave={() => setZiel(false)}
            onDrop={(e) => {
              e.preventDefault();
              setZiel(false);
              const daten = e.dataTransfer.getData("text/plain");
              const t = liste.find((x) => `ticket:${x.id}` === daten);
              if (!t) return;
              const tag = tagAusSlot(Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / slot), raster);
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
                      neuerEinsatz({ ...zeitFuer(i * n), monteure: [], bezug: { art: "ticket", id: t.id, nummer: t.nummer, titel: t.thema, kunde: t.kunde } })
                    }
                    title={`${t.nummer} · ${t.kunde} · ${t.thema}\nTag in „Terminierbar“: ${t.vorab_datum.split("-").reverse().join(".")}${ueberfaellig ? " (überschritten)" : ""}\nAuf eine Zeile ziehen, um einzuplanen`}
                    className={cn(
                      "absolute flex cursor-grab items-center gap-1.5 overflow-hidden rounded-md border-2 border-dashed px-1.5 text-left text-[12px] active:cursor-grabbing",
                      ueberfaellig ? "border-tone-red-fg bg-tone-red-bg text-tone-red-fg" : "border-(--plan-2) bg-surface text-ink-3",
                    )}
                    style={{ left: i * n * slot + 2, width: n * slot - 4, top: 4 + spur * ZEILE, height: ZEILE - 4 }}
                  >
                    <b className="truncate font-semibold">{t.kunde || t.nummer}</b>
                    {n * slot >= 150 && <span className="truncate font-mono text-[11px] opacity-75">{t.nummer}</span>}
                    {t.prioritaet === "hoch" && n * slot >= 110 && <Badge tone="red" className="shrink-0">Hoch</Badge>}
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
