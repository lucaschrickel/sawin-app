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
  /** gespeichert, Dialog bleibt aber offen (z. B. um eine Warnung zu zeigen): Schließen fragt nicht mehr nach */
  gespeichert: () => void;
};

type Props = {
  titel: string;
  beschreibung?: string;
  breit?: boolean;
  /** Auslöser (z. B. ein Button). Ohne Auslöser ist der Dialog beim Einblenden offen (z. B. Klick in die Plantafel). */
  ausloeser?: ReactNode;
  /** wird nach dem Schließen aufgerufen (für Dialoge ohne Auslöser) */
  beiSchliessen?: () => void;
  /** beim Laden schon offen (z. B. aus dem „Neu“-Menü mit ?neu=1); beim Schließen verschwindet ?neu aus der Adresse */
  startOffen?: boolean;
  children: (s: FormularSteuerung) => ReactNode;
};

/**
 * Dialog mit Formular. Schließen per ×, Escape, Klick daneben oder „Abbrechen“ fragt nach, wenn es ungespeicherte
 * Änderungen gibt (CLAUDE.md „Speichern“). Bei jedem Öffnen ist das Formular frisch.
 */
/** ?neu=1 aus der Adresse entfernen, ohne neu zu laden (Dialog aus dem „Neu“-Menü geschlossen) */
export function neuParameterEntfernen() {
  const u = new URL(window.location.href);
  // ?neu (Neu-Menü), ?aufgabe und ?termin (Treffer der Suche) öffnen einen Dialog nur einmal
  const einmal = ["neu", "aufgabe", "termin"].filter((p) => u.searchParams.has(p));
  if (!einmal.length) return;
  for (const p of einmal) u.searchParams.delete(p);
  window.history.replaceState(null, "", u.pathname + u.search + u.hash);
}

export function FormularDialog({ titel, beschreibung, breit, ausloeser, beiSchliessen, startOffen, children }: Props) {
  const [offen, setOffen] = useState(!ausloeser || !!startOffen);
  const [geaendert, setGeaendert] = useState(false);
  const [nachfrage, setNachfrage] = useState(false);
  const [schluessel, setSchluessel] = useState(0);

  const schliessen = () => {
    setOffen(false);
    setGeaendert(false);
    setNachfrage(false);
    if (startOffen) neuParameterEntfernen();
    beiSchliessen?.();
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
      {ausloeser && <DialogTrigger asChild>{ausloeser}</DialogTrigger>}
      <DialogContent title={titel} description={beschreibung} wide={breit}>
        {nachfrage && (
          <div role="alertdialog" aria-label="Ungespeicherte Änderungen" className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-tone-amber-bg px-4 py-3 text-sm text-tone-amber-fg">
            <span className="flex-1">Es gibt ungespeicherte Änderungen.</span>
            <Button size="sm" onClick={() => setNachfrage(false)}>Weiter bearbeiten</Button>
            <Button size="sm" variant="danger" onClick={schliessen}>Verwerfen</Button>
          </div>
        )}
        <div key={schluessel}>
          {children({ aenderung: () => setGeaendert(true), fertig: schliessen, abbrechen: () => oeffnenAendern(false), gespeichert: () => setGeaendert(false) })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
