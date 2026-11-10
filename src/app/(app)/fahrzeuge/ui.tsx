"use client";

import { AlertTriangle, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { cn } from "@/lib/cn";
import type { Fahrzeug } from "@/lib/fahrzeuge";
import { fahrzeugLoeschen, fahrzeugSpeichern, werkstattEintragen, werkstattLoeschen, type Ergebnis } from "./aktionen";

function Meldung({ e }: { e: Ergebnis }) {
  if (!e.fehler && !e.hinweis) return null;
  return (
    <p role={e.fehler ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-sm", e.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}>
      {e.fehler ?? e.hinweis}
    </p>
  );
}

/** Fahrzeug anlegen oder bearbeiten */
export function FahrzeugDialog({ fahrzeug }: { fahrzeug?: Fahrzeug }) {
  return (
    <FormularDialog
      titel={fahrzeug ? `Fahrzeug ${fahrzeug.kennzeichen}` : "Fahrzeug hinzufügen"}
      ausloeser={
        fahrzeug ? (
          <Button>
            <Pencil className="size-[15px]" />
            Bearbeiten
          </Button>
        ) : (
          <Button variant="primary">
            <Plus className="size-[15px]" strokeWidth={2.2} />
            Fahrzeug
          </Button>
        )
      }
    >
      {(s) => <FahrzeugFormular f={fahrzeug} s={s} />}
    </FormularDialog>
  );
}

function FahrzeugFormular({ f, s }: { f?: Fahrzeug; s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await fahrzeugSpeichern(v, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const fe = z.felder ?? {};
  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {f && <input type="hidden" name="id" value={f.id} />}
      {z.fehler && <Meldung e={{ fehler: z.fehler }} />}
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Kennzeichen *" error={fe.kennzeichen}>{(p) => <Input {...p} name="kennzeichen" defaultValue={f?.kennzeichen} placeholder="GF-SW 107" autoFocus={!f} />}</Field>
        <Field label="Typ">{(p) => <Input {...p} name="typ" defaultValue={f?.typ ?? ""} placeholder="z. B. Transporter · VW Crafter" />}</Field>
      </div>
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <Field label="TÜV / HU" error={fe.tuev_am}>{(p) => <Input {...p} name="tuev_am" type="date" defaultValue={f?.tuev_am ?? ""} />}</Field>
        <Field label="Nächster Service" error={fe.service_am}>{(p) => <Input {...p} name="service_am" type="date" defaultValue={f?.service_am ?? ""} />}</Field>
        <Field label="UVV-Prüfung" error={fe.uvv_am}>{(p) => <Input {...p} name="uvv_am" type="date" defaultValue={f?.uvv_am ?? ""} />}</Field>
      </div>
      <Field label="Kilometerstand" error={fe.km_stand}>{(p) => <Input {...p} name="km_stand" inputMode="numeric" defaultValue={f?.km_stand ?? ""} />}</Field>
      <Field label="Hinweise">{(p) => <Textarea {...p} name="hinweise" defaultValue={f?.hinweise ?? ""} placeholder="z. B. Reifenwechsel, Ladungssicherung, Schäden" />}</Field>
      <p className="text-xs text-muted-2">Prüftermine, die in weniger als 30 Tagen fällig sind, zählt die Seitenleiste unter „Fahrzeuge“.</p>
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : "Speichern"}</Button>
      </div>
    </Formular>
  );
}

export function FahrzeugLoeschen({ id, kennzeichen }: { id: string; kennzeichen: string }) {
  const [e, setE] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Bestaetigen
        titel="Fahrzeug löschen?"
        text={<><b className="text-ink">{kennzeichen}</b> wird als gelöscht markiert und steht nicht mehr zur Auswahl. Das geht nur, solange es für keine künftigen Einsätze eingeplant ist.</>}
        knopf="Löschen"
        gefahr
        ausfuehren={() => starten(async () => setE((await fahrzeugLoeschen(id)) ?? {}))}
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

/** Werkstatttermin eintragen; danach Warnung, falls das Fahrzeug im Zeitraum eingeplant ist */
export function WerkstattDialog({ fahrzeugId, heute }: { fahrzeugId: string; heute: string }) {
  return (
    <FormularDialog
      titel="Werkstatttermin"
      ausloeser={
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm font-medium hover:border-line-strong">
          <Wrench className="size-3.5" />
          Werkstatttermin
        </button>
      }
    >
      {(s) => <WerkstattFormular fahrzeugId={fahrzeugId} heute={heute} s={s} />}
    </FormularDialog>
  );
}

function WerkstattFormular({ fahrzeugId, heute, s }: { fahrzeugId: string; heute: string; s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await werkstattEintragen(v, fd);
    if (r.ok && !r.warnung) s.fertig();
    else if (r.ok) s.gespeichert();
    return r;
  }, {});
  if (z.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="flex items-center gap-2 rounded-md bg-tone-amber-bg px-3.5 py-2.5 text-sm text-tone-amber-fg">
          <AlertTriangle className="size-4 shrink-0" />
          {z.warnung}
        </p>
        <div className="flex justify-end"><Button variant="primary" onClick={s.fertig}>Schließen</Button></div>
      </div>
    );
  }
  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      <input type="hidden" name="fahrzeug_id" value={fahrzeugId} />
      {z.fehler && <Meldung e={{ fehler: z.fehler }} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Von *" error={z.felder?.von}>{(p) => <Input {...p} name="von" type="date" defaultValue={heute} />}</Field>
        <Field label="Bis *" error={z.felder?.bis}>{(p) => <Input {...p} name="bis" type="date" defaultValue={heute} />}</Field>
      </div>
      <Field label="Was?">{(p) => <Input {...p} name="notiz" placeholder="z. B. Inspektion, TÜV" />}</Field>
      <p className="text-xs text-muted-2">Einsätze mit diesem Fahrzeug im Zeitraum werden in der Plantafel als Konflikt markiert.</p>
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>Eintragen</Button>
      </div>
    </Formular>
  );
}

export function WerkstattLoeschen({ id, text }: { id: string; text: string }) {
  const [, starten] = useTransition();
  return (
    <Bestaetigen titel="Werkstatttermin löschen?" text={<><b className="text-ink">{text}</b> wird als gelöscht markiert.</>} knopf="Löschen" gefahr ausfuehren={() => starten(async () => { await werkstattLoeschen(id); })}>
      <button type="button" aria-label={`Werkstatttermin ${text} löschen`} className="grid size-8 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-tone-red-fg">
        <Trash2 className="size-4" />
      </button>
    </Bestaetigen>
  );
}
