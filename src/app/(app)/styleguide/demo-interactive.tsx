"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { VerlassenDialog } from "@/components/app/verlassen-schutz";
import { SpaltenGriff } from "@/components/ui/spalten-griff";
import { PdfKachel } from "../beleg/ui";
import { AblageUpload } from "@/components/app/ablage-upload";
import type { ChatNachricht } from "@/lib/chat";
import { UNTERORDNER } from "@/lib/onedrive/schema";
import { ChatPanel } from "../chat/ui";
import { FarbWahl } from "../montageplan/tafel-dialoge";
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

/** Farbwahl eines Einsatzes (Plantafel): Standard, Planungspalette oder frei mit automatischer Schriftfarbe */
export function FarbWahlDemo() {
  const [farbe, setFarbe] = useState<string | null>("plan-3");
  return (
    <div className="flex flex-col gap-2">
      <FarbWahl wert={farbe} onWahl={setFarbe} />
      <span className="text-xs text-muted-2">Gewählt: {farbe ?? "Standard nach Typ"}</span>
    </div>
  );
}

const DEMO_ID = "00000000-0000-4000-8000-000000000000";

/** Chat mit Beispielnachrichten (Senden scheitert hier bewusst: kein echter Vorgang) */
export function ChatDemo() {
  const nachrichten: ChatNachricht[] = [
    { id: "n1", text: "@JM bitte das Maß der Haustür noch einmal prüfen, Laibung ist schief.", created_at: "2026-11-12T08:15:00.000Z", autor: { id: "a", name: "Anna Büro", kuerzel: "AB" }, eigene: false, foto: null },
    { id: "n2", text: "Mache ich morgen früh vor der Montage.", created_at: "2026-11-12T08:42:00.000Z", autor: { id: "b", name: "Jonas Meyer", kuerzel: "JM" }, eigene: true, foto: null },
  ];
  return <ChatPanel bezug={{ auftrag_id: DEMO_ID }} nachrichten={nachrichten} personen={[{ id: "a", name: "Anna Büro", kuerzel: "AB" }, { id: "b", name: "Jonas Meyer", kuerzel: "JM" }]} stand="" />;
}

/** Upload in den OneDrive-Ordner mit Wahl des Unterordners (ohne echten Vorgang) */
export function AblageUploadDemo() {
  return <AblageUpload bezug={{ auftrag_id: DEMO_ID }} unterordner={[...UNTERORDNER]} />;
}

/** Spaltenbreiten wie in der Positionstabelle: Griff ziehen, Doppelklick „passend“, Tastatur, Zurücksetzen */
export function SpaltenGriffDemo() {
  const spalten = [
    { schluessel: "menge", titel: "Menge", standard: 72, min: 48, max: 200 },
    { schluessel: "preis", titel: "Einzelpreis", standard: 110, min: 72, max: 240 },
  ];
  const standard = Object.fromEntries(spalten.map((s) => [s.schluessel, s.standard]));
  const [b, setB] = useState<Record<string, number>>(standard);
  const geaendert = spalten.some((s) => b[s.schluessel] !== s.standard);
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full max-w-xl table-fixed border-collapse text-sm">
        <colgroup>
          <col />
          {spalten.map((s) => <col key={s.schluessel} style={{ width: b[s.schluessel] }} />)}
        </colgroup>
        <thead>
          <tr className="text-left text-[11px] font-semibold tracking-[0.06em] text-muted-2 uppercase">
            <th className="px-1 pb-2">Titel</th>
            {spalten.map((s) => (
              <th key={s.schluessel} className="relative px-1 pb-2 text-right">
                {s.titel}
                <SpaltenGriff titel={s.titel} breite={b[s.schluessel]} min={s.min} max={s.max} onBreite={(w) => setB((x) => ({ ...x, [s.schluessel]: w }))} onEnde={() => {}} onPassend={() => setB((x) => ({ ...x, [s.schluessel]: s.min + 20 }))} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line-soft">
            <td className="px-1 py-2">Kunststofffenster 3-fach</td>
            <td className="px-1 py-2 text-right tabular">4</td>
            <td className="px-1 py-2 text-right tabular">480,00 €</td>
          </tr>
        </tbody>
      </table>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" disabled={!geaendert} onClick={() => setB(standard)}>
          <RotateCcw className="size-4" /> Spalten zurücksetzen
        </Button>
        <span className="text-xs text-muted-2">Breiten: {spalten.map((s) => `${s.titel} ${b[s.schluessel]} px`).join(" · ")}</span>
      </div>
    </div>
  );
}

/** PDF-Kachel der Vorschau-Leiste: bearbeitbar (Hand, „Bearbeiten“) und gesperrt (Sperrzeichen, Hinweis) */
export function PdfKachelDemo() {
  return (
    <div className="grid max-w-xl grid-cols-2 gap-4">
      <div>
        <PdfKachel src="about:blank" titel="Angebot (Entwurf)" hoehe={180} bearbeiten="/styleguide" />
        <p className="mt-1.5 text-xs text-muted-2">bearbeitbar: Klick öffnet die Bearbeitung</p>
      </div>
      <div>
        <PdfKachel src="about:blank" titel="Lieferschein LS1000" hoehe={180} bearbeiten={null} />
        <p className="mt-1.5 text-xs text-muted-2">gesperrt: Klick zeigt „Nicht mehr bearbeitbar“</p>
      </div>
    </div>
  );
}

/** Abfrage beim Verlassen mit ungespeicherten Änderungen (Beleg-Editor, Bestellung) */
export function VerlassenDemo() {
  const [v, setV] = useState<null | { weiter: () => void }>(null);
  return (
    <>
      <Button onClick={() => setV({ weiter: () => {} })}>Seite verlassen …</Button>
      <VerlassenDialog verlassen={v} text="Die Bestellung hat ungespeicherte Änderungen. Was soll mit ihnen passieren?" onAbbrechen={() => setV(null)} onVerwerfen={() => setV(null)} onSpeichern={() => setV(null)} />
    </>
  );
}
