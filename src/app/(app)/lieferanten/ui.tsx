"use client";

import { verlaufVergessen } from "@/components/app/verlauf";
import { Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { cn } from "@/lib/cn";
import type { Kontakt, Lieferant } from "@/lib/einkauf";
import { konditionSpeichern, lieferantLoeschen, lieferantSpeichern, type Ergebnis } from "./aktionen";

function Meldung({ e }: { e: Ergebnis }) {
  if (!e.fehler && !e.hinweis) return null;
  return (
    <p role={e.fehler ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-sm", e.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}>
      {e.fehler ?? e.hinweis}
    </p>
  );
}

/** Lieferant anlegen oder bearbeiten, mit beliebig vielen Ansprechpartnern */
export function LieferantDialog({ lieferant }: { lieferant?: Lieferant }) {
  return (
    <FormularDialog
      titel={lieferant ? "Lieferant bearbeiten" : "Lieferant anlegen"}
      breit
      ausloeser={
        lieferant ? (
          <Button>
            <Pencil className="size-[15px]" />
            Bearbeiten
          </Button>
        ) : (
          <Button variant="primary">
            <Plus className="size-[15px]" strokeWidth={2.2} />
            Lieferant
          </Button>
        )
      }
    >
      {(s) => <LieferantFormular l={lieferant} s={s} />}
    </FormularDialog>
  );
}

type KontaktZeile = Omit<Kontakt, "id"> & { id: string | null; schluessel: number };
const leer = (schluessel: number): KontaktZeile => ({ id: null, schluessel, name: "", funktion: "", handy: "", telefon: "", email: "" });

function LieferantFormular({ l, s }: { l?: Lieferant; s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await lieferantSpeichern(v, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const [kontakte, setKontakte] = useState<KontaktZeile[]>(() => [...(l?.kontakte ?? []).map((k, i) => ({ ...k, schluessel: i })), ...(l?.kontakte.length ? [] : [leer(999)])]);
  const f = z.felder ?? {};
  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {l && <input type="hidden" name="id" value={l.id} />}
      {z.fehler && <Meldung e={{ fehler: z.fehler }} />}
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Firma *" error={f.name}>{(p) => <Input {...p} name="name" defaultValue={l?.name} autoFocus={!l} />}</Field>
        <Field label="Produktgruppen" hint="Durch Komma getrennt, z. B. Fenster, Haustür">{(p) => <Input {...p} name="produktgruppen" defaultValue={l?.produktgruppen.join(", ")} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Link zum Konfigurator" error={f.konfigurator_url}>{(p) => <Input {...p} name="konfigurator_url" type="url" defaultValue={l?.konfigurator_url ?? ""} placeholder="https://…" />}</Field>
        <Field label="Händlerportal / Shop" error={f.haendlerportal_url}>{(p) => <Input {...p} name="haendlerportal_url" type="url" defaultValue={l?.haendlerportal_url ?? ""} placeholder="https://…" />}</Field>
      </div>
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <Field label="Unsere Kundennummer">{(p) => <Input {...p} name="unsere_kundennummer" defaultValue={l?.unsere_kundennummer ?? ""} />}</Field>
        <Field label="Lieferzeit">{(p) => <Input {...p} name="lieferzeit" defaultValue={l?.lieferzeit ?? ""} placeholder="z. B. 4–6 Wochen" />}</Field>
        <Field label="Telefon Zentrale">{(p) => <Input {...p} name="telefon" type="tel" defaultValue={l?.telefon ?? ""} />}</Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-ink-3">Ansprechpartner</legend>
        {kontakte.map((k, i) => (
          <div key={k.schluessel} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1.3fr_auto] items-center gap-2 max-md:grid-cols-2" data-kontakt-zeile={i}>
            <input type="hidden" name="k_id" value={k.id ?? ""} />
            <Input name="k_name" aria-label="Name" placeholder="Name" defaultValue={k.name} className="h-9" />
            <Input name="k_funktion" aria-label="Funktion" placeholder="Funktion" defaultValue={k.funktion ?? ""} className="h-9" />
            <Input name="k_handy" aria-label="Handy" placeholder="Handy" type="tel" defaultValue={k.handy ?? ""} className="h-9" />
            <Input name="k_telefon" aria-label="Telefon" placeholder="Telefon" type="tel" defaultValue={k.telefon ?? ""} className="h-9" />
            <Input name="k_email" aria-label="E-Mail" placeholder="E-Mail" type="email" defaultValue={k.email ?? ""} className="h-9" />
            <button type="button" aria-label="Ansprechpartner entfernen" onClick={() => { setKontakte((x) => x.filter((y) => y.schluessel !== k.schluessel)); s.aenderung(); }} className="grid size-8 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-tone-red-fg">
              <X className="size-4" />
            </button>
          </div>
        ))}
        {f.kontakte && <small className="text-xs text-tone-red-fg">{f.kontakte}</small>}
        <Button size="xs" className="self-start" onClick={() => setKontakte((x) => [...x, leer(Date.now())])}>
          <Plus className="size-3.5" />
          Ansprechpartner
        </Button>
      </fieldset>
      <Field label="Notiz">{(p) => <Textarea {...p} name="notiz" defaultValue={l?.notiz ?? ""} />}</Field>
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : l ? "Speichern" : "Lieferant anlegen"}</Button>
      </div>
    </Formular>
  );
}

/** Einkaufskonditionen (nur mit Recht „Konditionen sehen“) */
export function KonditionFormular({ lieferantId, text }: { lieferantId: string; text: string }) {
  const [geaendert, setGeaendert] = useState(false);
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await konditionSpeichern(v, fd);
    if (r.ok) setGeaendert(false);
    return r;
  }, {});
  return (
    <Formular aktion={aktion} onInput={() => setGeaendert(true)} className="flex flex-col gap-2.5">
      <input type="hidden" name="lieferant_id" value={lieferantId} />
      <Textarea name="text" aria-label="Konditionen" defaultValue={text} placeholder="z. B. 12 % Händlerrabatt, 3 % Skonto 10 Tage, frachtfrei ab 2.500 €" />
      <p className="text-xs text-muted-2">Nur intern, nur für Benutzer mit dem Recht „Konditionen sehen“.</p>
      <div className="flex items-center justify-end gap-3">
        {!geaendert && z.hinweis && <span role="status" className="text-sm text-tone-green-fg">{z.hinweis}</span>}
        <Button type="submit" size="sm" variant={geaendert ? "primary" : "secondary"} disabled={laeuft || !geaendert}>Speichern</Button>
      </div>
      {z.fehler && <Meldung e={{ fehler: z.fehler }} />}
    </Formular>
  );
}

export function VertraulichMarke() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-muted" title="Nur Benutzer mit dem Recht „Konditionen sehen“">
      <Lock className="size-3" />
      vertraulich
    </span>
  );
}

export function LieferantLoeschen({ id, name }: { id: string; name: string }) {
  const [e, setE] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Bestaetigen
        titel="Lieferant löschen?"
        text={<><b className="text-ink">{name}</b> wird samt Ansprechpartnern als gelöscht markiert. Das geht nur ohne offene Bestellungen.</>}
        knopf="Löschen"
        gefahr
        ausfuehren={() => starten(async () => (verlaufVergessen(), setE((await lieferantLoeschen(id)) ?? {})))}
      >
        <Button variant="danger" disabled={laeuft}>
          <Trash2 className="size-[15px]" />
          Löschen
        </Button>
      </Bestaetigen>
      {e.fehler && <div className="basis-full"><Meldung e={e} /></div>}
    </>
  );
}
