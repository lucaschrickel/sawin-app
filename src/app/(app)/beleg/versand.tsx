"use client";

import { Download, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Formular } from "@/components/ui/formular";
import { adressenLesen, mailtoLink, MAILTO_GRENZE } from "@/lib/versand";
import { belegVersenden } from "./aktionen";

export type VersandVorlage = { an: string; bcc: string; betreff: string; text: string };

type Props = {
  belegId: string;
  /** PDF-Adresse des Belegs (ohne ?download) */
  pdf: string;
  dateiname: string;
  vorlage: VersandVorlage;
  /** Angebot und AB: diese Version wird beim Versenden eingefroren */
  version: number | null;
  /** zusätzlicher Anhang, z. B. die Rechnung zur Zahlungsbestätigung (eigenes, unverändertes Lexware-PDF) */
  zusatz?: { text: string; href: string } | null;
};

/** Beim Herunterladen ein unsichtbarer Link, damit der Browser den Dateinamen vom Server nimmt */
function herunterladen(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * „Versenden“ (vorläufig, CLAUDE.md „Versand in Version 1“): Empfänger, interne Kopie, Betreff und Text prüfen;
 * danach lädt der Browser das PDF herunter und Outlook öffnet sich per mailto. Den Anhang fügt das Büro selbst hinzu.
 */
export function VersendenDialog(p: Props) {
  return (
    <FormularDialog
      titel="Versenden"
      beschreibung="Outlook öffnet sich mit Empfänger, Betreff und Text. Das PDF wird heruntergeladen; bitte in Outlook anhängen."
      breit
      ausloeser={
        <Button data-aktion="versenden">
          <Mail className="size-4" /> Versenden
        </Button>
      }
    >
      {(s) => <VersendenFormular {...p} s={s} />}
    </FormularDialog>
  );
}

function VersendenFormular({ belegId, pdf, dateiname, vorlage, version, zusatz, s }: Props & { s: FormularSteuerung }) {
  const [an, setAn] = useState(vorlage.an);
  const [bcc, setBcc] = useState(vorlage.bcc);
  const [betreff, setBetreff] = useState(vorlage.betreff);
  const [text, setText] = useState(vorlage.text);
  const [fehler, setFehler] = useState<string>();
  const [fertig, setFertig] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();
  const aendern = (setze: (v: string) => void) => (v: string) => { setze(v); s.aenderung(); };
  const link = mailtoLink({ an: adressenLesen(an) ?? [], bcc: adressenLesen(bcc) ?? [], betreff, text });
  const zuLang = link.length > MAILTO_GRENZE;

  const outlookOeffnen = (l: string) => {
    // für die Browser-Tests nachvollziehbar, welcher Link geöffnet wurde
    document.documentElement.dataset.mailto = l;
    window.location.href = l;
  };
  const versenden = () =>
    starten(async () => {
      setFehler(undefined);
      const r = await belegVersenden(belegId, { an, bcc, betreff, text });
      if (!r.ok) return setFehler(r.fehler);
      s.gespeichert();
      herunterladen(`${pdf}?download=1`);
      // Outlook erst nach dem Start des Downloads öffnen, sonst bricht manch ein Browser den Download ab
      window.setTimeout(() => outlookOeffnen(link), 600);
      setFertig(r.datei ?? dateiname);
    });

  if (fertig) {
    return (
      <div className="flex flex-col gap-4" data-versand-fertig>
        <p className="rounded-md bg-tone-green-bg px-3.5 py-2.5 text-sm text-tone-green-fg" role="status">
          Outlook ist geöffnet. Bitte <b>{fertig}</b> aus dem Download-Ordner anhängen und senden.
          {version ? ` Version ${version} ist eingefroren.` : ""}
        </p>
        {zusatz && (
          <p className="text-sm text-muted">
            Bitte zusätzlich anhängen:{" "}
            <a href={zusatz.href} className="text-accent-text hover:underline" data-zusatz-download>
              {zusatz.text}
            </a>{" "}
            (eigenes, unverändertes PDF).
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button onClick={() => herunterladen(`${pdf}?download=1`)}>
            <Download className="size-4" /> PDF noch einmal herunterladen
          </Button>
          <Button onClick={() => outlookOeffnen(link)}>
            <Mail className="size-4" /> Outlook noch einmal öffnen
          </Button>
          <Button variant="primary" onClick={s.fertig}>Schließen</Button>
        </div>
      </div>
    );
  }

  return (
    <Formular aktion={versenden} className="flex flex-col gap-4" data-versand-formular>
      {fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{fehler}</p>}
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="An *" hint="Mehrere Adressen mit Komma trennen">{(f) => <Input {...f} name="an" value={an} onChange={(e) => aendern(setAn)(e.target.value)} required />}</Field>
        <Field label="Interne Kopie (BCC)" hint="Vorbelegt je Belegart, leer lassen möglich">{(f) => <Input {...f} name="bcc" value={bcc} onChange={(e) => aendern(setBcc)(e.target.value)} />}</Field>
      </div>
      <Field label="Betreff *">{(f) => <Input {...f} name="betreff" value={betreff} onChange={(e) => aendern(setBetreff)(e.target.value)} required />}</Field>
      <Field label="Text" hint={zuLang ? "Der Text ist für Outlook zu lang (mailto). Bitte kürzen." : undefined} error={zuLang ? "Zu lang für mailto" : undefined}>
        {(f) => <Textarea {...f} name="text" rows={8} value={text} onChange={(e) => aendern(setText)(e.target.value)} />}
      </Field>
      <p className="flex items-center gap-2 rounded-md bg-surface-muted px-3.5 py-2.5 text-sm text-ink-3">
        <Download className="size-4 shrink-0" />
        Anhang: <b className="font-medium">{dateiname}</b>
        {version ? <span className="text-muted-2">· Version {version} wird eingefroren</span> : null}
      </p>
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft || zuLang}>
          <Mail className="size-4" /> {laeuft ? "Bereite vor …" : "In Outlook öffnen"}
        </Button>
      </div>
    </Formular>
  );
}
