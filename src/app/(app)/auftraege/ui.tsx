"use client";

import { ChatZahl } from "../chat/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Pencil, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Formular } from "@/components/ui/formular";
import type { Auftrag } from "@/lib/auftraege";
import { cn } from "@/lib/cn";
import {
  AUFTRAG_PHASE_TEXT,
  AUFTRAG_PHASE_TON,
  AUFTRAG_PHASEN,
  MONTAGESTATUS,
  MONTAGESTATUS_TEXT,
  phasenLeiste,
  type AuftragPhase,
} from "@/lib/status";
import { auftragLoeschen, auftragSpeichern, lieferungSpeichern, phaseSetzen, pruefhinweisEntfernen, type Ergebnis } from "./aktionen";

export function Meldung({ e }: { e: Ergebnis }) {
  if (!e.fehler && !e.hinweis) return null;
  return (
    <p role={e.fehler ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-sm", e.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}>
      {e.fehler ?? e.hinweis}
    </p>
  );
}

export type PipelineKarte = {
  id: string;
  nummer: string;
  phase: AuftragPhase;
  kunde: string;
  titel: string;
  produkte: string[];
  stand: { text: string; ton: "blue" | "brand" | "green" | "amber" | "gray" };
  warnung: string | null;
  zustaendig: string | null;
  bestellstatus: string | null;
  /** ungelesene Chat-Nachrichten */
  chat: number;
};

/** Pipeline (Kanban): Karten in eine andere Spalte ziehen ändert die Phase. */
export function AuftraegePipeline({ karten, phasen }: { karten: PipelineKarte[]; phasen: readonly AuftragPhase[] }) {
  const [liste, setListe] = useState(karten);
  const [ziel, setZiel] = useState<AuftragPhase | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [, starten] = useTransition();

  const ablegen = (id: string, phase: AuftragPhase) => {
    const vorher = liste;
    const karte = liste.find((k) => k.id === id);
    if (!karte || karte.phase === phase) return;
    setListe((l) => l.map((k) => (k.id === id ? { ...k, phase } : k)));
    starten(async () => {
      const r = await phaseSetzen(id, phase);
      if (r.fehler) {
        setListe(vorher);
        setFehler(r.fehler);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {fehler && <Meldung e={{ fehler }} />}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {phasen.map((p) => {
          const spalte = liste.filter((k) => k.phase === p);
          return (
            <section
              key={p}
              aria-label={AUFTRAG_PHASE_TEXT[p]}
              data-phase={p}
              onDragOver={(e) => { e.preventDefault(); setZiel(p); }}
              onDragLeave={() => setZiel((z) => (z === p ? null : z))}
              onDrop={(e) => { e.preventDefault(); setZiel(null); ablegen(e.dataTransfer.getData("text/plain"), p); }}
              className={cn("flex min-h-[240px] min-w-[200px] flex-1 flex-col gap-2.5 rounded-lg bg-surface-sunken p-2.5", ziel === p && "outline-2 outline-dashed outline-line-strong")}
            >
              <h2 className="flex items-center justify-between px-1.5 pt-1 text-sm font-semibold">
                <Badge tone={AUFTRAG_PHASE_TON[p]} dot>{AUFTRAG_PHASE_TEXT[p]}</Badge>
                <span className="text-xs text-muted-2 tabular">{spalte.length}</span>
              </h2>
              {spalte.map((k) => (
                <Link
                  key={k.id}
                  href={`/auftraege/${k.id}`}
                  draggable
                  data-auftrag={k.id}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", k.id); e.dataTransfer.effectAllowed = "move"; }}
                  className="flex flex-col gap-2 rounded-[15px] border border-transparent bg-surface p-3.5 shadow-card transition hover:border-line-strong hover:shadow-hover"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{k.nummer}</span>
                    <span className="flex items-center gap-1.5">
                      {k.zustaendig && <span className="text-xs text-muted-2">{k.zustaendig}</span>}
                      <ChatZahl n={k.chat} />
                    </span>
                  </span>
                  <span className="text-[15px] leading-snug font-medium">{k.kunde}</span>
                  {k.titel && <span className="-mt-1 text-[13px] text-muted">{k.titel}</span>}
                  {k.produkte.length > 0 && <span className="flex flex-wrap gap-1">{k.produkte.map((x) => <Badge key={x} tone="gray">{x}</Badge>)}</span>}
                  <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
                    <StatusDot tone={k.stand.ton} className="size-1.5" />
                    {k.stand.text}
                  </span>
                  {k.bestellstatus && <span className="text-xs text-muted-2">Bestellung: {k.bestellstatus}</span>}
                  {k.warnung && <span className="rounded-xs bg-tone-red-bg px-2 py-1 text-[12.5px] text-tone-red-fg">{k.warnung}</span>}
                </Link>
              ))}
              {!spalte.length && <p className="px-1.5 text-xs text-muted-2">Karten hierher ziehen</p>}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted-2">Karten per Drag & Drop in eine andere Spalte ziehen, um die Phase zu ändern. Ein Klick öffnet den Auftrag.</p>
    </div>
  );
}

/** Phase per Auswahlfeld (Kopf der Auftragsseite) */
export function PhaseAuswahl({ id, phase }: { id: string; phase: AuftragPhase }) {
  const [fehler, setFehler] = useState<string>();
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Select value={phase} disabled={laeuft} onValueChange={(v) => starten(async () => setFehler((await phaseSetzen(id, v)).fehler))}>
        <SelectTrigger aria-label="Phase ändern" className="w-[190px]"><SelectValue /></SelectTrigger>
        <SelectContent>{AUFTRAG_PHASEN.map((p) => <SelectItem key={p} value={p}>{AUFTRAG_PHASE_TEXT[p]}</SelectItem>)}</SelectContent>
      </Select>
      {fehler && <div className="basis-full"><Meldung e={{ fehler }} /></div>}
    </>
  );
}

/** Phasenleiste; ein Klick auf eine Phase setzt sie */
export function Phasenleiste({ id, phase }: { id: string; phase: AuftragPhase }) {
  const [laeuft, starten] = useTransition();
  const [fehler, setFehler] = useState<string>();
  const schritte = phasenLeiste(phase);
  const jetzt = schritte.indexOf(phase);
  const fertig = phase === "abgeschlossen";
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Phase" className="flex overflow-x-auto rounded-lg border border-line-soft bg-surface px-3 py-2.5">
        {schritte.map((s, i) => {
          const erledigt = fertig || i < jetzt;
          const aktuell = !fertig && i === jetzt;
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                disabled={laeuft || s === phase}
                aria-current={s === phase ? "step" : undefined}
                onClick={() => starten(async () => setFehler((await phaseSetzen(id, s)).fehler))}
                className={cn("flex shrink-0 items-center gap-2 rounded-full px-2 py-1 text-sm whitespace-nowrap", s !== phase && "hover:bg-surface-sunken")}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs font-semibold",
                    erledigt ? "bg-accent text-accent-ink" : aktuell ? (s === "reklamation" ? "bg-tone-red-fg text-surface" : "bg-ink text-surface") : "bg-surface-sunken text-muted-2",
                  )}
                >
                  {erledigt ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn(aktuell ? "font-semibold" : erledigt ? "text-ink-3" : "text-muted")}>{AUFTRAG_PHASE_TEXT[s]}</span>
              </button>
              {i < schritte.length - 1 && <span aria-hidden="true" className={cn("mx-2 h-px min-w-4 flex-1", erledigt ? "bg-accent" : "bg-line")} />}
            </li>
          );
        })}
      </ol>
      {fehler && <Meldung e={{ fehler }} />}
    </div>
  );
}

/** Auftrag bearbeiten (Stammdaten) */
export function AuftragDialog(props: { auftrag: Auftrag; benutzer: { id: string; name: string }[]; herkunftListe: string[]; produkteListe: string[] }) {
  return (
    <FormularDialog
      titel="Auftrag bearbeiten"
      breit
      ausloeser={
        <Button>
          <Pencil className="size-[15px]" />
          Bearbeiten
        </Button>
      }
    >
      {(s) => <AuftragFormular {...props} s={s} />}
    </FormularDialog>
  );
}

function AuftragFormular({ auftrag: a, benutzer, herkunftListe, produkteListe, s }: { auftrag: Auftrag; benutzer: { id: string; name: string }[]; herkunftListe: string[]; produkteListe: string[]; s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (vorher, fd) => {
    const r = await auftragSpeichern(vorher, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const f = z.felder ?? {};
  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={a.id} />
      {z.fehler && <Meldung e={{ fehler: z.fehler }} />}
      <Field label="Titel *" error={f.titel}>{(p) => <Input {...p} name="titel" defaultValue={a.titel} />}</Field>
      <Field label="Objekt / Lieferadresse">{(p) => <Input {...p} name="objekt" defaultValue={a.objekt ?? ""} />}</Field>
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <Field label="Montagestatus" error={f.montagestatus}>
          {(p) => (
            <Select name="montagestatus" defaultValue={a.montagestatus} onValueChange={s.aenderung}>
              <SelectTrigger id={p.id}><SelectValue /></SelectTrigger>
              <SelectContent>{MONTAGESTATUS.map((m) => <SelectItem key={m} value={m}>{MONTAGESTATUS_TEXT[m]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Herkunft" error={f.herkunft}>
          {(p) => (
            <Select name="herkunft" defaultValue={a.herkunft ?? undefined} onValueChange={s.aenderung}>
              <SelectTrigger id={p.id}><SelectValue placeholder="Bitte wählen …" /></SelectTrigger>
              <SelectContent>{herkunftListe.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Zuständig" error={f.zustaendig_id}>
          {(p) => (
            <Select name="zustaendig_id" defaultValue={a.zustaendig_id ?? undefined} onValueChange={s.aenderung}>
              <SelectTrigger id={p.id}><SelectValue placeholder="Niemand" /></SelectTrigger>
              <SelectContent>{benutzer.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-ink-3">Produkte</legend>
        <div className="flex flex-wrap gap-2">
          {produkteListe.map((p) => (
            <label key={p} className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface-sunken">
              <input type="checkbox" name="produkte" value={p} defaultChecked={a.produkte.includes(p)} className="size-4 [accent-color:var(--ink)]" />
              {p}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Bemerkung">{(p) => <Textarea {...p} name="bemerkung" defaultValue={a.bemerkung ?? ""} />}</Field>
      <div className="flex justify-end gap-2.5 pt-1">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : "Speichern"}</Button>
      </div>
    </Formular>
  );
}

/** Liefertermin, „Noch nicht bestellt“ und „Warten auf Kunde“ direkt in der Karte „Bestellung & Lieferung“ */
export function LieferungFormular({ auftrag: a }: { auftrag: Pick<Auftrag, "id" | "liefertermin" | "noch_nicht_bestellt" | "warten_auf_kunde"> }) {
  const [geaendert, setGeaendert] = useState(false);
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await lieferungSpeichern(v, fd);
    if (r.ok) setGeaendert(false);
    return r;
  }, {});
  return (
    <Formular aktion={aktion} onInput={() => setGeaendert(true)} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={a.id} />
      <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 max-md:grid-cols-1">
        <Field label="Liefertermin" error={z.felder?.liefertermin}>{(p) => <Input {...p} name="liefertermin" type="date" defaultValue={a.liefertermin ?? ""} />}</Field>
        <Field label="Noch nicht bestellt" hint="Leer = alles bestellt">{(p) => <Input {...p} name="noch_nicht_bestellt" defaultValue={a.noch_nicht_bestellt ?? ""} />}</Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="warten_auf_kunde" defaultChecked={a.warten_auf_kunde} className="size-4 [accent-color:var(--ink)]" />
          Warten auf Kunde
        </label>
        <span className="flex items-center gap-3">
          {!geaendert && z.hinweis && <span role="status" className="text-sm text-tone-green-fg">{z.hinweis}</span>}
          <Button type="submit" size="sm" variant={geaendert ? "primary" : "secondary"} disabled={laeuft || !geaendert}>Speichern</Button>
        </span>
      </div>
      {z.fehler && <Meldung e={{ fehler: z.fehler }} />}
    </Formular>
  );
}

export function PruefhinweisEntfernen({ id }: { id: string }) {
  const [laeuft, starten] = useTransition();
  const [fehler, setFehler] = useState<string>();
  return (
    <>
      <Button size="sm" disabled={laeuft} onClick={() => starten(async () => setFehler((await pruefhinweisEntfernen(id)).fehler))}>Geprüft, Hinweis entfernen</Button>
      {fehler && <Meldung e={{ fehler }} />}
    </>
  );
}

export function AuftragLoeschen({ id, nummer }: { id: string; nummer: string }) {
  const [ergebnis, setErgebnis] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Bestaetigen
        titel="Auftrag löschen?"
        text={
          <>
            Auftrag <b className="font-mono text-ink">{nummer}</b> wird als gelöscht markiert und verschwindet aus allen Listen. Die Daten bleiben im
            Protokoll erhalten. Aufträge mit Belegen, Einsätzen, Bestellungen, Zeitbuchungen, Service-Tickets oder Nachträgen lassen sich nicht löschen.
          </>
        }
        knopf="Löschen"
        gefahr
        ausfuehren={() => starten(async () => setErgebnis((await auftragLoeschen(id)) ?? {}))}
      >
        <Button variant="danger" disabled={laeuft}>
          <Trash2 className="size-[15px]" />
          Löschen
        </Button>
      </Bestaetigen>
      {ergebnis.fehler && <div className="basis-full"><Meldung e={ergebnis} /></div>}
    </>
  );
}

/** Hinweis „Ware vollständig eingetroffen“: Phase von Hand auf Montage setzen (nie automatisch) */
export function PhaseMontageSetzen({ id }: { id: string }) {
  const [laeuft, starten] = useTransition();
  const [fehler, setFehler] = useState<string>();
  return (
    <>
      <Button size="sm" variant="primary" disabled={laeuft} onClick={() => starten(async () => setFehler((await phaseSetzen(id, "montage")).fehler))}>
        Phase auf Montage setzen
      </Button>
      {fehler && <div className="basis-full"><Meldung e={{ fehler }} /></div>}
    </>
  );
}

/** Listenzeile: Klick wählt (Vorschau rechts, ersetzt den Verlaufseintrag), Doppelklick oder Enter öffnet */
export function AuswahlZeile({ id, href, gewaehlt, children }: { id: string; href: string; gewaehlt: boolean; children: ReactNode }) {
  const router = useRouter();
  const pfad = usePathname();
  const params = useSearchParams();
  const waehle = () => {
    const neu = new URLSearchParams(params);
    neu.set("id", id);
    router.replace(`${pfad}?${neu}`, { scroll: false });
  };
  return (
    <tr
      tabIndex={0}
      aria-selected={gewaehlt}
      data-auswahl-zeile={id}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, label")) return;
        waehle();
      }}
      onDoubleClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
      className={cn("cursor-pointer outline-none hover:bg-surface-muted focus-visible:bg-surface-muted", gewaehlt && "bg-tone-brand-bg hover:bg-tone-brand-bg")}
    >
      {children}
    </tr>
  );
}
