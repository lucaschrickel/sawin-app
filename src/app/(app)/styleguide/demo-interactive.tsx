"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
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
