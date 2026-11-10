"use client";

import { Clock, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { stunden, stundenText, ZEIT_ART_MIT_BEZUG, ZEIT_ART_TEXT, ZEIT_ARTEN, type ZeitArt } from "@/lib/team";
import { AuftragSuche, type AuftragWahl } from "../montageplan/einsatz-dialog";
import { zeitLoeschen, zeitSpeichern, type Ergebnis } from "./aktionen";

export type ZeitDialogDaten = { mitarbeiter: { id: string; name: string }[]; beginn: string; ende: string; heute: string };
export type ZeitBuchung = {
  id: string;
  datum: string;
  beginn: string;
  ende: string;
  pause_min: number;
  art: ZeitArt;
  taetigkeit: string | null;
  mitarbeiter: { id: string; name: string };
  auftrag: AuftragWahl | null;
};

type Props = {
  daten: ZeitDialogDaten;
  /** Bearbeiten einer offenen Buchung */
  buchung?: ZeitBuchung;
  /** Vorbelegung beim Eintragen (z. B. von Auftrags- oder Mitarbeiterseite) */
  vorlage?: { mitarbeiter_id?: string; auftrag?: AuftragWahl };
  /** Auslöser; ohne Auslöser ist der Dialog beim Einblenden offen */
  ausloeser?: ReactNode;
  beiSchliessen?: () => void;
};

/** Zeit eintragen oder bearbeiten */
export function ZeitDialog(p: Props) {
  return (
    <FormularDialog
      titel={p.buchung ? "Zeit bearbeiten" : "Zeit eintragen"}
      breit
      beiSchliessen={p.beiSchliessen}
      ausloeser={
        p.ausloeser === undefined && !p.beiSchliessen ? (
          <Button variant="primary">
            <Clock className="size-[15px]" />
            Zeit eintragen
          </Button>
        ) : (
          p.ausloeser
        )
      }
    >
      {(s) => <ZeitFormular {...p} s={s} />}
    </FormularDialog>
  );
}

function ZeitFormular({ daten, buchung: z, vorlage, s }: Props & { s: FormularSteuerung }) {
  const [e, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await zeitSpeichern(v, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const [loeschFehler, setLoeschFehler] = useState<string>();
  const [loescht, loeschen] = useTransition();
  const [art, setArt] = useState<ZeitArt>(z?.art ?? "montage");
  const [auftrag, setAuftrag] = useState<AuftragWahl | null>(z?.auftrag ?? vorlage?.auftrag ?? null);
  const [beginn, setBeginn] = useState(z?.beginn ?? daten.beginn);
  const [ende, setEnde] = useState(z?.ende ?? daten.ende);
  const [pause, setPause] = useState(String(z?.pause_min ?? 30));
  const f = e.felder ?? {};
  const pflicht = ZEIT_ART_MIT_BEZUG.includes(art);
  const h = /^\d\d:\d\d$/.test(beginn) && /^\d\d:\d\d$/.test(ende) ? stunden(beginn, ende, Number(pause) || 0) : 0;
  // Ein deaktivierter Mitarbeiter einer bestehenden Buchung bleibt wählbar
  const mitarbeiter = z && !daten.mitarbeiter.some((m) => m.id === z.mitarbeiter.id) ? [...daten.mitarbeiter, z.mitarbeiter] : daten.mitarbeiter;

  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {z && <input type="hidden" name="id" value={z.id} />}
      <input type="hidden" name="auftrag_id" value={auftrag?.id ?? ""} />
      {(e.fehler || loeschFehler) && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{e.fehler ?? loeschFehler}</p>}

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Mitarbeiter *" error={f.mitarbeiter_id}>
          {(p) => (
            <Select name="mitarbeiter_id" defaultValue={z?.mitarbeiter.id ?? vorlage?.mitarbeiter_id} onValueChange={s.aenderung}>
              <SelectTrigger id={p.id}><SelectValue placeholder="Bitte wählen …" /></SelectTrigger>
              <SelectContent>{mitarbeiter.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Art *" error={f.art}>
          {(p) => (
            <Select name="art" value={art} onValueChange={(v) => { setArt(v as ZeitArt); s.aenderung(); }}>
              <SelectTrigger id={p.id}><SelectValue /></SelectTrigger>
              <SelectContent>{ZEIT_ARTEN.map((a) => <SelectItem key={a} value={a}>{ZEIT_ART_TEXT[a]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-3">Auftrag{pflicht ? " *" : " (optional)"}</span>
        {auftrag ? (
          <div className="flex h-[42px] items-center justify-between gap-2 rounded-md border border-line bg-surface-muted px-[13px]">
            <span className="min-w-0 truncate">
              <span className="font-mono text-[13px]">{auftrag.nummer}</span> · <b className="font-medium">{auftrag.kunde}</b>
              {auftrag.titel && <span className="text-muted"> · {auftrag.titel}</span>}
            </span>
            <Button size="xs" variant="ghost" onClick={() => { setAuftrag(null); s.aenderung(); }}>Ändern</Button>
          </div>
        ) : (
          <AuftragSuche auchAbgeschlossene onWahl={(a) => { setAuftrag(a); s.aenderung(); }} fehler={f.auftrag} />
        )}
        {!pflicht && !auftrag && <small className="text-xs text-muted-2">Lager / Werkstatt, Fahrt und Büro dürfen ohne Auftrag gebucht werden.</small>}
      </div>

      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
        <Field label="Datum *" error={f.datum}>{(p) => <Input {...p} name="datum" type="date" defaultValue={z?.datum ?? daten.heute} />}</Field>
        <Field label="Beginn *" error={f.beginn}>{(p) => <Input {...p} name="beginn" type="time" step={300} value={beginn} onChange={(x) => setBeginn(x.target.value)} />}</Field>
        <Field label="Ende *" error={f.ende}>{(p) => <Input {...p} name="ende" type="time" step={300} value={ende} onChange={(x) => setEnde(x.target.value)} />}</Field>
        <Field label="Pause (Min.)" error={f.pause_min}>{(p) => <Input {...p} name="pause_min" inputMode="numeric" value={pause} onChange={(x) => setPause(x.target.value)} />}</Field>
      </div>
      <Field label="Tätigkeit">{(p) => <Input {...p} name="taetigkeit" defaultValue={z?.taetigkeit ?? ""} placeholder="z. B. Haustür eingesetzt, Anschlüsse" />}</Field>

      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        <span className="flex items-center gap-3">
          {z && (
            <Bestaetigen
              titel="Buchung löschen?"
              text="Die Buchung wird als gelöscht markiert und zählt nicht mehr in den Summen. Die Daten bleiben im Protokoll erhalten."
              knopf="Löschen"
              gefahr
              ausfuehren={() =>
                loeschen(async () => {
                  const r = await zeitLoeschen(z.id);
                  if (r.ok) s.fertig();
                  else setLoeschFehler(r.fehler);
                })
              }
            >
              <Button variant="danger" disabled={loescht}>
                <Trash2 className="size-[15px]" />
                Löschen
              </Button>
            </Bestaetigen>
          )}
          <span className="text-sm text-muted" aria-live="polite">= <b className="font-semibold text-ink">{stundenText(h)}</b></span>
        </span>
        <span className="flex gap-2.5">
          <Button onClick={s.abbrechen}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : z ? "Speichern" : "Eintragen"}</Button>
        </span>
      </div>
    </Formular>
  );
}
