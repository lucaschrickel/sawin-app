"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { FormularDialog } from "@/components/ui/formular-dialog";
import { PLATZHALTER, zahlungsbedingungFuellen } from "@/lib/beleg-typen";
import { BELEGART_TEXT, type Belegart } from "@/lib/belege-status";
import type { Zahlungsbedingung } from "@/lib/belege";
import { eur } from "@/lib/format";
import { gueltigkeitSpeichern, zahlungsbedingungLoeschen, zahlungsbedingungSpeichern, type Ergebnis } from "./aktionen";

const ARTEN: Belegart[] = ["angebot", "auftragsbestaetigung", "rechnung", "abschlagsrechnung", "gutschrift"];

export function GueltigkeitFormular({ tage }: { tage: number }) {
  const [geaendert, setGeaendert] = useState(false);
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await gueltigkeitSpeichern(v, fd);
    if (r.ok) setGeaendert(false);
    return r;
  }, {});
  return (
    <Formular aktion={aktion} onInput={() => setGeaendert(true)} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-3">
        Gültigkeit neuer Angebote (Tage)
        <input name="tage" inputMode="numeric" defaultValue={tage} className="h-[42px] w-28 rounded-md border border-line bg-surface px-3 text-[15px]" />
      </label>
      <Button type="submit" variant={geaendert ? "primary" : "secondary"} disabled={laeuft || !geaendert}>Speichern</Button>
      {!geaendert && z.hinweis && <span role="status" className="pb-2.5 text-sm text-tone-green-fg">{z.hinweis}</span>}
      {z.fehler && <p role="alert" className="basis-full rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler}</p>}
    </Formular>
  );
}

export function ZahlungsbedingungenListe({ liste }: { liste: Zahlungsbedingung[] }) {
  const [laeuft, starte] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col" data-zahlungsbedingungen>
        {liste.map((z) => (
          <li key={z.id} className="flex items-start gap-3 border-t border-line-soft py-3 first:border-t-0" data-zahlungsbedingung={z.name}>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{z.name}</div>
              <div className="text-xs text-muted-2">
                Ziel {z.zahlungsziel_tage} Tage{z.skonto_prozent != null ? ` · ${String(z.skonto_prozent).replace(".", ",")} % Skonto in ${z.skontoziel_tage} Tagen` : ""}
                {z.standard_fuer.length > 0 && ` · Standard für ${z.standard_fuer.map((a) => BELEGART_TEXT[a]).join(", ")}`}
              </div>
              <p className="mt-1 text-sm whitespace-pre-line text-muted">{z.text}</p>
            </div>
            <ZahlungsbedingungDialog bedingung={z} />
            <Bestaetigen titel="Zahlungsbedingung löschen?" text={`„${z.name}“ wird gelöscht. Belege behalten ihren Text.`} knopf="Löschen" gefahr ausfuehren={() => starte(async () => void (await zahlungsbedingungLoeschen(z.id)))}>
              <button type="button" disabled={laeuft} aria-label={`${z.name} löschen`} className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-tone-red-fg">
                <Trash2 className="size-4" />
              </button>
            </Bestaetigen>
          </li>
        ))}
      </ul>
      {!liste.length && <p className="text-sm text-muted">Noch keine Zahlungsbedingungen.</p>}
      <div>
        <ZahlungsbedingungDialog />
      </div>
    </div>
  );
}

function ZahlungsbedingungDialog({ bedingung }: { bedingung?: Zahlungsbedingung }) {
  return (
    <FormularDialog
      titel={bedingung ? "Zahlungsbedingung bearbeiten" : "Neue Zahlungsbedingung"}
      breit
      ausloeser={
        bedingung ? (
          <button type="button" aria-label={`${bedingung.name} bearbeiten`} className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-ink">
            <Pencil className="size-4" />
          </button>
        ) : (
          <Button size="sm" data-neue-zahlungsbedingung>
            <Plus className="size-4" /> Zahlungsbedingung
          </Button>
        )
      }
    >
      {(s) => <ZahlungsbedingungFormular bedingung={bedingung} fertig={s.fertig} abbrechen={s.abbrechen} aenderung={s.aenderung} />}
    </FormularDialog>
  );
}

function ZahlungsbedingungFormular({ bedingung: b, fertig, abbrechen, aenderung }: { bedingung?: Zahlungsbedingung; fertig: () => void; abbrechen: () => void; aenderung: () => void }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await zahlungsbedingungSpeichern(v, fd);
    if (r.ok) fertig();
    return r;
  }, {});
  const [text, setText] = useState(b?.text ?? "Zahlbar innerhalb von {Zahlungsziel} Tagen bis zum {Fälligkeitsdatum} ohne Abzug.");
  const [ziel, setZiel] = useState(String(b?.zahlungsziel_tage ?? 14));
  const [skZiel, setSkZiel] = useState(b?.skontoziel_tage != null ? String(b.skontoziel_tage) : "");
  const [sk, setSk] = useState(b?.skonto_prozent != null ? String(b.skonto_prozent).replace(".", ",") : "");
  const feld = useRef<HTMLTextAreaElement>(null);
  const f = z.felder ?? {};
  const heute = new Date().toISOString().slice(0, 10);
  const beispiel = zahlungsbedingungFuellen(text, { datum: heute, brutto: 1190, zahlungsziel: Number(ziel) || 0, skontoziel: skZiel ? Number(skZiel) : null, skonto: sk ? Number(sk.replace(",", ".")) : null });
  return (
    <Formular aktion={aktion} onInput={aenderung} className="flex flex-col gap-4">
      {b && <input type="hidden" name="id" value={b.id} />}
      {z.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler}</p>}
      <Field label="Name *" error={f.name}>{(a) => <Input {...a} name="name" defaultValue={b?.name} required autoFocus />}</Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Zahlungsziel (Tage)" error={f.zahlungsziel_tage}>{(a) => <Input {...a} name="zahlungsziel_tage" inputMode="numeric" value={ziel} onChange={(e) => setZiel(e.target.value)} />}</Field>
        <Field label="Skontoziel (Tage)" error={f.skontoziel_tage}>{(a) => <Input {...a} name="skontoziel_tage" inputMode="numeric" value={skZiel} onChange={(e) => setSkZiel(e.target.value)} />}</Field>
        <Field label="Skonto %" error={f.skonto_prozent}>{(a) => <Input {...a} name="skonto_prozent" inputMode="decimal" value={sk} onChange={(e) => setSk(e.target.value)} />}</Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink-3">Text *</span>
          <span className="flex flex-wrap gap-1">
            {PLATZHALTER.map((ph) => (
              <button
                key={ph}
                type="button"
                className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[11px] hover:border-line-strong"
                onClick={() => {
                  const el = feld.current;
                  const a = el?.selectionStart ?? text.length;
                  const e = el?.selectionEnd ?? text.length;
                  setText(text.slice(0, a) + ph + text.slice(e));
                  aenderung();
                }}
              >
                {ph}
              </button>
            ))}
          </span>
        </div>
        <Textarea ref={feld} name="text" rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!!f.text} />
        <p className="text-xs text-muted-2">Beispiel bei {eur(1190)} und Belegdatum heute: {beispiel}</p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink-3">Belegarten (leer = alle) und Standard</legend>
        {ARTEN.map((a) => (
          <div key={a} className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <label className="inline-flex w-48 items-center gap-2"><input type="checkbox" name="belegarten" value={a} defaultChecked={b?.belegarten.includes(a)} /> {BELEGART_TEXT[a]}</label>
            <label className="inline-flex items-center gap-2 text-muted"><input type="checkbox" name="standard_fuer" value={a} defaultChecked={b?.standard_fuer.includes(a)} /> Standard</label>
          </div>
        ))}
      </fieldset>
      <div className="flex justify-end gap-2.5">
        <Button onClick={abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>Speichern</Button>
      </div>
    </Formular>
  );
}
