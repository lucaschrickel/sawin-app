"use client";

import Link from "next/link";
import { Plus, Search, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AUFGABE_STATUS,
  AUFGABE_STATUS_TEXT,
  AUFGABE_STATUS_TON,
  BEZUG_ART_TEXT,
  PRIORITAET,
  PRIORITAET_TEXT,
  bezugHref,
  type Bezug,
} from "@/lib/aufgaben-status";
import type { Aufgabe } from "@/lib/aufgaben";
import { cn } from "@/lib/cn";
import { tag } from "@/lib/zeit";
import { aufgabeLoeschen, aufgabeSpeichern, bezugSuchen, erledigtSetzen, type Ergebnis } from "./aktionen";

export type AufgabenKontext = { benutzer: { id: string; name: string }[]; ichId: string; heute: string };

// ---------------------------------------------------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------------------------------------------------
type DialogProps = AufgabenKontext & { aufgabe?: Aufgabe; bezug?: Bezug; ausloeser: ReactNode };

export function AufgabeDialog(props: DialogProps) {
  return (
    <FormularDialog titel={props.aufgabe ? "Aufgabe bearbeiten" : "Neue Aufgabe"} ausloeser={props.ausloeser}>
      {(s) => <AufgabeFormular {...props} s={s} />}
    </FormularDialog>
  );
}

function AufgabeFormular({ aufgabe: a, bezug, benutzer, ichId, s }: DialogProps & { s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await aufgabeSpeichern(v, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const f = z.felder ?? {};
  const [gewaehlt, setGewaehlt] = useState<Bezug | null>(a?.bezug ?? bezug ?? null);
  const [, starten] = useTransition();

  return (
    <form action={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {a && <input type="hidden" name="id" value={a.id} />}
      <input type="hidden" name="bezug_art" value={gewaehlt?.art ?? ""} />
      <input type="hidden" name="bezug_id" value={gewaehlt?.id ?? ""} />
      {z.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler}</p>}

      <Field label="Was ist zu tun? *" error={f.titel}>
        {(p) => <Input {...p} name="titel" defaultValue={a?.titel} placeholder="z. B. Rückruf wegen Liefertermin" autoFocus={!a} />}
      </Field>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Zuständig" error={f.zustaendig_id}>
          {(p) => (
            <Select name="zustaendig_id" defaultValue={a ? (a.zustaendig?.id ?? undefined) : ichId} onValueChange={s.aenderung}>
              <SelectTrigger id={p.id}><SelectValue placeholder="Niemand" /></SelectTrigger>
              <SelectContent>{benutzer.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Fällig am" error={f.faellig}>{(p) => <Input {...p} name="faellig" type="date" defaultValue={a?.faellig ?? ""} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Priorität">
          {(p) => (
            <Select name="prioritaet" defaultValue={a?.prioritaet ?? "normal"} onValueChange={s.aenderung}>
              <SelectTrigger id={p.id}><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITAET.map((x) => <SelectItem key={x} value={x}>{PRIORITAET_TEXT[x]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Status">
          {(p) => (
            <Select name="status" defaultValue={a?.status ?? "offen"} onValueChange={s.aenderung}>
              <SelectTrigger id={p.id}><SelectValue /></SelectTrigger>
              <SelectContent>{AUFGABE_STATUS.map((x) => <SelectItem key={x} value={x}>{AUFGABE_STATUS_TEXT[x]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-3">Bezug (optional)</span>
        {gewaehlt ? (
          <div className="flex h-[42px] items-center justify-between gap-2 rounded-md border border-line bg-surface-muted px-[13px]">
            <span className="truncate"><span className="text-xs text-muted-2">{BEZUG_ART_TEXT[gewaehlt.art]} · </span>{gewaehlt.text}</span>
            <Button size="xs" variant="ghost" onClick={() => { setGewaehlt(null); s.aenderung(); }}>Entfernen</Button>
          </div>
        ) : (
          <BezugAuswahl onWahl={(b) => { setGewaehlt(b); s.aenderung(); }} fehler={f.bezug} />
        )}
      </div>
      <Field label="Notiz">{(p) => <Textarea {...p} name="notiz" defaultValue={a?.notiz ?? ""} />}</Field>

      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        {a ? (
          <Bestaetigen
            titel="Aufgabe löschen?"
            text={<><b className="text-ink">{a.titel}</b> wird als gelöscht markiert und verschwindet aus allen Listen.</>}
            knopf="Löschen"
            gefahr
            ausfuehren={() => starten(async () => { if ((await aufgabeLoeschen(a.id)).ok) s.fertig(); })}
          >
            <Button variant="danger"><Trash2 className="size-[15px]" />Löschen</Button>
          </Bestaetigen>
        ) : <span />}
        <span className="flex gap-2.5">
          <Button onClick={s.abbrechen}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : a ? "Speichern" : "Aufgabe anlegen"}</Button>
        </span>
      </div>
    </form>
  );
}

function BezugAuswahl({ onWahl, fehler }: { onWahl: (b: Bezug) => void; fehler?: string }) {
  const [q, setQ] = useState("");
  const [treffer, setTreffer] = useState<Bezug[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const suchen = (wert: string) => {
    setQ(wert);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => setTreffer(wert.trim().length >= 2 ? await bezugSuchen(wert) : []), 250);
  };
  return (
    <div className="relative">
      <label className={cn("flex h-[42px] items-center gap-2 rounded-md border bg-surface px-[13px]", fehler ? "border-tone-red-fg" : "border-line")}>
        <Search className="size-4 text-muted-2" aria-hidden="true" />
        <input aria-label="Bezug suchen" value={q} onChange={(e) => suchen(e.target.value)} placeholder="Kunde, Anfrage oder Auftrag suchen …" className="min-w-0 flex-1 bg-transparent outline-none" />
        {q && <button type="button" aria-label="Suche leeren" onClick={() => suchen("")} className="text-muted-2"><X className="size-4" /></button>}
      </label>
      {treffer.length > 0 && (
        <ul id="bezug-treffer" role="listbox" className="absolute top-[46px] right-0 left-0 z-10 max-h-64 overflow-y-auto rounded-md border border-line-soft bg-surface p-1 shadow-pop">
          {treffer.map((b) => (
            <li key={`${b.art}-${b.id}`} role="option" aria-selected={false}>
              <button type="button" onClick={() => { onWahl(b); setTreffer([]); setQ(""); }} className="flex w-full items-baseline gap-2 rounded-sm px-3 py-2 text-left hover:bg-canvas">
                <span className="w-16 shrink-0 text-xs text-muted-2">{BEZUG_ART_TEXT[b.art]}</span>
                <span className="font-medium">{b.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------------------------------------------------
/** Eine Aufgabe mit Haken. Abhaken speichert sofort; ein Klick auf den Titel öffnet die Aufgabe. */
export function AufgabeZeile({ aufgabe: a, kontext, zeigeZustaendig, zeigeBezug = true }: { aufgabe: Aufgabe; kontext: AufgabenKontext; zeigeZustaendig?: boolean; zeigeBezug?: boolean }) {
  const [erledigt, setErledigt] = useOptimistic(a.status === "erledigt");
  const [fehler, setFehler] = useState<string>();
  const [, starten] = useTransition();
  const ueberfaellig = !erledigt && !!a.faellig && a.faellig < kontext.heute;
  const heute = !erledigt && a.faellig === kontext.heute;
  const href = a.bezug ? bezugHref(a.bezug) : null;

  return (
    <li className="flex items-start gap-3 border-t border-line-soft py-2.5 first:border-t-0" data-aufgabe={a.id}>
      <input
        type="checkbox"
        aria-label={`${a.titel} erledigt`}
        checked={erledigt}
        onChange={(e) => {
          const wert = e.target.checked;
          starten(async () => {
            setErledigt(wert);
            setFehler((await erledigtSetzen(a.id, wert)).fehler);
          });
        }}
        className="mt-1 size-[18px] shrink-0 cursor-pointer [accent-color:var(--ink)]"
      />
      <div className="min-w-0 flex-1">
        <AufgabeDialog
          {...kontext}
          aufgabe={a}
          ausloeser={
            <button type="button" className={cn("text-left font-medium hover:underline", erledigt && "text-muted line-through")}>
              {a.titel}
            </button>
          }
        />
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
          {a.faellig && (
            <span className={cn(ueberfaellig && "font-medium text-tone-red-fg", heute && "font-medium text-ink")}>
              {ueberfaellig ? "überfällig seit " : "fällig "}{tag(a.faellig)}
            </span>
          )}
          {a.prioritaet === "hoch" && <Badge tone="red">Hoch</Badge>}
          {a.status !== "offen" && a.status !== "erledigt" && <Badge tone={AUFGABE_STATUS_TON[a.status]}>{AUFGABE_STATUS_TEXT[a.status]}</Badge>}
          {zeigeBezug && a.bezug && (
            <span>
              {BEZUG_ART_TEXT[a.bezug.art]}:{" "}
              {href ? <Link href={href} className="text-accent-text hover:underline">{a.bezug.text}</Link> : a.bezug.text}
            </span>
          )}
          {zeigeZustaendig && <span>{a.zustaendig?.name ?? "niemand zugewiesen"}</span>}
        </div>
        {fehler && <p role="alert" className="mt-1 text-xs text-tone-red-fg">{fehler}</p>}
      </div>
    </li>
  );
}

/** Kompakte Aufgabenliste für Kunden- und Anfrageseite mit „Aufgabe“-Knopf (Bezug vorbelegt). */
export function AufgabenKarte({ aufgaben, bezug, kontext }: { aufgaben: Aufgabe[]; bezug: Bezug; kontext: AufgabenKontext }) {
  const offen = aufgaben.filter((a) => a.status !== "erledigt");
  const erledigt = aufgaben.filter((a) => a.status === "erledigt");
  return (
    <section className="rounded-lg border border-line-soft bg-surface px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Aufgaben</h2>
        <AufgabeDialog {...kontext} bezug={bezug} ausloeser={<Button size="xs"><Plus className="size-3.5" strokeWidth={2.2} />Aufgabe</Button>} />
      </div>
      {offen.length ? (
        <ul>{offen.map((a) => <AufgabeZeile key={a.id} aufgabe={a} kontext={kontext} zeigeZustaendig zeigeBezug={false} />)}</ul>
      ) : (
        <p className="text-sm text-muted">Keine offenen Aufgaben.</p>
      )}
      {erledigt.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted">Erledigt ({erledigt.length})</summary>
          <ul>{erledigt.map((a) => <AufgabeZeile key={a.id} aufgabe={a} kontext={kontext} zeigeBezug={false} />)}</ul>
        </details>
      )}
    </section>
  );
}
