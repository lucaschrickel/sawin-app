"use client";

import Link from "next/link";
import { Search, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Formular } from "@/components/ui/formular";
import type { Monteur, TafelEinsatz } from "@/lib/montageplan";
import { auftraegeSuchen, einsatzLoeschen, einsatzSpeichern, monteurSpeichern, type AuftragTreffer, type Ergebnis } from "./aktionen";

export type AuftragWahl = { id: string; nummer: string; titel: string; kunde: string };
export type DialogVorlage = { einsatz: TafelEinsatz } | { beginn: string; ende: string; monteure: string[]; auftrag?: AuftragWahl };

/** Termin-Dialog: Einsatz anlegen oder ändern (Auftrag, Zeitraum, Monteure, Freigabe, Hinweis), löschen */
export function EinsatzDialog({ vorlage, monteure, beiSchliessen, beiErgebnis }: { vorlage: DialogVorlage; monteure: Monteur[]; beiSchliessen: () => void; beiErgebnis: (r: Ergebnis) => void }) {
  const e = "einsatz" in vorlage ? vorlage.einsatz : null;
  return (
    <FormularDialog titel={e ? "Einsatz" : "Einsatz planen"} breit beiSchliessen={beiSchliessen}>
      {(s) => <EinsatzFormular vorlage={vorlage} monteure={monteure} s={s} beiErgebnis={beiErgebnis} />}
    </FormularDialog>
  );
}

function EinsatzFormular({ vorlage, monteure, s, beiErgebnis }: { vorlage: DialogVorlage; monteure: Monteur[]; s: FormularSteuerung; beiErgebnis: (r: Ergebnis) => void }) {
  const e = "einsatz" in vorlage ? vorlage.einsatz : null;
  const [auftrag, setAuftrag] = useState<AuftragWahl | null>(e?.auftrag ?? ("auftrag" in vorlage ? (vorlage.auftrag ?? null) : null));
  const [beginn, setBeginn] = useState(e?.beginn ?? ("beginn" in vorlage ? vorlage.beginn : ""));
  const [ende, setEnde] = useState(e?.ende ?? ("ende" in vorlage ? vorlage.ende : ""));
  const [team, setTeam] = useState<string[]>(e?.monteure ?? ("monteure" in vorlage ? vorlage.monteure : []));
  const [fest, setFest] = useState(e?.fest ?? false);
  const [hinweis, setHinweis] = useState(e?.hinweis ?? "");
  const [fehler, setFehler] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  const aendern = <T,>(setze: (v: T) => void) => (v: T) => { setze(v); s.aenderung(); };
  // Monteure, die im Einsatz stehen, aber inzwischen deaktiviert sind, bleiben wählbar
  const auswahl = [...monteure, ...(e?.monteure ?? []).filter((id) => !monteure.some((m) => m.id === id)).map((id) => ({ id, name: "Deaktivierter Monteur", kuerzel: "–" }))];

  const speichern = () =>
    starten(async () => {
      const r = await einsatzSpeichern({ id: e?.id ?? null, auftrag_id: auftrag?.id ?? "", beginn, ende, monteure: team, fest, hinweis });
      if (r.ok) {
        beiErgebnis(r);
        s.fertig();
      } else setFehler(r);
    });

  return (
    <Formular aktion={() => speichern()} className="flex flex-col gap-4">
      {fehler.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{fehler.fehler}</p>}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-3">Auftrag *</span>
        {auftrag ? (
          <div className="flex h-[42px] items-center justify-between gap-2 rounded-md border border-line bg-surface-muted px-[13px]">
            <span className="min-w-0 truncate">
              <span className="font-mono text-[13px]">{auftrag.nummer}</span> · <b className="font-medium">{auftrag.kunde}</b>
              {auftrag.titel && <span className="text-muted"> · {auftrag.titel}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {e && (
                <Link href={`/auftraege/${auftrag.id}`} className="rounded-sm px-2 py-1 text-sm text-accent-text hover:underline">Auftrag öffnen</Link>
              )}
              {!e && <Button size="xs" variant="ghost" onClick={() => aendern(setAuftrag)(null)}>Ändern</Button>}
            </span>
          </div>
        ) : (
          <AuftragSuche onWahl={aendern(setAuftrag)} fehler={fehler.felder?.auftrag} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Beginn *" error={fehler.felder?.beginn}>
          {(p) => <Input {...p} type="datetime-local" step={3600} value={beginn} onChange={(x) => aendern(setBeginn)(x.target.value)} />}
        </Field>
        <Field label="Ende *" error={fehler.felder?.ende}>
          {(p) => <Input {...p} type="datetime-local" step={3600} value={ende} onChange={(x) => aendern(setEnde)(x.target.value)} />}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-ink-3">Monteure *</legend>
        <div className="flex flex-wrap gap-2">
          {auswahl.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface-sunken">
              <input
                type="checkbox"
                name="monteure"
                value={m.id}
                checked={team.includes(m.id)}
                onChange={(x) => aendern(setTeam)(x.target.checked ? [...team, m.id] : team.filter((t) => t !== m.id))}
                className="size-4 [accent-color:var(--ink)]"
              />
              {m.name}
            </label>
          ))}
        </div>
        {fehler.felder?.monteure && <small className="text-xs text-tone-red-fg">{fehler.felder.monteure}</small>}
      </fieldset>

      <Field label="Hinweis für die Monteure">{(p) => <Textarea {...p} value={hinweis} onChange={(x) => aendern(setHinweis)(x.target.value)} placeholder="z. B. Schlüssel beim Nachbarn" />}</Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={fest} onChange={(x) => aendern(setFest)(x.target.checked)} className="size-4 [accent-color:var(--ink)]" />
        Fest einplanen und freigeben <span className="text-muted-2">(sonst vorgeplant)</span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        <span>
          {e && (
            <Bestaetigen
              titel="Einsatz löschen?"
              text="Der Einsatz wird als gelöscht markiert und verschwindet aus der Plantafel. Die Daten bleiben im Protokoll erhalten."
              knopf="Löschen"
              gefahr
              ausfuehren={() =>
                starten(async () => {
                  const r = await einsatzLoeschen(e.id);
                  if (r.ok) {
                    beiErgebnis({});
                    s.fertig();
                  } else setFehler(r);
                })
              }
            >
              <Button variant="danger" disabled={laeuft}>
                <Trash2 className="size-[15px]" />
                Löschen
              </Button>
            </Bestaetigen>
          )}
        </span>
        <span className="flex gap-2.5">
          <Button onClick={s.abbrechen}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : e ? "Speichern" : "Einplanen"}</Button>
        </span>
      </div>
    </Formular>
  );
}

/** Auftrag suchen (ab zwei Zeichen) und wählen; auch in der Zeiterfassung genutzt */
export function AuftragSuche({ onWahl, fehler, auchAbgeschlossene }: { onWahl: (a: AuftragWahl) => void; fehler?: string; auchAbgeschlossene?: boolean }) {
  const [q, setQ] = useState("");
  const [treffer, setTreffer] = useState<AuftragTreffer[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const suchen = (wert: string) => {
    setQ(wert);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => setTreffer(wert.trim().length >= 2 ? await auftraegeSuchen(wert, auchAbgeschlossene) : []), 250);
  };
  return (
    <div className="relative">
      <label className={`flex h-[42px] items-center gap-2 rounded-md border bg-surface px-[13px] ${fehler ? "border-tone-red-fg" : "border-line"}`}>
        <Search className="size-4 text-muted-2" aria-hidden="true" />
        <input
          aria-label="Auftrag suchen"
          role="combobox"
          aria-expanded={treffer.length > 0}
          aria-controls="auftrag-treffer"
          value={q}
          onChange={(x) => suchen(x.target.value)}
          placeholder="Auftragsnummer, Kunde oder Titel …"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        {q && (
          <button type="button" aria-label="Suche leeren" onClick={() => suchen("")} className="text-muted-2">
            <X className="size-4" />
          </button>
        )}
      </label>
      {fehler && <small className="mt-1 block text-xs text-tone-red-fg">{fehler}</small>}
      {treffer.length > 0 && (
        <ul id="auftrag-treffer" role="listbox" className="absolute top-[46px] right-0 left-0 z-10 max-h-64 overflow-y-auto rounded-md border border-line-soft bg-surface p-1 shadow-pop">
          {treffer.map((a) => (
            <li key={a.id} role="option" aria-selected={false}>
              <button type="button" onClick={() => { onWahl(a); setTreffer([]); setQ(""); }} className="flex w-full items-baseline gap-3 rounded-sm px-3 py-2 text-left hover:bg-canvas">
                <span className="font-mono text-[13px]">{a.nummer}</span>
                <span className="font-medium">{a.kunde}</span>
                <span className="truncate text-sm text-muted">{a.titel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && treffer.length === 0 && <small className="mt-1 block text-xs text-muted-2">{auchAbgeschlossene ? "Kein Auftrag gefunden." : "Kein offener Auftrag gefunden."}</small>}
    </div>
  );
}

/** Monteur anlegen oder umbenennen, direkt aus der Plantafel */
export function MonteurDialog({ monteur, ausloeser }: { monteur?: Monteur; ausloeser: ReactNode }) {
  return (
    <FormularDialog titel={monteur ? "Monteur umbenennen" : "Monteur hinzufügen"} ausloeser={ausloeser}>
      {(s) => <MonteurFormular monteur={monteur} s={s} />}
    </FormularDialog>
  );
}
function MonteurFormular({ monteur: m, s }: { monteur?: Monteur; s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await monteurSpeichern(v, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {m && <input type="hidden" name="id" value={m.id} />}
      {z.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
        <Field label="Name *" error={z.felder?.name}>{(p) => <Input {...p} name="name" defaultValue={m?.name} autoFocus />}</Field>
        <Field label="Kürzel *" error={z.felder?.kuerzel}>{(p) => <Input {...p} name="kuerzel" defaultValue={m?.kuerzel} maxLength={4} className="uppercase" />}</Field>
      </div>
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>{m ? "Speichern" : "Monteur anlegen"}</Button>
      </div>
    </Formular>
  );
}
