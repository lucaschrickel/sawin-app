"use client";

import { AlertTriangle, Pencil, Plus, UserMinus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Monteur, TafelAbwesenheit, TafelEinsatz } from "@/lib/montageplan";
import { ABWESENHEIT_TEXT, konfliktText, type Konflikt } from "@/lib/montageplan-text";
import { lokalAus, lokalKurz, slotAus, slotsGesamt, stundenJeTag, tagKurz, type Raster } from "@/lib/woche";
import { einsatzSpeichern, monteurDeaktivieren, type Ergebnis } from "./aktionen";
import { EinsatzDialog, MonteurDialog, type AuftragWahl, type DialogVorlage } from "./einsatz-dialog";

/** Breite einer Stunde und Höhe einer Spur in Pixeln */
const SLOT = 26;
const SPUR = 44;
const LABEL = 200;

type Zug = {
  id: string;
  art: "verschieben" | "anfang" | "ende";
  monteur: string;
  x0: number;
  y0: number;
  s0: number;
  en0: number;
  s: number;
  en: number;
  ziel: string;
  bewegt: boolean;
  px: number;
  py: number;
};
type Balken = { e: TafelEinsatz; s: number; en: number; abgeschnitten: boolean; spur: number };

type Props = {
  raster: Raster;
  heute: string;
  monteure: Monteur[];
  einsaetze: TafelEinsatz[];
  abwesenheiten: TafelAbwesenheit[];
  konflikte: Konflikt[];
  /** Aus „Montage planen“ am Auftrag: Dialog für einen neuen Einsatz zu diesem Auftrag öffnen */
  auftragVorlage: AuftragWahl | null;
};

export function Plantafel(p: Props) {
  const { raster } = p;
  const n = stundenJeTag(raster);
  const gesamt = slotsGesamt(raster);
  const router = useRouter();
  const pfad = usePathname();

  // Optimistische Kopie der Einsätze; neue Daten vom Server ersetzen sie (Muster „State aus Props ableiten“)
  const [quelle, setQuelle] = useState(p.einsaetze);
  const [liste, setListe] = useState(p.einsaetze);
  if (quelle !== p.einsaetze) {
    setQuelle(p.einsaetze);
    setListe(p.einsaetze);
  }
  const listeRef = useRef(liste);
  useEffect(() => {
    listeRef.current = liste;
  }, [liste]);

  const [zug, setZug] = useState<Zug | null>(null);
  const zugRef = useRef<Zug | null>(null);
  const zugEnde = useRef(0);
  const [meldung, setMeldung] = useState<Ergebnis>({});
  const [markiert, setMarkiert] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogVorlage | null>(() => {
    if (!p.auftragVorlage) return null;
    const tag = raster.tage.find((t) => t >= p.heute) ?? raster.tage[0];
    return { beginn: `${tag}T${String(raster.von).padStart(2, "0")}:00`, ende: `${tag}T${String(raster.bis).padStart(2, "0")}:00`, monteure: [], auftrag: p.auftragVorlage };
  });
  const [, starten] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  // Beim Öffnen steht der heutige Tag im Blick
  useEffect(() => {
    const i = raster.tage.indexOf(p.heute);
    if (scroller.current && i > 0) scroller.current.scrollLeft = Math.max(0, i * n * SLOT - SLOT);
  }, [raster.tage, p.heute, n]);

  const konfliktVon = (einsatzId: string, monteurId: string) => p.konflikte.filter((k) => k.einsatz_id === einsatzId && k.mitarbeiter_id === monteurId);
  const name = new Map(p.monteure.map((m) => [m.id, m.name]));

  const dialogSchliessen = () => {
    setDialog(null);
    if (p.auftragVorlage) router.replace(`${pfad}?woche=${raster.tage[0]}`, { scroll: false });
  };

  // ---------- Ziehen, Verlängern, Verkürzen ----------
  const bewegen = (ev: PointerEvent) => {
    const z = zugRef.current;
    if (!z || Number.isNaN(z.x0)) return;
    const dx = ev.clientX - z.x0;
    const d = Math.round(dx / SLOT);
    const neu: Zug = { ...z, px: ev.clientX, py: ev.clientY, bewegt: z.bewegt || Math.abs(dx) > 4 || Math.abs(ev.clientY - z.y0) > 6 };
    if (z.art === "verschieben") {
      const laenge = z.en0 - z.s0;
      neu.s = Math.min(Math.max(z.s0 + d, 0), gesamt - laenge);
      neu.en = neu.s + laenge;
      const zeile = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => (el as HTMLElement).dataset?.zeile) as HTMLElement | undefined;
      if (zeile?.dataset.zeile) neu.ziel = zeile.dataset.zeile;
    } else if (z.art === "anfang") {
      neu.s = Math.min(Math.max(z.s0 + d, 0), z.en0 - 1);
    } else {
      neu.en = Math.min(Math.max(z.en0 + d, z.s0 + 1), gesamt);
    }
    zugRef.current = neu;
    setZug(neu);
  };

  const loslassen = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", bewegen);
    window.removeEventListener("pointerup", loslassen);
    const z = zugRef.current;
    zugRef.current = null;
    setZug(null);
    if (!z) return;
    zugEnde.current = ev.timeStamp;
    const e = listeRef.current.find((x) => x.id === z.id);
    if (!e?.auftrag) return;
    if (!z.bewegt) {
      // Ein Klick auf den Balken öffnet den Termin-Dialog, ein Klick auf den Griff nicht
      if (z.art === "verschieben") setDialog({ einsatz: e });
      return;
    }
    if (z.s === z.s0 && z.en === z.en0 && z.ziel === z.monteur) return;
    let monteure = e.monteure;
    if (z.ziel !== z.monteur) {
      if (e.monteure.includes(z.ziel)) {
        setMeldung({ fehler: `${name.get(z.ziel) ?? "Der Monteur"} ist schon in diesem Einsatz.` });
        return;
      }
      monteure = e.monteure.map((m) => (m === z.monteur ? z.ziel : m));
    }
    const beginn = z.s !== z.s0 ? lokalAus(z.s, raster, "beginn") : e.beginn;
    const ende = z.en !== z.en0 ? lokalAus(z.en, raster, "ende") : e.ende;
    const vorher = listeRef.current;
    setListe((l) => l.map((x) => (x.id === e.id ? { ...x, beginn, ende, monteure } : x)));
    setMeldung({});
    starten(async () => {
      const r = await einsatzSpeichern({ id: e.id, auftrag_id: e.auftrag!.id, beginn, ende, monteure, fest: null, hinweis: e.hinweis });
      if (r.fehler) {
        setListe(vorher);
        setMeldung({ fehler: r.fehler });
      } else setMeldung(r.warnung ? { warnung: r.warnung } : {});
    });
  };

  const greifen = (ev: ReactPointerEvent, b: Balken, monteur: string, art: Zug["art"]) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    // Einsätze, die über den sichtbaren Zeitraum hinausgehen, werden nur per Dialog geändert
    const neu: Zug = { id: b.e.id, art: b.abgeschnitten ? "verschieben" : art, monteur, x0: ev.clientX, y0: ev.clientY, s0: b.s, en0: b.en, s: b.s, en: b.en, ziel: monteur, bewegt: false, px: ev.clientX, py: ev.clientY };
    if (b.abgeschnitten) neu.x0 = Number.NaN; // Bewegung zählt nicht
    zugRef.current = neu;
    setZug(neu);
    window.addEventListener("pointermove", bewegen);
    window.addEventListener("pointerup", loslassen);
  };

  // ---------- Balken je Zeile mit Spuren für Überschneidungen ----------
  const balkenFuer = (monteurId: string): { balken: Balken[]; spuren: number } => {
    const roh: Omit<Balken, "spur">[] = [];
    for (const e of liste) {
      const imZug = zug && zug.id === e.id && zug.bewegt && !Number.isNaN(zug.x0);
      const zeile = imZug && zug.ziel !== zug.monteur && !e.monteure.includes(zug.ziel) ? (monteurId === zug.ziel ? zug.monteur : monteurId === zug.monteur ? null : monteurId) : monteurId;
      if (!zeile || !e.monteure.includes(zeile)) continue;
      const s = imZug ? zug.s : slotAus(e.beginn, raster, "beginn");
      const en = imZug ? zug.en : slotAus(e.ende, raster, "ende");
      if (en <= s) continue;
      roh.push({ e, s, en, abgeschnitten: e.beginn.slice(0, 10) < raster.tage[0] || e.ende.slice(0, 10) > raster.tage.at(-1)! });
    }
    roh.sort((a, b) => a.s - b.s || b.en - a.en);
    const enden: number[] = [];
    const balken = roh.map((b) => {
      let spur = enden.findIndex((x) => x <= b.s);
      if (spur < 0) spur = enden.push(0) - 1;
      enden[spur] = b.en;
      return { ...b, spur };
    });
    return { balken, spuren: Math.max(1, enden.length) };
  };

  const neuInZelle = (ev: ReactMouseEvent<HTMLDivElement>, monteurId: string) => {
    if ((ev.target as HTMLElement).closest("[data-einsatz]") || ev.timeStamp - zugEnde.current < 400) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const slot = Math.min(Math.max(Math.floor((ev.clientX - rect.left) / SLOT), 0), gesamt - 1);
    const tagEnde = (Math.floor(slot / n) + 1) * n;
    setDialog({ beginn: lokalAus(slot, raster, "beginn"), ende: lokalAus(tagEnde, raster, "ende"), monteure: [monteurId] });
  };

  const konflikteWoche = [...new Map(p.konflikte.map((k) => [`${k.einsatz_id}|${k.mitarbeiter_id}|${k.detail}`, k])).values()];
  const breite = gesamt * SLOT;

  return (
    <div className="flex flex-col gap-3">
      {meldung.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{meldung.fehler}</p>}
      {meldung.warnung && (
        <p role="alert" className="flex items-center gap-2 rounded-md bg-tone-amber-bg px-3.5 py-2.5 text-sm text-tone-amber-fg">
          <AlertTriangle className="size-4 shrink-0" />
          {meldung.warnung}
        </p>
      )}
      {konflikteWoche.length > 0 && (
        <details className="rounded-md border border-tone-red-bg bg-surface px-4 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium text-tone-red-fg">
            {konflikteWoche.length === 1 ? "1 Konflikt" : `${konflikteWoche.length} Konflikte`} in dieser Woche
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-ink-3">
            {konflikteWoche.map((k) => {
              const e = liste.find((x) => x.id === k.einsatz_id);
              return (
                <li key={`${k.einsatz_id}|${k.mitarbeiter_id}|${k.detail}`}>
                  <b className="font-medium">{name.get(k.mitarbeiter_id) ?? "Monteur"}</b> · {e?.auftrag ? `${e.auftrag.nummer} ${e.auftrag.kunde}` : "Einsatz"} · {konfliktText(k)}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <div ref={scroller} className="overflow-x-scroll rounded-lg border border-line-soft bg-surface select-none" data-tafel>
        <div style={{ width: LABEL + breite }}>
          {/* Kopf: Tage und Stunden */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
            <div className="sticky left-0 z-30 flex shrink-0 items-end border-r border-line bg-surface px-3 pb-1.5 text-xs text-muted-2" style={{ width: LABEL }}>
              Monteure
            </div>
            <div>
              <div className="flex">
                {raster.tage.map((t) => (
                  <div
                    key={t}
                    className={cn("border-l border-line px-2 py-1.5 text-sm font-semibold", t === p.heute && "bg-tone-brand-bg text-tone-brand-fg")}
                    style={{ width: n * SLOT }}
                  >
                    {tagKurz(t)}
                    {t === p.heute && <span className="ml-1.5 text-xs font-normal">heute</span>}
                  </div>
                ))}
              </div>
              <div className="flex">
                {raster.tage.flatMap((t) =>
                  Array.from({ length: n }, (_, i) => (
                    <div key={`${t}-${i}`} className={cn("py-0.5 text-center text-[10.5px] text-muted-2 tabular", i === 0 ? "border-l border-line" : "border-l border-line-soft")} style={{ width: SLOT }}>
                      {raster.von + i}
                    </div>
                  )),
                )}
              </div>
            </div>
          </div>

          {/* Zeilen je Monteur */}
          {p.monteure.map((m) => {
            const { balken, spuren } = balkenFuer(m.id);
            const abwesend = p.abwesenheiten.filter((a) => a.mitarbeiter_id === m.id);
            const ziel = zug?.bewegt && zug.ziel === m.id && zug.ziel !== zug.monteur;
            return (
              <div key={m.id} className={cn("group/zeile flex border-b border-line-soft", markiert === m.id ? "bg-tone-brand-bg/60" : "hover:bg-surface-muted")} data-monteur-zeile={m.id}>
                <div
                  className={cn("sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line px-3", markiert === m.id ? "bg-tone-brand-bg" : "bg-surface group-hover/zeile:bg-surface-muted")}
                  style={{ width: LABEL }}
                >
                  <button type="button" onClick={() => setMarkiert((x) => (x === m.id ? null : m.id))} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-pressed={markiert === m.id}>
                    <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-surface-sunken px-1.5 text-[11px] font-semibold">{m.kuerzel}</span>
                    <span className="truncate text-sm font-medium">{m.name}</span>
                  </button>
                  <span className="flex opacity-0 transition group-hover/zeile:opacity-100 focus-within:opacity-100">
                    <MonteurDialog
                      monteur={m}
                      ausloeser={
                        <button type="button" aria-label={`${m.name} umbenennen`} className="grid size-7 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-ink">
                          <Pencil className="size-3.5" />
                        </button>
                      }
                    />
                    <Bestaetigen
                      titel="Monteur deaktivieren?"
                      text={<><b className="text-ink">{m.name}</b> verschwindet aus der Plantafel. Geplante Einsätze bleiben erhalten.</>}
                      knopf="Deaktivieren"
                      gefahr
                      ausfuehren={() => starten(async () => setMeldung(await monteurDeaktivieren(m.id)))}
                    >
                      <button type="button" aria-label={`${m.name} deaktivieren`} className="grid size-7 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-tone-red-fg">
                        <UserMinus className="size-3.5" />
                      </button>
                    </Bestaetigen>
                  </span>
                </div>
                <div
                  data-zeile={m.id}
                  onClick={(ev) => neuInZelle(ev, m.id)}
                  className={cn("relative cursor-cell", ziel && "outline-2 -outline-offset-2 outline-dashed outline-line-strong")}
                  style={{
                    width: breite,
                    height: spuren * SPUR + 8,
                    backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${SLOT - 1}px, var(--line-soft) ${SLOT - 1}px ${SLOT}px), repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px ${n * SLOT}px)`,
                  }}
                >
                  {raster.tage.map((t, i) =>
                    t === p.heute ? <div key={t} aria-hidden="true" className="pointer-events-none absolute inset-y-0 bg-tone-brand-bg/40" style={{ left: i * n * SLOT, width: n * SLOT }} /> : null,
                  )}
                  {abwesend.flatMap((a) =>
                    raster.tage.flatMap((t, i) =>
                      t >= a.von && t <= a.bis
                        ? [
                            <div
                              key={`${a.id}-${t}`}
                              data-abwesenheit={a.status}
                              title={`${m.name}: ${ABWESENHEIT_TEXT[a.art] ?? a.art}${a.status === "beantragt" ? " (beantragt)" : ""}`}
                              className={cn(
                                "pointer-events-none absolute inset-y-1 flex items-start rounded-sm px-1.5 pt-0.5 text-[11px] font-medium text-tone-gray-fg",
                                a.status === "genehmigt" ? "bg-tone-gray-bg" : "border border-dashed border-line-strong",
                              )}
                              style={{
                                left: i * n * SLOT + 2,
                                width: n * SLOT - 4,
                                backgroundImage: a.status === "beantragt" ? "repeating-linear-gradient(135deg, var(--tone-gray-bg) 0 6px, transparent 6px 12px)" : undefined,
                              }}
                            >
                              {ABWESENHEIT_TEXT[a.art] ?? a.art}
                              {a.status === "beantragt" ? " · beantragt" : ""}
                            </div>,
                          ]
                        : [],
                    ),
                  )}
                  {balken.map((b) => {
                    const ks = konfliktVon(b.e.id, m.id);
                    const reklamation = b.e.auftrag?.phase === "reklamation";
                    const schmal = (b.en - b.s) * SLOT < 110;
                    const aktiv = zug?.id === b.e.id && zug.bewegt;
                    const titel = [
                      `${b.e.auftrag?.nummer ?? ""} · ${b.e.auftrag?.kunde ?? ""}${b.e.auftrag?.titel ? ` · ${b.e.auftrag.titel}` : ""}`,
                      `${lokalKurz(b.e.beginn)} – ${lokalKurz(b.e.ende)}${b.e.fest ? "" : " · vorgeplant"}`,
                      `Team: ${b.e.monteure.map((x) => name.get(x) ?? "?").join(", ")}`,
                      ...ks.map((k) => `Konflikt: ${konfliktText(k)}`),
                      b.e.hinweis ?? "",
                    ].filter(Boolean).join("\n");
                    return (
                      <div
                        key={b.e.id}
                        role="button"
                        tabIndex={0}
                        data-einsatz={b.e.id}
                        data-konflikt={ks.length ? "1" : undefined}
                        title={titel}
                        aria-label={titel.replace(/\n/g, ", ")}
                        onPointerDown={(ev) => greifen(ev, b, m.id, "verschieben")}
                        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setDialog({ einsatz: b.e }); } }}
                        className={cn(
                          "group/balken absolute flex touch-none items-center gap-1.5 overflow-hidden rounded-md px-2 text-[12.5px] leading-tight shadow-card",
                          b.abgeschnitten ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                          b.e.fest
                            ? reklamation ? "bg-(--plan-5) text-ink" : "bg-(--plan-1) text-ink"
                            : cn("border-2 border-dashed bg-surface text-ink-3", reklamation ? "border-(--plan-5)" : "border-(--plan-1)"),
                          ks.length > 0 && "ring-2 ring-tone-red-fg",
                          aktiv && "z-10 opacity-90 shadow-hover",
                        )}
                        style={{ left: b.s * SLOT + 1, width: (b.en - b.s) * SLOT - 2, top: 4 + b.spur * SPUR, height: SPUR - 4 }}
                      >
                        {!b.abgeschnitten && (
                          <span data-griff="anfang" aria-hidden="true" onPointerDown={(ev) => greifen(ev, b, m.id, "anfang")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md opacity-0 group-hover/balken:bg-ink/20 group-hover/balken:opacity-100" />
                        )}
                        {ks.length > 0 && <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />}
                        <span className="min-w-0 truncate">
                          <b className="font-semibold">{b.e.auftrag?.kunde || b.e.auftrag?.nummer}</b>
                          {!schmal && <span className="ml-1.5 font-mono text-[11px] opacity-75">{b.e.auftrag?.nummer}</span>}
                        </span>
                        {!b.abgeschnitten && (
                          <span data-griff="ende" aria-hidden="true" onPointerDown={(ev) => greifen(ev, b, m.id, "ende")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md opacity-0 group-hover/balken:bg-ink/20 group-hover/balken:opacity-100" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!p.monteure.length && <p className="px-4 py-10 text-center text-sm text-muted">Noch keine Monteure. Über „Monteur hinzufügen“ anlegen.</p>}
        </div>
      </div>

      {zug?.bewegt && !Number.isNaN(zug.x0) && (
        <div role="status" className="pointer-events-none fixed z-[120] rounded-sm bg-ink px-2 py-1 text-xs text-surface shadow-pop" style={{ left: zug.px + 14, top: zug.py + 14 }}>
          {lokalKurz(lokalAus(zug.s, raster, "beginn"))} – {lokalKurz(lokalAus(zug.en, raster, "ende"))}
          {zug.ziel !== zug.monteur && ` · ${name.get(zug.ziel) ?? ""}`}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul aria-label="Legende" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs bg-(--plan-1)" />Auftrag</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs bg-(--plan-5)" />Reklamation</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs border-2 border-dashed border-(--plan-1)" />Vorgeplant</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs bg-tone-gray-bg" />Abwesend</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs border border-dashed border-line-strong" style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--tone-gray-bg) 0 3px, transparent 3px 6px)" }} />Beantragt</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs ring-2 ring-tone-red-fg" />Konflikt</li>
        </ul>
        <p className="text-xs text-muted-2">Klick in eine Stunde plant ein · Balken ziehen verschiebt, auch zu einem anderen Monteur · Enden ziehen ändert die Dauer</p>
      </div>

      <div className="flex gap-2.5">
        <Button size="sm" onClick={() => setDialog({ beginn: `${raster.tage.find((t) => t >= p.heute) ?? raster.tage[0]}T${String(raster.von).padStart(2, "0")}:00`, ende: `${raster.tage.find((t) => t >= p.heute) ?? raster.tage[0]}T${String(raster.bis).padStart(2, "0")}:00`, monteure: [] })}>
          <Plus className="size-[15px]" strokeWidth={2.2} />
          Einsatz
        </Button>
        <MonteurDialog
          ausloeser={
            <Button size="sm">
              <Plus className="size-[15px]" strokeWidth={2.2} />
              Monteur hinzufügen
            </Button>
          }
        />
      </div>

      {dialog && <EinsatzDialog vorlage={dialog} monteure={p.monteure} beiSchliessen={dialogSchliessen} beiErgebnis={(r) => setMeldung(r.warnung ? { warnung: r.warnung } : {})} />}
    </div>
  );
}
