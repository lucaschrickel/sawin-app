"use client";

import { AlertTriangle, Check, Copy, GripVertical, MoreHorizontal, Pencil, Plus, Printer, Store, UserMinus, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Monteur, Plan, TafelAbwesenheit, TafelEinsatz, TafelFahrzeug, TafelRessource } from "@/lib/montageplan";
import { ABWESENHEIT_TEXT, bezugHref, konfliktText, type Konflikt } from "@/lib/montageplan-text";
import {
  balkenFarbe,
  besetzungNachAblage,
  besetzungNeu,
  inZeile,
  spurenVerteilen,
  tagAusSlot,
  vorSchieben,
  zeileAus,
  zeilenSchluessel,
  zeitNachZug,
  zeitNeu,
  type Besetzung,
  type TafelKolonne,
  type Zeile,
  type ZugArt,
} from "@/lib/plantafel-logik";
import { kalenderwoche, lokalAus, lokalKurz, slotAus, slotsGesamt, stundenJeTag, tagKurz, type Raster } from "@/lib/woche";
import { einsatzSpeichern, monteurDeaktivieren, type Ergebnis } from "./aktionen";
import { EinsatzDialog, MonteurDialog, ueberfaellig, type BezugWahl, type DialogVorlage } from "./einsatz-dialog";
import { einsatzZurueck, gruppenReihenfolge, kolonneMonteur, zeilenReihenfolge } from "./tafel-aktionen";
import { FreigabeDialog, KolonneDialog, MonteurKolonnenDialog, RessourceDialog, WochenplanDialog, type FreigabeEintrag } from "./tafel-dialoge";

/** Breite der Beschriftung, Breite eines Slots (Stunde bzw. Tag) und Höhe einer Spur in Pixeln */
export const LABEL = 210;
export const SLOT = 26;
const SLOT_TAG = 44;
export const slotBreite = (r: Raster) => (r.tagesgenau ? SLOT_TAG : SLOT);
const SPUR = 36;

type Zug = {
  id: string;
  art: ZugArt;
  /** Zeile, in der der Balken gegriffen wurde (z. B. „m:<id>“) */
  quelle: string;
  ziel: string;
  x0: number;
  y0: number;
  s0: number;
  en0: number;
  s: number;
  en: number;
  bewegt: boolean;
  kopie: boolean;
  px: number;
  py: number;
};
type Balken = { e: TafelEinsatz; s: number; en: number; abgeschnitten: boolean; spur: number; belegt: boolean };

/** Hilfen für die Planungszeilen (Pipeline im Montageplan, „Terminierbar“ im Service-Plan) */
export type PlanungsHilfen = {
  breite: number;
  /** Breite eines Slots in Pixeln */
  slot: number;
  /** Slots je Tag */
  n: number;
  neuerEinsatz: (v: DialogVorlage) => void;
  setMeldung: (e: Ergebnis) => void;
  /** Wird gerade ein Balken über diese Planungszeile gezogen? (Schlüssel „p:<id>“) */
  zielAktiv: (schluessel: string) => boolean;
};

type Props = {
  /** Montageplan (Einsätze zu Aufträgen) oder Service-Plan (Einsätze zu Tickets); der andere Plan erscheint als „belegt“ */
  plan: Plan;
  raster: Raster;
  heute: string;
  monteure: Monteur[];
  einsaetze: TafelEinsatz[];
  abwesenheiten: TafelAbwesenheit[];
  konflikte: Konflikt[];
  fahrzeuge: TafelFahrzeug[];
  feiertage: { datum: string; name: string }[];
  kolonnen: TafelKolonne[];
  ressourcen: TafelRessource[];
  /** Reihenfolge der Gruppen: kolonne:<id>, solo, res */
  gruppen: string[];
  /** Aus „Montage planen“ bzw. „Einsatz planen“: Dialog für einen neuen Einsatz zu diesem Auftrag bzw. Ticket öffnen */
  bezugVorlage: BezugWahl | null;
  /** Planungszeilen oberhalb der Kolonnen (Pipeline bzw. „Terminierbar“); ihre Spur trägt data-ziel="p:<id>" */
  planungszeilen?: (hilfen: PlanungsHilfen) => ReactNode;
  /** Ablegen eines Eintrags aus einer Planungszeile (HTML-Ziehen, z. B. „auftrag:<id>“) auf eine Zeile */
  beiAblegen?: (daten: string, ziel: Zeile, slot: number) => Promise<Ergebnis | void>;
};

export function Plantafel(p: Props) {
  const { raster } = p;
  const SB = slotBreite(raster);
  const n = stundenJeTag(raster);
  const gesamt = slotsGesamt(raster);
  const router = useRouter();
  const pfad = usePathname();
  const eigeneArt = p.plan === "montage" ? "auftrag" : "ticket";

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
  const [ablageZiel, setAblageZiel] = useState<string | null>(null);
  const [dupModus, setDupModus] = useState(false);
  const dupRef = useRef(false);
  useEffect(() => {
    dupRef.current = dupModus;
  }, [dupModus]);
  const [zeilenZug, setZeilenZug] = useState<string | null>(null);
  const [labelZiel, setLabelZiel] = useState<string | null>(null);
  const tagStandard = raster.tage.find((t) => t >= p.heute) ?? raster.tage[0];
  const stunde = (h: number) => String(h).padStart(2, "0");
  const [dialog, setDialog] = useState<DialogVorlage | null>(() =>
    p.bezugVorlage ? { beginn: `${tagStandard}T${stunde(raster.von)}:00`, ende: `${tagStandard}T${stunde(raster.bis)}:00`, monteure: [], bezug: p.bezugVorlage } : null,
  );
  const [, starten] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  // Beim Öffnen steht der heutige Tag im Blick
  useEffect(() => {
    const i = raster.tage.indexOf(p.heute);
    if (scroller.current && i > 0) scroller.current.scrollLeft = Math.max(0, i * n * SB - SB);
  }, [raster.tage, p.heute, n, SB]);

  const name = new Map(p.monteure.map((m) => [m.id, m.name]));
  const feiertag = new Map(p.feiertage.map((f) => [f.datum, f.name]));
  const fahrzeug = new Map(p.fahrzeuge.map((f) => [f.id, f]));
  const ressourceName = new Map(p.ressourcen.map((r) => [r.id, r.name]));
  /** Konflikte eines Einsatzes in einer Zeile: eigene des Monteurs, solche des ganzen Einsatzes (Werkstatt) und Feiertage */
  const konfliktVon = (e: TafelEinsatz, monteurId: string | null): Konflikt[] => {
    const ks = p.konflikte.filter((k) => k.einsatz_id === e.id && (monteurId === null || k.mitarbeiter_id === monteurId || k.mitarbeiter_id === null));
    for (const f of p.feiertage) if (e.beginn.slice(0, 10) <= f.datum && e.ende.slice(0, 10) >= f.datum) ks.push({ einsatz_id: e.id, mitarbeiter_id: null, art: "feiertag", detail: f.name });
    return ks;
  };
  // „Weiterer Einsatz“: nicht der erste Einsatz seines Auftrags bzw. Tickets
  const ersterJeBezug = new Map<string, string>();
  for (const e of [...liste].sort((a, b) => a.beginn.localeCompare(b.beginn))) if (e.bezug && !ersterJeBezug.has(e.bezug.id)) ersterJeBezug.set(e.bezug.id, e.id);

  const dialogSchliessen = () => {
    setDialog(null);
    if (p.bezugVorlage) router.replace(`${pfad}?woche=${raster.tage[0]}${raster.tagesgenau ? "&ansicht=4" : ""}`, { scroll: false });
  };
  const ergebnisZeigen = (r: Ergebnis) => setMeldung(r.fehler ? { fehler: r.fehler } : r.warnung ? { warnung: r.warnung } : {});
  const ausfuehren = (aufgabe: () => Promise<Ergebnis>) =>
    starten(async () => {
      const r = await aufgabe();
      ergebnisZeigen(r);
    });

  // ---------- Balken ziehen (Zeit und Zeile), Enden ziehen (Dauer); Alt oder Duplizier-Modus: Kopie ----------
  const bewegen = (ev: PointerEvent) => {
    const z = zugRef.current;
    if (!z || Number.isNaN(z.x0)) return;
    const dx = ev.clientX - z.x0;
    const d = Math.round(dx / SB);
    const neu: Zug = { ...z, px: ev.clientX, py: ev.clientY, kopie: dupRef.current || ev.altKey, bewegt: z.bewegt || Math.abs(dx) > 4 || Math.abs(ev.clientY - z.y0) > 6 };
    if (z.art === "verschieben") {
      const laenge = z.en0 - z.s0;
      neu.s = Math.min(Math.max(z.s0 + d, 0), gesamt - laenge);
      neu.en = neu.s + laenge;
      const ziel = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => (el as HTMLElement).dataset?.ziel) as HTMLElement | undefined;
      if (ziel?.dataset.ziel) neu.ziel = ziel.dataset.ziel;
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
    if (!e?.bezug) return;
    if (!z.bewegt) {
      // Ein Klick auf den Balken öffnet den Termin-Dialog, ein Klick auf den Griff nicht
      if (z.art === "verschieben") setDialog({ einsatz: e });
      return;
    }
    const kopie = z.kopie || ev.altKey || dupRef.current;
    const ziel = zeileAus(z.ziel);
    const von = zeileAus(z.quelle);
    if (!ziel || !von) return;
    const vorher = listeRef.current;

    // Zurück in eine Planungszeile: Termin herausnehmen
    if (ziel.art === "p") {
      if (kopie || z.art !== "verschieben") return;
      setListe((l) => l.filter((x) => x.id !== e.id));
      setMeldung({});
      starten(async () => {
        const r = await einsatzZurueck(e.id, ziel.id, tagAusSlot(z.s, raster));
        if (r.fehler) setListe(vorher);
        ergebnisZeigen(r);
      });
      return;
    }

    const zeit = zeitNachZug(e, z.art, z.s0, z.en0, z.s, z.en, raster);
    const zeilenwechsel = z.ziel !== z.quelle;
    if (!zeit && !zeilenwechsel) return;
    let b: Besetzung = { monteure: e.monteure, fahrzeug_id: e.fahrzeug_id, ressource_id: e.ressource_id };
    if (zeilenwechsel) {
      const x = besetzungNachAblage(b, von, ziel, kopie, p.kolonnen);
      if ("fehler" in x) {
        setMeldung({ fehler: x.fehler });
        return;
      }
      b = x;
    }
    const beginn = zeit?.beginn ?? e.beginn;
    const ende = zeit?.ende ?? e.ende;
    if (!kopie) setListe((l) => l.map((x) => (x.id === e.id ? { ...x, beginn, ende, ...b } : x)));
    setMeldung({});
    const bezug = e.bezug;
    starten(async () => {
      const r = await einsatzSpeichern({
        id: kopie ? null : e.id,
        auftrag_id: bezug.art === "auftrag" ? bezug.id : null,
        ticket_id: bezug.art === "ticket" ? bezug.id : null,
        fahrzeug_id: b.fahrzeug_id,
        ressource_id: b.ressource_id,
        beginn,
        ende,
        monteure: b.monteure,
        fest: kopie ? false : null,
        hinweis: e.hinweis,
        farbe: e.farbe,
      });
      if (r.fehler) {
        setListe(vorher);
        setMeldung({ fehler: r.fehler });
      } else setMeldung(r.warnung ? { warnung: r.warnung } : kopie ? { warnung: `Weiterer Einsatz zu ${bezug.nummer} angelegt (vorgeplant).` } : {});
    });
  };

  const greifen = (ev: ReactPointerEvent, b: Balken, zeile: string, art: ZugArt) => {
    if (ev.button !== 0 || b.belegt) return;
    ev.preventDefault();
    ev.stopPropagation();
    // Einsätze, die über den sichtbaren Zeitraum hinausgehen, werden nur per Dialog geändert
    const neu: Zug = { id: b.e.id, art: b.abgeschnitten ? "verschieben" : art, quelle: zeile, ziel: zeile, x0: ev.clientX, y0: ev.clientY, s0: b.s, en0: b.en, s: b.s, en: b.en, bewegt: false, kopie: dupModus || ev.altKey, px: ev.clientX, py: ev.clientY };
    if (b.abgeschnitten) neu.x0 = Number.NaN; // Bewegung zählt nicht
    zugRef.current = neu;
    setZug(neu);
    window.addEventListener("pointermove", bewegen);
    window.addEventListener("pointerup", loslassen);
  };

  // ---------- Balken je Zeile mit Spuren für Überschneidungen ----------
  const balkenFuer = (z: Zeile): { balken: Balken[]; spuren: number } => {
    const roh: Omit<Balken, "spur">[] = [];
    for (const e of liste) {
      if (!inZeile(e, z, p.kolonnen)) continue;
      const imZug = zug && zug.id === e.id && zug.bewegt && !Number.isNaN(zug.x0);
      const s = imZug ? zug.s : slotAus(e.beginn, raster, "beginn");
      const en = imZug ? zug.en : slotAus(e.ende, raster, "ende");
      if (en <= s) continue;
      roh.push({ e, s, en, abgeschnitten: e.beginn.slice(0, 10) < raster.tage[0] || e.ende.slice(0, 10) > raster.tage.at(-1)!, belegt: e.bezug?.art !== eigeneArt });
    }
    return spurenVerteilen(roh);
  };

  const slotBei = (clientX: number, el: HTMLElement) => Math.min(Math.max(Math.floor((clientX - el.getBoundingClientRect().left) / SB), 0), gesamt - 1);
  const neuInZelle = (ev: ReactMouseEvent<HTMLDivElement>, z: Zeile) => {
    if ((ev.target as HTMLElement).closest("[data-einsatz]") || ev.timeStamp - zugEnde.current < 400) return;
    const b = besetzungNeu(z, p.kolonnen);
    if ("fehler" in b) return setMeldung({ fehler: b.fehler });
    setDialog({ ...zeitNeu(slotBei(ev.clientX, ev.currentTarget), raster), monteure: b.monteure, fahrzeug_id: b.fahrzeug_id, ressource_id: b.ressource_id });
  };

  // ---------- Zeilen und Gruppen am Griff verschieben (Monteure auch zwischen Kolonnen; Alt bzw. Duplizier-Modus: duplizieren) ----------
  const soloMonteure = p.monteure.filter((m) => !p.kolonnen.some((k) => k.mitglieder.includes(m.id)));
  const zeileAblegen = (von: string, nach: string, kopie: boolean) => {
    const [qa, ...q] = von.split("|");
    const [za, ...z] = nach.split("|");
    if (qa === "G") {
      const zg = za === "G" ? z[0] : za === "M" ? z[1] : za === "R" ? "res" : null;
      if (zg && zg !== q[0]) ausfuehren(() => gruppenReihenfolge(vorSchieben(p.gruppen, q[0], zg)));
      return;
    }
    if (qa === "R") {
      if (za === "R" && z[0] !== q[0]) ausfuehren(() => zeilenReihenfolge("ressource", vorSchieben(p.ressourcen.map((r) => r.id), q[0], z[0])));
      return;
    }
    if (qa !== "M") return;
    const [mid, quellGruppe] = q;
    const zielGruppe = za === "G" ? z[0] : za === "M" ? z[1] : null;
    const vor = za === "M" ? z[0] : null;
    if (!zielGruppe || zielGruppe === "res") return;
    const vonK = quellGruppe.startsWith("kolonne:") ? quellGruppe.slice(8) : null;
    if (zielGruppe === "solo") {
      if (!vonK) {
        if (vor && vor !== mid) ausfuehren(() => zeilenReihenfolge("mitarbeiter", vorSchieben(soloMonteure.map((m) => m.id), mid, vor)));
      } else if (!kopie) ausfuehren(() => kolonneMonteur(mid, vonK, null, false, null));
      return;
    }
    const nachK = zielGruppe.slice(8);
    if (vonK === nachK && (!vor || vor === mid)) return;
    ausfuehren(() => kolonneMonteur(mid, vonK, nachK, kopie && vonK !== nachK, vor === mid ? null : vor));
  };
  const griff = (daten: string, titel: string) => (
    <span
      draggable
      role="button"
      tabIndex={-1}
      aria-label={titel}
      title={titel}
      data-griff-zeile={daten}
      onDragStart={(ev) => {
        ev.dataTransfer.setData("text/plain", `zeile:${daten}`);
        ev.dataTransfer.effectAllowed = "copyMove";
        setZeilenZug(daten);
      }}
      onDragEnd={() => {
        setZeilenZug(null);
        setLabelZiel(null);
      }}
      className="grid size-6 shrink-0 cursor-grab place-items-center rounded-xs text-muted-2 hover:bg-canvas hover:text-ink active:cursor-grabbing"
    >
      <GripVertical className="size-3.5" />
    </span>
  );
  const labelAblage = (ziel: string) => ({
    "data-label-ziel": ziel,
    onDragOver: (ev: ReactDragEvent) => {
      if (!zeilenZug) return;
      ev.preventDefault();
      setLabelZiel(ziel);
    },
    onDragLeave: () => setLabelZiel((x) => (x === ziel ? null : x)),
    onDrop: (ev: ReactDragEvent) => {
      const d = ev.dataTransfer.getData("text/plain");
      if (!d.startsWith("zeile:")) return;
      ev.preventDefault();
      setLabelZiel(null);
      setZeilenZug(null);
      zeileAblegen(d.slice(6), ziel, ev.altKey || dupModus);
    },
  });

  // ---------- Darstellung ----------
  const konflikteZeitraum = liste
    .filter((e) => e.bezug?.art === eigeneArt)
    .flatMap((e) => (e.monteure.length ? e.monteure : [""]).flatMap((m) => konfliktVon(e, m || null).map((k) => ({ ...k, zeile: m }))))
    .filter((k, i, alle) => alle.findIndex((x) => x.einsatz_id === k.einsatz_id && x.detail === k.detail && (x.mitarbeiter_id ?? "") === (k.mitarbeiter_id ?? "")) === i);
  const breite = gesamt * SB;
  const rasterHintergrund = raster.tagesgenau
    ? `repeating-linear-gradient(to right, transparent 0 ${SB - 1}px, var(--line-soft) ${SB - 1}px ${SB}px), repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px ${5 * SB}px)`
    : `repeating-linear-gradient(to right, transparent 0 ${SB - 1}px, var(--line-soft) ${SB - 1}px ${SB}px), repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px ${n * SB}px)`;
  const tagesFlaechen = raster.tage.map((t, i) =>
    feiertag.has(t) ? (
      <div key={`f-${t}`} aria-hidden="true" data-feiertag={t} className="pointer-events-none absolute inset-y-0 bg-tone-red-bg/70" style={{ left: i * n * SB, width: n * SB }} />
    ) : t === p.heute ? (
      <div key={`h-${t}`} aria-hidden="true" className="pointer-events-none absolute inset-y-0 bg-tone-brand-bg/40" style={{ left: i * n * SB, width: n * SB }} />
    ) : null,
  );
  const vorgeplant: FreigabeEintrag[] = liste
    .filter((e) => e.bezug?.art === eigeneArt && !e.fest && e.beginn.slice(0, 10) <= raster.tage.at(-1)! && e.ende.slice(0, 10) >= raster.tage[0])
    .sort((a, b) => a.beginn.localeCompare(b.beginn))
    .map((e) => ({
      einsatz: e,
      team: [...e.monteure.map((m) => name.get(m) ?? "?"), e.ressource_id ? (ressourceName.get(e.ressource_id) ?? "") : "", e.fahrzeug_id ? (fahrzeug.get(e.fahrzeug_id)?.kennzeichen ?? "") : ""].filter(Boolean).join(", "),
      konflikte: [...new Set(konfliktVon(e, null).map((k) => (k.mitarbeiter_id ? `${name.get(k.mitarbeiter_id) ?? "Monteur"}: ${konfliktText(k)}` : konfliktText(k))))],
    }));

  /** Spur einer Zeile: Raster, Feiertage, Abwesenheiten, Balken; Klick plant ein, Ablegen aus Planungszeilen */
  const spur = (z: Zeile, extra?: { abwesend?: TafelAbwesenheit[]; monteurName?: string; leer?: boolean }) => {
    const schluessel = zeilenSchluessel(z);
    const { balken, spuren } = extra?.leer ? { balken: [], spuren: 1 } : balkenFuer(z);
    const istZiel = (zug?.bewegt && zug.ziel === schluessel && zug.ziel !== zug.quelle) || ablageZiel === schluessel;
    return (
      <div
        data-ziel={extra?.leer ? undefined : schluessel}
        data-zeile={z.art === "m" ? z.id : undefined}
        onClick={extra?.leer ? undefined : (ev) => neuInZelle(ev, z)}
        onDragOver={p.beiAblegen && !extra?.leer ? (ev) => { if (zeilenZug) return; ev.preventDefault(); setAblageZiel(schluessel); } : undefined}
        onDragLeave={p.beiAblegen ? () => setAblageZiel((x) => (x === schluessel ? null : x)) : undefined}
        onDrop={
          p.beiAblegen && !extra?.leer
            ? (ev) => {
                const daten = ev.dataTransfer.getData("text/plain");
                if (daten.startsWith("zeile:")) return;
                ev.preventDefault();
                setAblageZiel(null);
                const slot = slotBei(ev.clientX, ev.currentTarget);
                starten(async () => {
                  const r = await p.beiAblegen!(daten, z, slot);
                  if (r) ergebnisZeigen(r);
                });
              }
            : undefined
        }
        className={cn("relative", !extra?.leer && "cursor-cell", istZiel && "outline-2 -outline-offset-2 outline-dashed outline-line-strong")}
        style={{ width: breite, height: spuren * SPUR + 8, backgroundImage: rasterHintergrund }}
      >
        {tagesFlaechen}
        {extra?.abwesend?.flatMap((a) =>
          raster.tage.flatMap((t, i) =>
            t >= a.von && t <= a.bis
              ? [
                  <div
                    key={`${a.id}-${t}`}
                    data-abwesenheit={a.status}
                    title={`${extra.monteurName}: ${ABWESENHEIT_TEXT[a.art] ?? a.art}${a.status === "beantragt" ? " (beantragt)" : ""}`}
                    className={cn(
                      "pointer-events-none absolute inset-y-1 flex items-start overflow-hidden rounded-sm px-1.5 pt-0.5 text-[11px] font-medium whitespace-nowrap text-tone-gray-fg",
                      a.status === "genehmigt" ? "bg-tone-gray-bg" : "border border-dashed border-line-strong",
                    )}
                    style={{
                      left: i * n * SB + 2,
                      width: n * SB - 4,
                      backgroundImage: a.status === "beantragt" ? "repeating-linear-gradient(135deg, var(--tone-gray-bg) 0 6px, transparent 6px 12px)" : undefined,
                    }}
                  >
                    {raster.tagesgenau ? "" : ABWESENHEIT_TEXT[a.art] ?? a.art}
                    {!raster.tagesgenau && a.status === "beantragt" ? " · beantragt" : ""}
                  </div>,
                ]
              : [],
          ),
        )}
        {balken.map((b) => {
          const ks = b.belegt ? [] : konfliktVon(b.e, z.art === "m" ? z.id : null);
          const service = b.e.bezug?.art === "ticket";
          const weiterer = !b.belegt && !!b.e.bezug && ersterJeBezug.get(b.e.bezug.id) !== b.e.id;
          const schmal = (b.en - b.s) * SB < 110;
          const aktiv = zug?.id === b.e.id && zug.bewegt;
          const fz = b.e.fahrzeug_id ? fahrzeug.get(b.e.fahrzeug_id) : undefined;
          const farbe = balkenFarbe(b.e.farbe, b.e.bezug?.reklamation ? "reklamation" : service ? "service" : "auftrag");
          const titel = [
            b.belegt ? `Belegt (${service ? "Service-Plan" : "Montageplan"})` : weiterer ? "Weiterer Einsatz" : "",
            `${b.e.bezug?.nummer ?? ""} · ${b.e.bezug?.kunde ?? ""}${b.e.bezug?.titel ? ` · ${b.e.bezug.titel}` : ""}`,
            `${lokalKurz(b.e.beginn)} – ${lokalKurz(b.e.ende)}${b.e.fest ? " · freigegeben" : " · vorgeplant"}`,
            b.e.monteure.length ? `Team: ${b.e.monteure.map((x) => name.get(x) ?? "?").join(", ")}` : "",
            b.e.ressource_id ? `Ressource: ${ressourceName.get(b.e.ressource_id) ?? ""}` : "",
            fz ? `Fahrzeug: ${fz.kennzeichen}` : "",
            ...ks.map((k) => `Konflikt: ${konfliktText(k)}`),
            b.e.hinweis ?? "",
          ]
            .filter(Boolean)
            .join("\n");
          return (
            <div
              key={b.e.id}
              role="button"
              tabIndex={0}
              data-einsatz={b.e.id}
              data-belegt={b.belegt ? "1" : undefined}
              data-konflikt={ks.length ? "1" : undefined}
              data-weiterer={weiterer ? "1" : undefined}
              data-farbe={b.e.farbe ?? undefined}
              title={titel}
              aria-label={titel.replace(/\n/g, ", ")}
              onPointerDown={(ev) => greifen(ev, b, schluessel, "verschieben")}
              onDoubleClick={() => { if (b.e.bezug) router.push(bezugHref(b.e.bezug)); }}
              onKeyDown={(ev) => {
                if (ev.key !== "Enter" && ev.key !== " ") return;
                ev.preventDefault();
                if (b.belegt && b.e.bezug) router.push(bezugHref(b.e.bezug));
                else setDialog({ einsatz: b.e });
              }}
              className={cn(
                "group/balken absolute flex touch-none items-center gap-1.5 overflow-hidden rounded-md px-2 text-[12.5px] leading-tight",
                b.belegt
                  ? "cursor-default border border-line-strong text-muted"
                  : cn("shadow-card", b.abgeschnitten ? "cursor-pointer" : "cursor-grab active:cursor-grabbing", b.e.fest ? "text-ink" : "border-2 border-dashed text-ink-3"),
                ks.length > 0 && "ring-2 ring-tone-red-fg",
                aktiv && "z-10 opacity-90 shadow-hover",
              )}
              style={{
                left: b.s * SB + 1,
                width: Math.max(14, (b.en - b.s) * SB - 2),
                top: 4 + b.spur * SPUR,
                height: SPUR - 4,
                ...(b.belegt
                  ? { backgroundImage: "repeating-linear-gradient(135deg, var(--surface-sunken) 0 5px, var(--surface) 5px 10px)" }
                  : b.e.fest
                    ? { background: farbe.hintergrund, color: farbe.schrift }
                    : { background: `color-mix(in srgb, ${farbe.hintergrund} 28%, var(--surface))`, borderColor: farbe.rand }),
              }}
            >
              {!b.abgeschnitten && !b.belegt && (
                <span data-griff="anfang" aria-hidden="true" onPointerDown={(ev) => greifen(ev, b, schluessel, "anfang")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md opacity-0 group-hover/balken:bg-ink/20 group-hover/balken:opacity-100" />
              )}
              {ks.length > 0 ? <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> : weiterer ? <Copy className="size-3.5 shrink-0" aria-hidden="true" /> : null}
              <span className="min-w-0 truncate">
                {b.belegt && <span className="mr-1 text-[11px]">belegt ·</span>}
                {!raster.tagesgenau && !schmal && !b.belegt && b.s > 0 && <span className="mr-1.5 font-mono text-[11px] opacity-80">{b.e.beginn.slice(11, 16)}</span>}
                <b className="font-semibold">{b.e.bezug?.kunde || b.e.bezug?.nummer}</b>
                {!schmal && <span className="ml-1.5 font-mono text-[11px] opacity-75">{b.e.bezug?.nummer}</span>}
              </span>
              {!b.abgeschnitten && !b.belegt && (
                <span data-griff="ende" aria-hidden="true" onPointerDown={(ev) => greifen(ev, b, schluessel, "ende")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md opacity-0 group-hover/balken:bg-ink/20 group-hover/balken:opacity-100" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  /** Beschriftung links: fest beim waagerechten Scrollen, markierbar, Ziel für das Verschieben von Zeilen */
  const label = (inhalt: ReactNode, opt: { ziel?: string; gruppe?: boolean; schluessel: string }) => (
    <div
      {...(opt.ziel ? labelAblage(opt.ziel) : {})}
      className={cn(
        "sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-line px-2",
        markiert === opt.schluessel ? "bg-tone-brand-bg shadow-[inset_4px_0_0_var(--accent)]" : opt.gruppe ? "bg-surface-muted" : "bg-surface group-hover/zeile:bg-surface-muted",
        opt.ziel && labelZiel === opt.ziel && "outline-2 -outline-offset-2 outline-dashed outline-line-strong",
      )}
      style={{ width: LABEL, minHeight: 44 }}
    >
      {inhalt}
    </div>
  );
  const markierKnopf = (schluessel: string, inhalt: ReactNode) => (
    <button type="button" onClick={() => setMarkiert((x) => (x === schluessel ? null : schluessel))} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" aria-pressed={markiert === schluessel}>
      {inhalt}
    </button>
  );
  const zeilenKlasse = (schluessel: string, gruppe = false) =>
    cn("group/zeile flex border-b border-line-soft", markiert === schluessel ? "bg-tone-brand-bg/50" : gruppe ? "bg-surface-muted/60" : "hover:bg-surface-muted");
  const plusZeile = (inhalt: ReactNode) => (
    <div className="flex border-b border-line-soft">
      <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-surface px-2.5 py-1.5" style={{ width: LABEL }}>
        {inhalt}
      </div>
      <div style={{ width: breite }} />
    </div>
  );
  const plusKnopf = "inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs text-muted hover:border-ink hover:text-ink";
  /** Aktionen einer Zeile erscheinen beim Überfahren über der Beschriftung und nehmen sonst keinen Platz weg */
  const aktionenKlasse =
    "pointer-events-none absolute top-1/2 right-1 flex -translate-y-1/2 rounded-sm bg-surface-muted opacity-0 shadow-card transition group-hover/zeile:pointer-events-auto group-hover/zeile:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100";

  const monteurZeile = (m: Monteur, gruppe: string) => {
    const schluessel = `m:${m.id}|${gruppe}`;
    const kolonnenZahl = p.kolonnen.filter((k) => k.mitglieder.includes(m.id)).length;
    const kol = gruppe.startsWith("kolonne:") ? gruppe.slice(8) : null;
    return (
      <div key={schluessel} className={zeilenKlasse(schluessel)} data-monteur-zeile={m.id} data-gruppe={gruppe}>
        {label(
          <>
            {griff(`M|${m.id}|${gruppe}`, `${m.name} verschieben (Alt: duplizieren)`)}
            {markierKnopf(
              schluessel,
              <>
                <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-surface-sunken px-1.5 text-[11px] font-semibold">{m.kuerzel}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  {kolonnenZahl > 1 && <span className="block text-[11px] text-accent-text">in {kolonnenZahl} Kolonnen</span>}
                </span>
              </>,
            )}
            <span className={aktionenKlasse}>
              <MonteurKolonnenDialog
                monteur={m}
                gruppe={kol}
                kolonnen={p.kolonnen}
                ausloeser={
                  <button type="button" aria-label={`${m.name}: Kolonne ändern oder duplizieren`} className="grid size-7 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-ink">
                    <MoreHorizontal className="size-4" />
                  </button>
                }
              />
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
                ausfuehren={() => ausfuehren(() => monteurDeaktivieren(m.id))}
              >
                <button type="button" aria-label={`${m.name} deaktivieren`} className="grid size-7 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-tone-red-fg">
                  <UserMinus className="size-3.5" />
                </button>
              </Bestaetigen>
            </span>
          </>,
          { ziel: `M|${m.id}|${gruppe}`, schluessel },
        )}
        {spur({ art: "m", id: m.id }, { abwesend: p.abwesenheiten.filter((a) => a.mitarbeiter_id === m.id), monteurName: m.name })}
      </div>
    );
  };

  const gruppenZeilen = p.gruppen.map((g) => {
    if (g === "solo") {
      return (
        <div key="solo" data-gruppe-block="solo">
          <div className={zeilenKlasse("g:solo", true)} data-gruppen-zeile="solo">
            {label(
              <>
                {griff("G|solo", "Gruppe verschieben")}
                {markierKnopf(
                  "g:solo",
                  <span className="min-w-0">
                    <b className="block text-sm font-semibold">Ohne Kolonne</b>
                    <span className="block text-[11px] text-muted-2">Monteure ohne festes Team · {soloMonteure.length}</span>
                  </span>,
                )}
              </>,
              { ziel: "G|solo", gruppe: true, schluessel: "g:solo" },
            )}
            {spur({ art: "m", id: "" }, { leer: true })}
          </div>
          {soloMonteure.map((m) => monteurZeile(m, "solo"))}
          {plusZeile(
            <MonteurDialog
              ausloeser={
                <button type="button" className={plusKnopf}>
                  <Plus className="size-3.5" strokeWidth={2.2} />
                  Monteur hinzufügen
                </button>
              }
            />,
          )}
        </div>
      );
    }
    if (g === "res") {
      return (
        <div key="res" data-gruppe-block="res">
          <div className={zeilenKlasse("g:res", true)} data-gruppen-zeile="res">
            {label(
              <>
                {griff("G|res", "Gruppe verschieben")}
                {markierKnopf(
                  "g:res",
                  <span className="min-w-0">
                    <b className="block text-sm font-semibold">Weitere Ressourcen</b>
                    <span className="block text-[11px] text-muted-2">z. B. Selbstabholer, Lager, Subunternehmer</span>
                  </span>,
                )}
              </>,
              { ziel: "G|res", gruppe: true, schluessel: "g:res" },
            )}
            {spur({ art: "r", id: "" }, { leer: true })}
          </div>
          {p.ressourcen.map((r) => {
            const schluessel = `r:${r.id}`;
            return (
              <div key={r.id} className={zeilenKlasse(schluessel)} data-ressource-zeile={r.id}>
                {label(
                  <>
                    {griff(`R|${r.id}`, `${r.name} verschieben`)}
                    {markierKnopf(
                      schluessel,
                      <>
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-sunken"><Store className="size-3.5" /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{r.name}</span>
                          {r.notiz && <span className="block truncate text-[11px] text-muted-2">{r.notiz}</span>}
                        </span>
                      </>,
                    )}
                    <span className={aktionenKlasse}>
                      <RessourceDialog
                        ressource={r}
                        ausloeser={
                          <button type="button" aria-label={`Zeile ${r.name} umbenennen oder löschen`} className="grid size-7 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-ink">
                            <MoreHorizontal className="size-4" />
                          </button>
                        }
                      />
                    </span>
                  </>,
                  { ziel: `R|${r.id}`, schluessel },
                )}
                {spur({ art: "r", id: r.id })}
              </div>
            );
          })}
          {plusZeile(
            <RessourceDialog
              ausloeser={
                <button type="button" className={plusKnopf}>
                  <Plus className="size-3.5" strokeWidth={2.2} />
                  Zeile hinzufügen
                </button>
              }
            />,
          )}
        </div>
      );
    }
    const k = p.kolonnen.find((x) => `kolonne:${x.id}` === g);
    if (!k) return null;
    const fz = k.stammfahrzeug_id ? fahrzeug.get(k.stammfahrzeug_id) : undefined;
    const pruefen = fz ? ueberfaellig(fz, p.heute) : [];
    const schluessel = `k:${k.id}`;
    const mitglieder = k.mitglieder.map((id) => p.monteure.find((m) => m.id === id)).filter((m): m is Monteur => !!m);
    return (
      <div key={g} data-gruppe-block={g}>
        <div className={zeilenKlasse(schluessel, true)} data-kolonne-zeile={k.id}>
          {label(
            <>
              {griff(`G|${g}`, `${k.name} verschieben`)}
              {markierKnopf(
                schluessel,
                <>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-sunken"><Users className="size-3.5" /></span>
                  <span className="min-w-0">
                    <b className="block truncate text-sm font-semibold">{k.name}</b>
                    <span className="block truncate text-[11px] text-muted-2">
                      {fz?.kennzeichen ?? "ohne Stammfahrzeug"}
                      {pruefen.length > 0 && <span className="text-tone-red-fg" title={`${pruefen.join(", ")} überfällig`}> · Fahrzeug prüfen</span>} · {mitglieder.length} {mitglieder.length === 1 ? "Monteur" : "Monteure"}
                    </span>
                  </span>
                </>,
              )}
              <span className={aktionenKlasse}>
                <KolonneDialog
                  kolonne={k}
                  monteure={p.monteure}
                  fahrzeuge={p.fahrzeuge}
                  ausloeser={
                    <button type="button" aria-label={`Kolonne ${k.name} bearbeiten`} className="grid size-7 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-ink">
                      <MoreHorizontal className="size-4" />
                    </button>
                  }
                />
              </span>
            </>,
            { ziel: `G|${g}`, gruppe: true, schluessel },
          )}
          {spur({ art: "k", id: k.id })}
        </div>
        {mitglieder.map((m) => monteurZeile(m, g))}
        {!mitglieder.length && plusZeile(<span {...labelAblage(`G|${g}`)} className="text-xs text-muted-2">Monteur hierher ziehen</span>)}
      </div>
    );
  });

  const ansichtText = raster.tagesgenau ? "tagesgenau" : `${raster.von}–${raster.bis} Uhr`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          aria-pressed={dupModus}
          data-dup-modus={dupModus ? "an" : "aus"}
          onClick={() => setDupModus((d) => !d)}
          className={dupModus ? "border-accent bg-accent text-accent-ink hover:bg-accent-hover" : undefined}
          title={`Im Duplizier-Modus erzeugt Ziehen eines Balkens einen weiteren Einsatz zum selben ${p.plan === "montage" ? "Auftrag" : "Ticket"}. Alternativ beim Ziehen die Alt-Taste halten.`}
        >
          <Copy className="size-[15px]" />
          {dupModus ? "Duplizieren an" : "Duplizieren"}
        </Button>
        <WochenplanDialog
          montag={raster.tage[0]}
          monteure={p.monteure}
          kolonnen={p.kolonnen}
          ausloeser={
            <Button size="sm">
              <Printer className="size-[15px]" />
              Wochenplan
            </Button>
          }
        />
        <FreigabeDialog
          eintraege={vorgeplant}
          beiErgebnis={ergebnisZeigen}
          ausloeser={
            <Button size="sm" variant={vorgeplant.length ? "primary" : "secondary"} disabled={!vorgeplant.length} data-freigeben={vorgeplant.length}>
              <Check className="size-[15px]" />
              Freigeben{vorgeplant.length ? ` (${vorgeplant.length})` : ""}
            </Button>
          }
        />
      </div>

      {meldung.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{meldung.fehler}</p>}
      {meldung.warnung && (
        <p role="alert" className="flex items-center gap-2 rounded-md bg-tone-amber-bg px-3.5 py-2.5 text-sm text-tone-amber-fg">
          <AlertTriangle className="size-4 shrink-0" />
          {meldung.warnung}
        </p>
      )}
      {konflikteZeitraum.length > 0 && (
        <details className="rounded-md border border-tone-red-bg bg-surface px-4 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium text-tone-red-fg">
            {konflikteZeitraum.length === 1 ? "1 Konflikt" : `${konflikteZeitraum.length} Konflikte`} {raster.tagesgenau ? "in diesen vier Wochen" : "in dieser Woche"}
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-ink-3">
            {konflikteZeitraum.map((k) => {
              const e = liste.find((x) => x.id === k.einsatz_id);
              return (
                <li key={`${k.einsatz_id}|${k.mitarbeiter_id}|${k.detail}`}>
                  {k.mitarbeiter_id && <><b className="font-medium">{name.get(k.mitarbeiter_id) ?? "Monteur"}</b> · </>}
                  {e?.bezug ? `${e.bezug.nummer} ${e.bezug.kunde}` : "Einsatz"} · {konfliktText(k)}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <div ref={scroller} className="max-h-[calc(100vh-220px)] overflow-scroll rounded-lg border border-line-soft bg-surface select-none" data-tafel={p.plan} data-ansicht={raster.tagesgenau ? "4" : "1"}>
        <div style={{ width: LABEL + breite }}>
          {/* Kopf: Tage und Stunden bzw. Tage mit Kalenderwoche */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
            <div className="sticky left-0 z-30 flex shrink-0 flex-col justify-end border-r border-line bg-surface px-3 pb-1.5" style={{ width: LABEL }}>
              <b className="text-xs font-semibold">KW {kalenderwoche(raster.tage[0])}{raster.tagesgenau ? `–${kalenderwoche(raster.tage.at(-1)!)}` : ""}</b>
              <span className="text-[11px] text-muted-2">{ansichtText}</span>
            </div>
            {raster.tagesgenau ? (
              <div className="flex">
                {raster.tage.map((t, i) => (
                  <div
                    key={t}
                    title={feiertag.get(t)}
                    className={cn(
                      "flex flex-col items-center justify-end border-l py-1 text-[11px] leading-tight",
                      i % 5 === 0 ? "border-line" : "border-line-soft",
                      feiertag.has(t) ? "bg-tone-red-bg text-tone-red-fg" : t === p.heute ? "bg-tone-brand-bg text-tone-brand-fg" : "text-muted",
                    )}
                    style={{ width: SB }}
                  >
                    {i % 5 === 0 && <span className="text-[10px] text-muted-2">KW {kalenderwoche(t)}</span>}
                    <b className="font-semibold">{tagKurz(t).slice(0, 2)}</b>
                    <span className="tabular">{t.slice(8, 10)}.{t.slice(5, 7)}.</span>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <div className="flex">
                  {raster.tage.map((t) => (
                    <div
                      key={t}
                      title={feiertag.get(t)}
                      className={cn(
                        "truncate border-l border-line px-2 py-1.5 text-sm font-semibold",
                        feiertag.has(t) ? "bg-tone-red-bg text-tone-red-fg" : t === p.heute && "bg-tone-brand-bg text-tone-brand-fg",
                      )}
                      style={{ width: n * SB }}
                    >
                      {tagKurz(t)}
                      {feiertag.has(t) ? <span className="ml-1.5 text-xs font-normal">{feiertag.get(t)}</span> : t === p.heute && <span className="ml-1.5 text-xs font-normal">heute</span>}
                    </div>
                  ))}
                </div>
                <div className="flex">
                  {raster.tage.flatMap((t) =>
                    Array.from({ length: n }, (_, i) => (
                      <div key={`${t}-${i}`} className={cn("py-0.5 text-center text-[10.5px] text-muted-2 tabular", i === 0 ? "border-l border-line" : "border-l border-line-soft")} style={{ width: SB }}>
                        {raster.von + i}
                      </div>
                    )),
                  )}
                </div>
              </div>
            )}
          </div>

          {p.planungszeilen?.({ breite, slot: SB, n, neuerEinsatz: setDialog, setMeldung, zielAktiv: (s) => !!zug?.bewegt && zug.ziel === s })}

          {gruppenZeilen}
          {plusZeile(
            <KolonneDialog
              monteure={p.monteure}
              fahrzeuge={p.fahrzeuge}
              ausloeser={
                <button type="button" className={plusKnopf}>
                  <Plus className="size-3.5" strokeWidth={2.2} />
                  Kolonne hinzufügen
                </button>
              }
            />,
          )}
        </div>
      </div>

      {zug?.bewegt && !Number.isNaN(zug.x0) && (
        <div role="status" className="pointer-events-none fixed z-[120] rounded-sm bg-ink px-2 py-1 text-xs text-surface shadow-pop" style={{ left: zug.px + 14, top: zug.py + 14 }}>
          {zug.kopie && zug.art === "verschieben" ? "Kopie · " : ""}
          {zug.ziel.startsWith("p:")
            ? "Termin herausnehmen"
            : raster.tagesgenau
              ? `${tagKurz(raster.tage[Math.min(zug.s, raster.tage.length - 1)])} – ${tagKurz(raster.tage[Math.max(zug.en - 1, 0)])}`
              : `${lokalKurz(lokalAus(zug.s, raster, "beginn"))} – ${lokalKurz(lokalAus(zug.en, raster, "ende"))}`}
          {zug.ziel !== zug.quelle && !zug.ziel.startsWith("p:") && ` · ${zielName(zug.ziel)}`}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <ul aria-label="Legende" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs bg-(--plan-1)" />Auftrag</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs bg-(--plan-2)" />Service</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs bg-(--plan-5)" />Reklamation</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs border border-line-strong" style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--surface-sunken) 0 3px, var(--surface) 3px 6px)" }} />Belegt (anderer Plan)</li>
          <li className="flex items-center gap-1.5"><span className={cn("h-3 w-5 rounded-xs border-2 border-dashed", p.plan === "montage" ? "border-(--plan-1)" : "border-(--plan-2)")} />Vorgeplant</li>
          <li className="flex items-center gap-1.5"><Copy className="size-3" />Weiterer Einsatz</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs border border-dashed border-line-strong bg-surface" />{p.plan === "montage" ? "Pipeline" : "Terminierbar"}</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs border border-dashed border-tone-red-fg bg-tone-red-bg" />Datum überschritten</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs bg-tone-gray-bg" />Abwesend</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs border border-dashed border-line-strong" style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--tone-gray-bg) 0 3px, transparent 3px 6px)" }} />Beantragt</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs bg-tone-red-bg" />Feiertag</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-xs ring-2 ring-tone-red-fg" />Konflikt</li>
        </ul>
        <Button size="sm" onClick={() => setDialog({ beginn: `${tagStandard}T${stunde(raster.von)}:00`, ende: `${tagStandard}T${stunde(raster.bis)}:00`, monteure: [] })}>
          <Plus className="size-[15px]" strokeWidth={2.2} />
          Einsatz
        </Button>
      </div>
      <p className="text-xs text-muted-2">
        {raster.tagesgenau ? "Ziehen verschiebt um ganze Tage, die Uhrzeiten bleiben. " : "Ziehen auf eine Stunde setzt die Beginnzeit, die Dauer bleibt. "}
        Balken an den Enden ziehen ändert die Dauer. Auf eine Kolonne ziehen bucht alle Monteure und das Stammfahrzeug. Mit „Duplizieren“ oder gedrückter Alt-Taste entsteht beim Ziehen ein weiterer Einsatz.
        Einen Balken zurück nach oben ziehen nimmt den Termin heraus. Zeilen am Griff senkrecht verschieben, Monteure auch zwischen Kolonnen. Klick öffnet den Termin, Doppelklick {p.plan === "montage" ? "den Auftrag" : "das Ticket"}.
      </p>

      {dialog && (
        <EinsatzDialog
          plan={p.plan}
          vorlage={dialog}
          monteure={p.monteure}
          fahrzeuge={p.fahrzeuge}
          kolonnen={p.kolonnen}
          ressourcen={p.ressourcen}
          feiertage={p.feiertage.map((f) => f.datum)}
          heute={p.heute}
          beiSchliessen={dialogSchliessen}
          beiErgebnis={(r) => setMeldung(r.warnung ? { warnung: r.warnung } : {})}
        />
      )}
    </div>
  );

  function zielName(schluessel: string) {
    const z = zeileAus(schluessel);
    if (!z) return "";
    if (z.art === "m") return name.get(z.id) ?? "";
    if (z.art === "k") return p.kolonnen.find((k) => k.id === z.id)?.name ?? "";
    if (z.art === "r") return ressourceName.get(z.id) ?? "";
    return "";
  }
}
