"use client";

import type { ReactNode } from "react";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "./dialog";

type BestaetigenProps = {
  titel: string;
  text: ReactNode;
  /** Beschriftung des Knopfs, der die Aktion ausführt */
  knopf: string;
  /** destruktiv: Knopf in Warnoptik */
  gefahr?: boolean;
  ausfuehren: () => void;
  /** Auslöser (z. B. ein Button) */
  children: ReactNode;
};

/** Nachfrage vor endgültigen oder destruktiven Schritten (nur dort, siehe CLAUDE.md „Minimalistisch bauen“). */
export function Bestaetigen({ titel, text, knopf, gefahr, ausfuehren, children }: BestaetigenProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={titel}>
        <div className="text-base text-ink-3">{text}</div>
        <div className="flex justify-end gap-2.5 pt-5">
          <DialogClose asChild>
            <Button>Abbrechen</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant={gefahr ? "danger" : "primary"} onClick={ausfuehren}>
              {knopf}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
