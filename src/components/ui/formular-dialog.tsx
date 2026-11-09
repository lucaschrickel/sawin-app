"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTrigger } from "./dialog";

export type FormularSteuerung = {
  /** bei jeder Eingabe aufrufen (merkt ungespeicherte Änderungen) */
  aenderung: () => void;
  /** nach erfolgreichem Speichern: schließt ohne Nachfrage */
  fertig: () => void;
  /** „Abbrechen“: fragt bei ungespeicherten Änderungen nach */
  abbrechen: () => void;
};

type Props = {
  titel: string;
  beschreibung?: string;
  breit?: boolean;
  /** Auslöser (z. B. ein Button) */
  ausloeser: ReactNode;
  children: (s: FormularSteuerung) => ReactNode;
};

/**
 * Dialog mit Formular. Schließen per ×, Escape, Klick daneben oder „Abbrechen“ fragt nach, wenn es ungespeicherte
 * Änderungen gibt (CLAUDE.md „Speichern“). Bei jedem Öffnen ist das Formular frisch.
 */
export function FormularDialog({ titel, beschreibung, breit, ausloeser, children }: Props) {
  const [offen, setOffen] = useState(false);
  const [geaendert, setGeaendert] = useState(false);
  const [nachfrage, setNachfrage] = useState(false);
  const [schluessel, setSchluessel] = useState(0);

  const schliessen = () => {
    setOffen(false);
    setGeaendert(false);
    setNachfrage(false);
  };
  const oeffnenAendern = (o: boolean) => {
    if (o) {
      setSchluessel((k) => k + 1);
      setOffen(true);
    } else if (geaendert) setNachfrage(true);
    else schliessen();
  };

  return (
    <Dialog open={offen} onOpenChange={oeffnenAendern}>
      <DialogTrigger asChild>{ausloeser}</DialogTrigger>
      <DialogContent title={titel} description={beschreibung} wide={breit}>
        {nachfrage && (
          <div role="alertdialog" aria-label="Ungespeicherte Änderungen" className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-tone-amber-bg px-4 py-3 text-sm text-tone-amber-fg">
            <span className="flex-1">Es gibt ungespeicherte Änderungen.</span>
            <Button size="sm" onClick={() => setNachfrage(false)}>Weiter bearbeiten</Button>
            <Button size="sm" variant="danger" onClick={schliessen}>Verwerfen</Button>
          </div>
        )}
        <div key={schluessel}>
          {children({ aenderung: () => setGeaendert(true), fertig: schliessen, abbrechen: () => oeffnenAendern(false) })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
