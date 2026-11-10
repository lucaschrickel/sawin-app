"use client";

import { Pencil, Plus, Trash2, UserCheck, UserMinus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Formular } from "@/components/ui/formular";
import { cn } from "@/lib/cn";
import type { Mitarbeiter } from "@/lib/mitarbeiter";
import { aktivSetzen, mitarbeiterLoeschen, mitarbeiterSpeichern, type Ergebnis } from "./aktionen";

export function Meldung({ e }: { e: Ergebnis }) {
  if (!e.fehler && !e.hinweis) return null;
  return (
    <p role={e.fehler ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-sm", e.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}>
      {e.fehler ?? e.hinweis}
    </p>
  );
}

/** Mitarbeiter anlegen oder bearbeiten */
export function MitarbeiterDialog({ mitarbeiter, anspruchStandard }: { mitarbeiter?: Mitarbeiter; anspruchStandard: number }) {
  return (
    <FormularDialog
      titel={mitarbeiter ? "Mitarbeiter bearbeiten" : "Mitarbeiter anlegen"}
      ausloeser={
        mitarbeiter ? (
          <Button>
            <Pencil className="size-[15px]" />
            Bearbeiten
          </Button>
        ) : (
          <Button variant="primary">
            <Plus className="size-[15px]" strokeWidth={2.2} />
            Mitarbeiter anlegen
          </Button>
        )
      }
    >
      {(s) => <MitarbeiterFormular m={mitarbeiter} anspruchStandard={anspruchStandard} s={s} />}
    </FormularDialog>
  );
}

function MitarbeiterFormular({ m, anspruchStandard, s }: { m?: Mitarbeiter; anspruchStandard: number; s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await mitarbeiterSpeichern(v, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const f = z.felder ?? {};
  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {m && <input type="hidden" name="id" value={m.id} />}
      {z.fehler && <Meldung e={{ fehler: z.fehler }} />}
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
        <Field label="Name *" error={f.name}>{(p) => <Input {...p} name="name" defaultValue={m?.name} autoFocus={!m} />}</Field>
        <Field label="Kürzel *" error={f.kuerzel}>{(p) => <Input {...p} name="kuerzel" defaultValue={m?.kuerzel} maxLength={4} className="uppercase" />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Rolle" hint="z. B. Monteur, Bauleitung, Büro">{(p) => <Input {...p} name="rolle" defaultValue={m?.rolle ?? ""} />}</Field>
        <Field label="Telefon">{(p) => <Input {...p} name="telefon" type="tel" defaultValue={m?.telefon ?? ""} />}</Field>
      </div>
      <div className="grid grid-cols-2 items-end gap-3 max-md:grid-cols-1">
        <label className="flex h-[42px] items-center gap-2 text-sm">
          <input type="checkbox" name="ist_monteur" defaultChecked={m?.ist_monteur ?? true} className="size-4 [accent-color:var(--ink)]" />
          Monteur (erscheint in der Plantafel)
        </label>
        <Field label="Urlaubsanspruch (Tage/Jahr)" hint={`Leer = Standard ${anspruchStandard} Tage`} error={f.urlaubsanspruch_tage}>
          {(p) => <Input {...p} name="urlaubsanspruch_tage" inputMode="numeric" defaultValue={m?.urlaubsanspruch_tage ?? ""} placeholder={String(anspruchStandard)} />}
        </Field>
      </div>
      <div className="flex justify-end gap-2.5 pt-1">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : m ? "Speichern" : "Mitarbeiter anlegen"}</Button>
      </div>
    </Formular>
  );
}

/** Deaktivieren, wieder aktivieren und löschen (Löschen nur ohne Geschichte, sonst Hinweis auf Deaktivieren) */
export function MitarbeiterAktionen({ id, name, aktiv }: { id: string; name: string; aktiv: boolean }) {
  const [ergebnis, setErgebnis] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  return (
    <>
      {aktiv ? (
        <Bestaetigen
          titel="Mitarbeiter deaktivieren?"
          text={<><b className="text-ink">{name}</b> verschwindet aus der Plantafel und den Auswahllisten. Einsätze, Zeiten und Abwesenheiten bleiben erhalten.</>}
          knopf="Deaktivieren"
          ausfuehren={() => starten(async () => setErgebnis(await aktivSetzen(id, false)))}
        >
          <Button disabled={laeuft}>
            <UserMinus className="size-[15px]" />
            Deaktivieren
          </Button>
        </Bestaetigen>
      ) : (
        <Button disabled={laeuft} onClick={() => starten(async () => setErgebnis(await aktivSetzen(id, true)))}>
          <UserCheck className="size-[15px]" />
          Aktivieren
        </Button>
      )}
      <Bestaetigen
        titel="Mitarbeiter löschen?"
        text={
          <>
            <b className="text-ink">{name}</b> wird als gelöscht markiert. Das geht nur, solange keine Einsätze, Zeiten, Abwesenheiten, Kolonnen oder ein
            Benutzerkonto an der Person hängen; sonst bitte deaktivieren.
          </>
        }
        knopf="Löschen"
        gefahr
        ausfuehren={() => starten(async () => setErgebnis((await mitarbeiterLoeschen(id)) ?? {}))}
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
