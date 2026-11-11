"use client";

import { Pencil, Plus, Search, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Formular } from "@/components/ui/formular";
import type { Anfrage } from "@/lib/anfragen";
import { cn } from "@/lib/cn";
import { utcNachBerlinLokal } from "@/lib/zeit";
import { KundeDialog } from "../kunden/kunde-dialog";
import { anfrageSpeichern, kundenObjekte, kundenSuchen, type Ergebnis, type KundeTreffer } from "./aktionen";

export type AnfrageDialogDaten = {
  benutzer: { id: string; name: string }[];
  ichId: string;
  herkunftListe: string[];
  produkteListe: string[];
};

type Props = AnfrageDialogDaten & {
  /** aus dem „Neu“-Menü: beim Laden offen */
  startOffen?: boolean;
  anfrage?: Anfrage;
  /** Kunde vorbelegt (z. B. von der Kundenseite) */
  kunde?: { id: string; name: string };
  /** Adressen des Kunden für „Objekt“ (beim Bearbeiten) */
  objekte?: string[];
  ausloeser?: ReactNode;
};

/** Anfrage erfassen oder bearbeiten */
export function AnfrageDialog(props: Props) {
  const neu = !props.anfrage;
  return (
    <FormularDialog
      titel={neu ? "Neue Anfrage" : "Anfrage bearbeiten"}
      breit
      startOffen={props.startOffen}
      ausloeser={
        props.ausloeser ??
        (neu ? (
          <Button variant="primary">
            <Plus className="size-[15px]" strokeWidth={2.2} />
            Neue Anfrage
          </Button>
        ) : (
          <Button>
            <Pencil className="size-[15px]" />
            Bearbeiten
          </Button>
        ))
      }
    >
      {(s) => <AnfrageFormular {...props} s={s} />}
    </FormularDialog>
  );
}

function AnfrageFormular({ anfrage: a, kunde, objekte = [], benutzer, ichId, herkunftListe, produkteListe, s }: Props & { s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (vorher, fd) => {
    const r = await anfrageSpeichern(vorher, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const f = z.felder ?? {};
  const [gewaehlt, setGewaehlt] = useState<{ id: string; name: string } | null>(a?.kunde ?? kunde ?? null);
  const [adressen, setAdressen] = useState<string[]>(objekte);
  const [objekt, setObjekt] = useState(a?.objekt ?? "");
  const [herkunft, setHerkunft] = useState<string | undefined>(a?.herkunft ?? undefined);

  const kundeWaehlen = async (k: { id: string; name: string }) => {
    setGewaehlt(k);
    s.aenderung();
    const info = await kundenObjekte(k.id);
    if (!info) return;
    setAdressen(info.objekte);
    if (!objekt && info.objekte[0]) setObjekt(info.objekte[0]);
    if (!herkunft && info.herkunft && herkunftListe.includes(info.herkunft)) setHerkunft(info.herkunft);
  };

  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {a && <input type="hidden" name="id" value={a.id} />}
      {z.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler}</p>}

      <Field label="Kurzbezeichnung *" error={f.titel}>
        {(p) => <Input {...p} name="titel" defaultValue={a?.titel} placeholder="z. B. Haustür und 4 Fenster" autoFocus={!a} />}
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-3">Kunde *</span>
        <input type="hidden" name="kunde_id" value={gewaehlt?.id ?? ""} />
        {gewaehlt ? (
          <div className="flex h-[42px] items-center justify-between gap-2 rounded-md border border-line bg-surface-muted px-[13px]">
            <b className="truncate font-medium">{gewaehlt.name}</b>
            {!a && (
              <Button size="xs" variant="ghost" onClick={() => { setGewaehlt(null); s.aenderung(); }}>
                Ändern
              </Button>
            )}
          </div>
        ) : (
          <KundenAuswahl onWahl={kundeWaehlen} herkunftListe={herkunftListe} fehler={f.kunde_id} />
        )}
      </div>

      <Field label="Objekt / Lieferadresse" hint={adressen.length ? "Aus den Adressen des Kunden wählen oder frei eingeben" : undefined}>
        {(p) => (
          <>
            <Input {...p} name="objekt" list="anfrage-objekte" value={objekt} onChange={(e) => setObjekt(e.target.value)} />
            <datalist id="anfrage-objekte">{adressen.map((o) => <option key={o} value={o} />)}</datalist>
          </>
        )}
      </Field>
      <Field label="Beschreibung">{(p) => <Textarea {...p} name="beschreibung" defaultValue={a?.beschreibung ?? ""} placeholder="Was wünscht der Kunde?" />}</Field>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Herkunft" error={f.herkunft}>
          {(p) => (
            <Select name="herkunft" value={herkunft ?? ""} onValueChange={(v) => { setHerkunft(v); s.aenderung(); }}>
              <SelectTrigger id={p.id}><SelectValue placeholder="Bitte wählen …" /></SelectTrigger>
              <SelectContent>{herkunftListe.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Zuständig">
          {(p) => (
            <Select name="zustaendig_id" defaultValue={a ? (a.zustaendig_id ?? undefined) : ichId} onValueChange={s.aenderung}>
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
              <input type="checkbox" name="produkte" value={p} defaultChecked={a?.produkte.includes(p)} className="size-4 [accent-color:var(--ink)]" />
              {p}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <Field label="Geschätzter Wert (€)" error={f.geschaetzter_wert}>
          {(p) => <Input {...p} name="geschaetzter_wert" inputMode="decimal" defaultValue={a?.geschaetzter_wert != null ? String(a.geschaetzter_wert).replace(".", ",") : ""} placeholder="z. B. 12000" />}
        </Field>
        <Field label="Wiedervorlage" error={f.wiedervorlage}>
          {(p) => <Input {...p} name="wiedervorlage" type="date" defaultValue={a?.wiedervorlage ?? ""} />}
        </Field>
        <Field label="Aufmaß-Termin" hint="Stellt eine neue Anfrage auf „Aufmaß“" error={f.aufmass_termin}>
          {(p) => <Input {...p} name="aufmass_termin" type="datetime-local" defaultValue={utcNachBerlinLokal(a?.aufmass_termin)} />}
        </Field>
      </div>
      <Field label="Interne Notiz">{(p) => <Textarea {...p} name="notiz" defaultValue={a?.notiz ?? ""} />}</Field>

      <div className="flex justify-end gap-2.5 pt-1">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>
          {laeuft ? "Speichern …" : a ? "Speichern" : "Anfrage anlegen"}
        </Button>
      </div>
    </Formular>
  );
}

/** Kunden suchen (ab zwei Zeichen) oder neu anlegen */
export function KundenAuswahl({ onWahl, herkunftListe, fehler }: { onWahl: (k: { id: string; name: string }) => void; herkunftListe: string[]; fehler?: string }) {
  const [q, setQ] = useState("");
  const [treffer, setTreffer] = useState<KundeTreffer[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const suchen = (wert: string) => {
    setQ(wert);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => setTreffer(wert.trim().length >= 2 ? await kundenSuchen(wert) : []), 250);
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <label className={cn("flex h-[42px] flex-1 items-center gap-2 rounded-md border bg-surface px-[13px]", fehler ? "border-tone-red-fg" : "border-line")}>
          <Search className="size-4 text-muted-2" aria-hidden="true" />
          <input
            aria-label="Kunde suchen"
            role="combobox"
            aria-expanded={treffer.length > 0}
            aria-controls="kunden-treffer"
            value={q}
            onChange={(e) => suchen(e.target.value)}
            placeholder="Name, Kundennummer oder Ort …"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
          {q && (
            <button type="button" aria-label="Suche leeren" onClick={() => suchen("")} className="text-muted-2">
              <X className="size-4" />
            </button>
          )}
        </label>
        <KundeDialog
          herkunftListe={herkunftListe}
          onAngelegt={onWahl}
          ausloeser={
            <Button>
              <Plus className="size-[15px]" strokeWidth={2.2} />
              Neuer Kunde
            </Button>
          }
        />
      </div>
      {fehler && <small className="mt-1 block text-xs text-tone-red-fg">{fehler}</small>}
      {treffer.length > 0 && (
        <ul id="kunden-treffer" role="listbox" className="absolute top-[46px] right-0 left-0 z-10 max-h-64 overflow-y-auto rounded-md border border-line-soft bg-surface p-1 shadow-pop">
          {treffer.map((k) => (
            <li key={k.id} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => { onWahl({ id: k.id, name: k.name }); setTreffer([]); setQ(""); }}
                className="flex w-full items-baseline justify-between gap-3 rounded-sm px-3 py-2 text-left hover:bg-canvas"
              >
                <span className="font-medium">{k.name}</span>
                <span className="text-xs text-muted-2">
                  <span className="font-mono">{k.nummer}</span>
                  {k.ort ? ` · ${k.ort}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && treffer.length === 0 && (
        <small className="mt-1 block text-xs text-muted-2">Kein Kunde gefunden? Über „Neuer Kunde“ anlegen.</small>
      )}
    </div>
  );
}
