"use client";

import { ChevronDown, ChevronRight, Truck } from "lucide-react";
import { useState, useTransition, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import type { PipelineEintrag } from "@/lib/montageplan";
import { besetzungNeu, STUFEN, tagAusSlot, zeitNeu, type PipelineStufe, type Zeile } from "@/lib/plantafel-logik";
import { einsatzSpeichern, type Ergebnis } from "./aktionen";
import { LABEL, Plantafel } from "./plantafel";
import { pipelineSetzen } from "./tafel-aktionen";

type Props = Omit<ComponentProps<typeof Plantafel>, "plan" | "planungszeilen" | "beiAblegen"> & { pipeline: PipelineEintrag[] };

const ZEILE = 34;
const UNTERTITEL: Record<PipelineStufe, string> = { lieferung: "Liefertermin", abschlag: "Zahlung aus Lexware", warten: "von Hand gesetzt" };

/**
 * Montageplan: Plantafel mit der Auftrags-Pipeline oben (CLAUDE.md „Planungszeilen im Montageplan“). Aufträge ohne
 * Montagetermin stehen in genau einer Stufe am Datum der Stufe (sonst Liefertermin). Ziehen innerhalb der Pipeline
 * ändert das Datum der Stufe bzw. setzt „Warten auf Kunde“; Ziehen auf einen Monteur, eine Kolonne oder eine Ressource
 * plant ein (vorgeplant); ein Klick öffnet den Termin-Dialog mit dem Auftrag.
 */
export function MontageTafel({ pipeline, ...p }: Props) {
  const { raster } = p;
  const [liste, setListe] = useState(pipeline);
  const [quelle, setQuelle] = useState(pipeline);
  if (quelle !== pipeline) {
    setQuelle(pipeline);
    setListe(pipeline);
  }
  const [zu, setZu] = useState(false);
  const [ziel, setZiel] = useState<string | null>(null);
  const [, starten] = useTransition();
  const aktuelleAnsicht = raster.tage.includes(p.heute) || (p.heute >= raster.tage[0] && p.heute <= raster.tage.at(-1)!);

  /** Tag in der Tafel: überschrittene Daten in der Ansicht mit „heute“ am ersten Tag, Wochenende am nächsten Werktag */
  const tagIndex = (d: string) => {
    if (d < raster.tage[0]) return aktuelleAnsicht ? 0 : -1;
    const i = raster.tage.findIndex((t) => t >= d);
    return i;
  };

  const beiAblegen = async (daten: string, zeile: Zeile, slot: number): Promise<Ergebnis | void> => {
    if (!daten.startsWith("auftrag:")) return;
    const a = liste.find((x) => x.id === daten.slice(8));
    if (!a) return;
    const b = besetzungNeu(zeile, p.kolonnen);
    if ("fehler" in b) return { fehler: b.fehler };
    const zeit = zeitNeu(slot, raster);
    setListe((l) => l.filter((x) => x.id !== a.id));
    const r = await einsatzSpeichern({ id: null, auftrag_id: a.id, ticket_id: null, fahrzeug_id: b.fahrzeug_id, ressource_id: b.ressource_id, monteure: b.monteure, ...zeit, fest: false, hinweis: null });
    if (r.fehler) setListe(pipeline);
    return r;
  };

  return (
    <Plantafel
      {...p}
      plan="montage"
      beiAblegen={beiAblegen}
      planungszeilen={({ breite, slot, n, neuerEinsatz, setMeldung, zielAktiv }) => (
        <div data-pipeline>
          <div className="flex border-b border-line bg-surface-muted">
            <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-surface-muted px-3 py-1.5" style={{ width: LABEL }}>
              <button type="button" onClick={() => setZu((x) => !x)} aria-expanded={!zu} className="flex min-w-0 items-start gap-1.5 text-left">
                {zu ? <ChevronRight className="mt-0.5 size-3.5 shrink-0" /> : <ChevronDown className="mt-0.5 size-3.5 shrink-0" />}
                <span className="min-w-0">
                  <b className="block text-sm font-semibold">Auftrags-Pipeline</b>
                  <span className="block text-[11px] text-muted-2">{liste.length} {liste.length === 1 ? "Auftrag" : "Aufträge"} noch ohne Montagetermin</span>
                </span>
              </button>
            </div>
            <div style={{ width: breite }} />
          </div>
          {!zu &&
            STUFEN.map(([stufe, titel]) => {
              const schluessel = `p:${stufe}`;
              const eintraege = liste.filter((a) => a.stufe === stufe && tagIndex(a.datum) >= 0);
              const nachTag = raster.tage.map((_, i) => eintraege.filter((a) => tagIndex(a.datum) === i));
              const spuren = Math.max(1, ...nachTag.map((l) => l.length));
              const markiert = ziel === schluessel || zielAktiv(schluessel);
              return (
                <div key={stufe} className="flex border-b border-line-soft bg-surface-muted/50" data-planungszeile={stufe}>
                  <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-line bg-surface-muted py-1.5 pr-3 pl-7" style={{ width: LABEL }}>
                    <span className="text-sm font-semibold">{titel}</span>
                    <span className="text-[11px] text-muted-2">{eintraege.length} · {UNTERTITEL[stufe]}</span>
                  </div>
                  <div
                    data-ziel={schluessel}
                    className={cn("relative", markiert && "outline-2 -outline-offset-2 outline-dashed outline-line-strong")}
                    style={{ width: breite, height: spuren * ZEILE + 8 }}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes("text/plain")) return;
                      e.preventDefault();
                      setZiel(schluessel);
                    }}
                    onDragLeave={() => setZiel(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setZiel(null);
                      const daten = e.dataTransfer.getData("text/plain");
                      const a = liste.find((x) => `auftrag:${x.id}` === daten);
                      if (!a) return;
                      const tag = tagAusSlot(Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / slot), raster);
                      if (tag === a.datum && stufe === a.stufe) return;
                      const vorher = liste;
                      setListe((l) => l.map((x) => (x.id === a.id ? { ...x, datum: tag, stufe: stufe === "abschlag" && !x.abschlaege_bezahlt ? x.stufe : stufe } : x)));
                      starten(async () => {
                        const r = await pipelineSetzen(a.id, stufe, tag);
                        if (r.fehler) setListe(vorher);
                        setMeldung(r.fehler ? { fehler: r.fehler } : r.warnung ? { warnung: r.warnung } : {});
                      });
                    }}
                  >
                    {nachTag.flatMap((l, i) =>
                      l.map((a, spur) => {
                        const ueberfaellig = a.datum < p.heute;
                        const bezahlt = stufe === "abschlag" ? `${a.abschlaege_bezahlt}/${a.abschlaege_gesamt}` : "";
                        return (
                          <button
                            key={a.id}
                            type="button"
                            draggable
                            data-pipeline-auftrag={a.id}
                            data-stufe={stufe}
                            data-tag={a.datum}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", `auftrag:${a.id}`);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onClick={() =>
                              neuerEinsatz({ ...zeitNeu(i * n, raster), monteure: [], bezug: { art: "auftrag", id: a.id, nummer: a.nummer, titel: a.titel, kunde: a.kunde } })
                            }
                            title={[
                              `${a.nummer} · ${a.kunde} · ${a.titel}`,
                              `${titel}${bezahlt ? ` (${a.abschlaege_bezahlt} von ${a.abschlaege_gesamt} Abschlägen bezahlt)` : ""} · ${a.datum.split("-").reverse().join(".")}${ueberfaellig ? " (überschritten)" : ""}`,
                              a.liefertermin && a.liefertermin !== a.datum ? `Liefertermin ${a.liefertermin.split("-").reverse().join(".")}` : "",
                              "Auf eine Zeile ziehen zum Einplanen, Klick plant mit Dialog",
                            ]
                              .filter(Boolean)
                              .join("\n")}
                            className={cn(
                              "absolute flex cursor-grab items-center gap-1 overflow-hidden rounded-md border-2 border-dashed px-1.5 text-left text-[12px] active:cursor-grabbing",
                              ueberfaellig ? "border-tone-red-fg bg-tone-red-bg text-tone-red-fg" : "border-(--plan-1) bg-surface text-ink-3",
                            )}
                            style={{ left: i * n * slot + 2, width: n * slot - 4, top: 4 + spur * ZEILE, height: ZEILE - 4 }}
                          >
                            {n * slot >= 90 && <Truck className="size-3 shrink-0" aria-hidden="true" />}
                            <b className="truncate font-semibold">{a.kunde || a.nummer}</b>
                            {n * slot >= 150 && <span className="truncate font-mono text-[10.5px] opacity-75">{a.nummer}</span>}
                            {bezahlt && <span className="ml-auto shrink-0 pl-1 text-[11px] font-semibold" title={`${a.abschlaege_bezahlt} von ${a.abschlaege_gesamt} Abschlägen bezahlt`}>{bezahlt}</span>}
                          </button>
                        );
                      }),
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    />
  );
}
