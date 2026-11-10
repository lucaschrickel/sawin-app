"use client";

import { useState } from "react";
import { RichText } from "@/components/ui/rich-text";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { FormularDialog } from "@/components/ui/formular-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PRODUKTE = ["Haustür", "Fenster", "Garagentor", "Rollläden", "Insektenschutz"];

export function FormDemo() {
  return (
    <form className="flex flex-col gap-3.5" onSubmit={(e) => e.preventDefault()}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <Field label="Name / Firma">{(a) => <Input {...a} placeholder="z. B. Familie Muster" />}</Field>
        <Field label="Telefon" hint="Wird mit Lexware synchronisiert">{(a) => <Input {...a} type="tel" />}</Field>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <Field label="Produkt">
          {(a) => (
            <Select>
              <SelectTrigger id={a.id} aria-describedby={a["aria-describedby"]}>
                <SelectValue placeholder="Produkt wählen …" />
              </SelectTrigger>
              <SelectContent>
                {PRODUKTE.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="E-Mail" error="Bitte eine gültige E-Mail-Adresse eingeben">
          {(a) => <Input {...a} type="email" defaultValue="muster@" />}
        </Field>
      </div>
      <Field label="Bemerkung">{(a) => <Textarea {...a} placeholder="Interne Notiz …" />}</Field>
      <div className="flex justify-end gap-2.5 pt-1.5">
        <Button>Abbrechen</Button>
        <Button variant="primary" type="submit">
          Speichern
        </Button>
      </div>
    </form>
  );
}

export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="primary">Dialog öffnen</Button>
      </DialogTrigger>
      <DialogContent title="Rechnung finalisieren?" description="Finalisierte Rechnungen lassen sich in Lexware nicht mehr ändern.">
        <p className="text-base text-ink-3">
          Rechnung RE1260081 über 12.345,00 € wird in Lexware Office angelegt und erhält eine endgültige Nummer.
        </p>
        <div className="flex justify-end gap-2.5 pt-5">
          <DialogClose asChild>
            <Button>Abbrechen</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="primary">Endgültig finalisieren</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BestaetigenDemo() {
  return (
    <Bestaetigen
      titel="Kunde löschen?"
      text="Familie Muster wird als gelöscht markiert und verschwindet aus allen Listen."
      knopf="Löschen"
      gefahr
      ausfuehren={() => {}}
    >
      <Button variant="danger">Löschen …</Button>
    </Bestaetigen>
  );
}

export function FormularDialogDemo() {
  return (
    <FormularDialog titel="Notiz erfassen" ausloeser={<Button>Formular-Dialog öffnen</Button>}>
      {(st) => (
        <Formular aktion={st.fertig} onInput={st.aenderung} className="flex flex-col gap-4">
          <Field label="Notiz" hint="Etwas eintippen und dann mit × schließen: der Dialog fragt nach">
            {(a) => <Textarea {...a} />}
          </Field>
          <div className="flex justify-end gap-2.5">
            <Button onClick={st.abbrechen}>Abbrechen</Button>
            <Button type="submit" variant="primary">Speichern</Button>
          </div>
        </Formular>
      )}
    </FormularDialog>
  );
}

/** Formatierter Text (Positions- und Artikelbeschreibungen): Format-Leiste erscheint beim Fokus über dem Feld */
export function RichTextDemo() {
  const [html, setHtml] = useState("<p><strong>Kunststofffenster</strong> 2-flügelig</p><ul><li><p>3-fach-Verglasung</p></li><li><p><span style=\"color: #a33a2e\">RC2</span></p></li></ul>");
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-3">Beschreibung (formatierbar)</span>
      <RichText label="Beschreibung" wert={html} onChange={setHtml} />
      <code className="mt-1 block text-xs break-all text-muted-2">{html}</code>
    </div>
  );
}
