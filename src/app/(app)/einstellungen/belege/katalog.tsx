"use client";

import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { FormularDialog } from "@/components/ui/formular-dialog";
import { RichText } from "@/components/ui/rich-text";
import { EINHEITEN, htmlZuText } from "@/lib/beleg-typen";
import { BELEGART_TEXT, type Belegart } from "@/lib/belege-status";
import type { Artikel, Textvorlage } from "@/lib/belege";
import { cn } from "@/lib/cn";
import { eur } from "@/lib/format";
import { artikelLoeschen, artikelSpeichern, artikelStern, textvorlageLoeschen, textvorlageSpeichern, type Ergebnis } from "./aktionen";

/* Einstellungen › Belege: Artikelkatalog (Stern = Schnellauswahl im Editor) und Textvorlagen für alle Belegarten */

const loeschKnopf = "inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-tone-red-fg";
const bearbeitenKnopf = "inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-ink";

// ---------------------------------------------------------------------------------------------------------------------
// Artikelkatalog
// ---------------------------------------------------------------------------------------------------------------------

export function ArtikelListe({ liste }: { liste: Artikel[] }) {
  const [laeuft, starte] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col" data-artikelliste>
        {liste.map((a) => (
          <li key={a.id} className="flex items-start gap-3 border-t border-line-soft py-3 first:border-t-0" data-artikel={a.bezeichnung}>
            <button
              type="button"
              disabled={laeuft}
              aria-pressed={a.schnellauswahl}
              aria-label={a.schnellauswahl ? `${a.bezeichnung} aus der Schnellauswahl nehmen` : `${a.bezeichnung} in die Schnellauswahl`}
              title="Schnellauswahl im Beleg-Editor"
              data-stern
              onClick={() => starte(async () => void (await artikelStern(a.id, !a.schnellauswahl)))}
              className={cn("mt-0.5 inline-flex size-7 items-center justify-center rounded-full hover:bg-surface-sunken", a.schnellauswahl ? "text-accent-text" : "text-muted-2")}
            >
              <Star className={cn("size-4", a.schnellauswahl && "fill-current")} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{a.bezeichnung}</span>
                <span className="text-sm tabular text-muted">
                  {eur(a.preis_netto)} netto / {a.einheit}
                </span>
              </div>
              {a.beschreibung_html && <p className="mt-0.5 line-clamp-2 text-sm whitespace-pre-line text-muted">{htmlZuText(a.beschreibung_html)}</p>}
            </div>
            <ArtikelDialog artikel={a} />
            <Bestaetigen
              titel="Artikel löschen?"
              text={`„${a.bezeichnung}“ wird gelöscht. Belege behalten ihre Positionen.`}
              knopf="Löschen"
              gefahr
              ausfuehren={() => starte(async () => void (await artikelLoeschen(a.id)))}
            >
              <button type="button" disabled={laeuft} aria-label={`${a.bezeichnung} löschen`} className={loeschKnopf}>
                <Trash2 className="size-4" />
              </button>
            </Bestaetigen>
          </li>
        ))}
      </ul>
      {!liste.length && <p className="text-sm text-muted">Noch keine Artikel.</p>}
      <div>
        <ArtikelDialog />
      </div>
    </div>
  );
}

function ArtikelDialog({ artikel }: { artikel?: Artikel }) {
  return (
    <FormularDialog
      titel={artikel ? "Artikel bearbeiten" : "Neuer Artikel"}
      breit
      ausloeser={
        artikel ? (
          <button type="button" aria-label={`${artikel.bezeichnung} bearbeiten`} className={bearbeitenKnopf}>
            <Pencil className="size-4" />
          </button>
        ) : (
          <Button size="sm" data-neuer-artikel>
            <Plus className="size-4" /> Artikel
          </Button>
        )
      }
    >
      {(s) => <ArtikelFormular artikel={artikel} fertig={s.fertig} abbrechen={s.abbrechen} aenderung={s.aenderung} />}
    </FormularDialog>
  );
}

function ArtikelFormular({ artikel: a, fertig, abbrechen, aenderung }: { artikel?: Artikel; fertig: () => void; abbrechen: () => void; aenderung: () => void }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await artikelSpeichern(v, fd);
    if (r.ok) fertig();
    return r;
  }, {});
  const [beschreibung, setBeschreibung] = useState(a?.beschreibung_html ?? "");
  const f = z.felder ?? {};
  return (
    <Formular aktion={aktion} onInput={aenderung} className="flex flex-col gap-4" data-artikel-formular>
      {a && <input type="hidden" name="id" value={a.id} />}
      <input type="hidden" name="beschreibung" value={beschreibung} />
      {z.fehler && (
        <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">
          {z.fehler}
        </p>
      )}
      <Field label="Bezeichnung *" error={f.bezeichnung}>
        {(p) => <Input {...p} name="bezeichnung" defaultValue={a?.bezeichnung} required autoFocus />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Einheit">{(p) => <Input {...p} name="einheit" list="artikel-einheiten" defaultValue={a?.einheit ?? "Stk"} />}</Field>
        <Field label="Preis netto (€)" error={f.preis_netto}>
          {(p) => <Input {...p} name="preis_netto" inputMode="decimal" className="text-right" defaultValue={a ? String(a.preis_netto).replace(".", ",") : ""} />}
        </Field>
      </div>
      <datalist id="artikel-einheiten">
        {EINHEITEN.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <div className="flex flex-col gap-1.5 pt-8">
        <span className="text-sm font-medium text-ink-3">Beschreibung (wird als Positionsbeschreibung übernommen)</span>
        <RichText
          label="Beschreibung des Artikels"
          wert={beschreibung}
          onChange={(html) => {
            setBeschreibung(html);
            aenderung();
          }}
        />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="schnellauswahl" defaultChecked={a?.schnellauswahl} /> Schnellauswahl (Knopf im Beleg-Editor)
      </label>
      <div className="flex justify-end gap-2.5">
        <Button onClick={abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>
          Speichern
        </Button>
      </div>
    </Formular>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Textvorlagen
// ---------------------------------------------------------------------------------------------------------------------

export const FELD_TEXT: Record<Textvorlage["feld"], string> = { einleitung: "Einleitung", lieferbedingungen: "Lieferbedingungen", nachbemerkung: "Nachbemerkung" };
const VORLAGE_ARTEN: Belegart[] = ["angebot", "auftragsbestaetigung", "teil_ab", "lieferschein", "abschlagsrechnung", "rechnung", "gutschrift"];

export function TextvorlagenListe({ liste }: { liste: Textvorlage[] }) {
  const [laeuft, starte] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col" data-textvorlagen>
        {liste.map((v) => (
          <li key={v.id} className="flex items-start gap-3 border-t border-line-soft py-3 first:border-t-0" data-textvorlage={v.name}>
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {v.name}
                {v.standard && <span className="ml-2 rounded-full bg-tone-blue-bg px-2 py-0.5 text-[11px] text-tone-blue-fg">Standard</span>}
              </div>
              <div className="text-xs text-muted-2">
                {FELD_TEXT[v.feld]} · {v.belegarten.length ? v.belegarten.map((a) => BELEGART_TEXT[a]).join(", ") : "alle Belegarten"}
              </div>
              <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-muted">{v.text}</p>
            </div>
            <TextvorlageDialog vorlage={v} />
            <Bestaetigen
              titel="Vorlage löschen?"
              text={`„${v.name}“ wird gelöscht. Belege behalten ihren Text.`}
              knopf="Löschen"
              gefahr
              ausfuehren={() => starte(async () => void (await textvorlageLoeschen(v.id)))}
            >
              <button type="button" disabled={laeuft} aria-label={`${v.name} löschen`} className={loeschKnopf}>
                <Trash2 className="size-4" />
              </button>
            </Bestaetigen>
          </li>
        ))}
      </ul>
      {!liste.length && <p className="text-sm text-muted">Noch keine Textvorlagen.</p>}
      <div>
        <TextvorlageDialog />
      </div>
    </div>
  );
}

function TextvorlageDialog({ vorlage }: { vorlage?: Textvorlage }) {
  return (
    <FormularDialog
      titel={vorlage ? "Textvorlage bearbeiten" : "Neue Textvorlage"}
      breit
      ausloeser={
        vorlage ? (
          <button type="button" aria-label={`${vorlage.name} bearbeiten`} className={bearbeitenKnopf}>
            <Pencil className="size-4" />
          </button>
        ) : (
          <Button size="sm" data-neue-textvorlage>
            <Plus className="size-4" /> Textvorlage
          </Button>
        )
      }
    >
      {(s) => <TextvorlageFormular vorlage={vorlage} fertig={s.fertig} abbrechen={s.abbrechen} aenderung={s.aenderung} />}
    </FormularDialog>
  );
}

function TextvorlageFormular({ vorlage: v, fertig, abbrechen, aenderung }: { vorlage?: Textvorlage; fertig: () => void; abbrechen: () => void; aenderung: () => void }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (alt, fd) => {
    const r = await textvorlageSpeichern(alt, fd);
    if (r.ok) fertig();
    return r;
  }, {});
  const f = z.felder ?? {};
  return (
    <Formular aktion={aktion} onInput={aenderung} className="flex flex-col gap-4" data-textvorlage-formular>
      {v && <input type="hidden" name="id" value={v.id} />}
      {z.fehler && (
        <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">
          {z.fehler}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name *" error={f.name}>
          {(p) => <Input {...p} name="name" defaultValue={v?.name} required autoFocus />}
        </Field>
        <Field label="Feld" error={f.feld}>
          {(p) => (
            <select {...p} name="feld" defaultValue={v?.feld ?? "einleitung"} className="h-[42px] rounded-md border border-line bg-surface px-3 text-[15px]">
              {(Object.keys(FELD_TEXT) as Textvorlage["feld"][]).map((x) => (
                <option key={x} value={x}>
                  {FELD_TEXT[x]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Text *" error={f.text}>
        {(p) => <Textarea {...p} name="text" rows={5} defaultValue={v?.text} />}
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-ink-3">Belegarten (leer = alle)</legend>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm">
          {VORLAGE_ARTEN.map((a) => (
            <label key={a} className="inline-flex items-center gap-2">
              <input type="checkbox" name="belegarten" value={a} defaultChecked={v?.belegarten.includes(a)} /> {BELEGART_TEXT[a]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="standard" defaultChecked={v?.standard} /> Standard (wird bei neuen Belegen vorbelegt)
      </label>
      <div className="flex justify-end gap-2.5">
        <Button onClick={abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>
          Speichern
        </Button>
      </div>
    </Formular>
  );
}
