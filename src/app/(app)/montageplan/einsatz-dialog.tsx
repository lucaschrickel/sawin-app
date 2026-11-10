"use client";

import Link from "next/link";
import { Search, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Formular } from "@/components/ui/formular";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Monteur, Plan, TafelEinsatz, TafelFahrzeug } from "@/lib/montageplan";
import { bezugHref } from "@/lib/montageplan-text";
import { auftraegeSuchen, einsatzLoeschen, einsatzSpeichern, monteurSpeichern, ticketsSuchen, type AuftragTreffer, type Ergebnis } from "./aktionen";

export type AuftragWahl = { id: string; nummer: string; titel: string; kunde: string };
/** Gewählter Bezug eines Einsatzes: Auftrag (Montageplan) oder Service-Ticket (Service-Plan) */
export type BezugWahl = AuftragWahl & { art: "auftrag" | "ticket" };
export type DialogVorlage = { einsatz: TafelEinsatz } | { beginn: string; ende: string; monteure: string[]; bezug?: BezugWahl };


/** Prüftermine, die heute oder früher fällig waren (Hinweis im Termin-Dialog) */
function ueberfaellig(f: TafelFahrzeug, heute: string) {
  const termine: [string, string | null][] = [
    ["TÜV/HU", f.tuev_am],
    ["Service", f.service_am],
    ["UVV", f.uvv_am],
  ];
  return termine.filter(([, d]) => d && d < heute).map(([l]) => l);
}

type DialogProps = { plan: Plan; vorlage: DialogVorlage; monteure: Monteur[]; fahrzeuge: TafelFahrzeug[]; heute: string; beiSchliessen: () => void; beiErgebnis: (r: Ergebnis) => void };

/** Termin-Dialog: Einsatz anlegen oder ändern (Auftrag bzw. Ticket, Zeitraum, Monteure, Fahrzeug, Freigabe, Hinweis), löschen */
export function EinsatzDialog(p: DialogProps) {
  const e = "einsatz" in p.vorlage ? p.vorlage.einsatz : null;
  return (
    <FormularDialog titel={e ? "Einsatz" : "Einsatz planen"} breit beiSchliessen={p.beiSchliessen}>
      {(s) => <EinsatzFormular {...p} s={s} />}
    </FormularDialog>
  );
}

const OHNE = "ohne";

function EinsatzFormular({ plan, vorlage, monteure, fahrzeuge, heute, s, beiErgebnis }: DialogProps & { s: FormularSteuerung }) {
  const e = "einsatz" in vorlage ? vorlage.einsatz : null;
  const art = plan === "montage" ? "auftrag" : "ticket";
  const [auftrag, setAuftrag] = useState<BezugWahl | null>(e?.bezug ?? ("bezug" in vorlage ? (vorlage.bezug ?? null) : null));
  const [fahrzeugId, setFahrzeugId] = useState(e?.fahrzeug_id ?? OHNE);
  const fz = fahrzeuge.find((f) => f.id === fahrzeugId);
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
      const bezugArt = auftrag?.art ?? art;
      const r = await einsatzSpeichern({
        id: e?.id ?? null,
        auftrag_id: bezugArt === "auftrag" ? (auftrag?.id ?? "") : null,
        ticket_id: bezugArt === "ticket" ? (auftrag?.id ?? "") : null,
        fahrzeug_id: fahrzeugId === OHNE ? null : fahrzeugId,
        beginn,
        ende,
        monteure: team,
        fest,
        hinweis,
      });
      if (r.ok) {
        beiErgebnis(r);
        s.fertig();
      } else setFehler(r);
    });

  return (
    <Formular aktion={() => speichern()} className="flex flex-col gap-4">
      {fehler.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{fehler.fehler}</p>}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-3">{(auftrag?.art ?? art) === "auftrag" ? "Auftrag *" : "Service-Ticket *"}</span>
        {auftrag ? (
          <div className="flex h-[42px] items-center justify-between gap-2 rounded-md border border-line bg-surface-muted px-[13px]">
            <span className="min-w-0 truncate">
              <span className="font-mono text-[13px]">{auftrag.nummer}</span> · <b className="font-medium">{auftrag.kunde}</b>
              {auftrag.titel && <span className="text-muted"> · {auftrag.titel}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {e && (
                <Link href={bezugHref(auftrag)} className="rounded-sm px-2 py-1 text-sm text-accent-text hover:underline">{auftrag.art === "auftrag" ? "Auftrag öffnen" : "Ticket öffnen"}</Link>
              )}
              {!e && <Button size="xs" variant="ghost" onClick={() => aendern(setAuftrag)(null)}>Ändern</Button>}
            </span>
          </div>
        ) : (
          <BezugSuche art={art} onWahl={(a) => aendern(setAuftrag)({ ...a, art })} fehler={fehler.felder?.auftrag} />
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

      <Field label="Fahrzeug" error={fehler.felder?.fahrzeug} hint="Höchstens ein Fahrzeug je Einsatz">
        {(p) => (
          <Select value={fahrzeugId} onValueChange={(v) => aendern(setFahrzeugId)(v)}>
            <SelectTrigger id={p.id} aria-label="Fahrzeug"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={OHNE}>– ohne Fahrzeug –</SelectItem>
              {fahrzeuge.map((f) => <SelectItem key={f.id} value={f.id}>{f.kennzeichen}{f.typ ? " · " + f.typ : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </Field>
      {fz && ueberfaellig(fz, heute).length > 0 && (
        <p role="alert" data-pruefung className="-mt-2 rounded-md bg-tone-amber-bg px-3.5 py-2 text-sm text-tone-amber-fg">
          {fz.kennzeichen}: {ueberfaellig(fz, heute).join(", ")} überfällig.
        </p>
      )}

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
export function AuftragSuche(p: { onWahl: (a: AuftragWahl) => void; fehler?: string; auchAbgeschlossene?: boolean }) {
  return <BezugSuche art="auftrag" {...p} />;
}

/** Auftrag oder Service-Ticket suchen (ab zwei Zeichen) und wählen */
export function BezugSuche({ art, onWahl, fehler, auchAbgeschlossene }: { art: "auftrag" | "ticket"; onWahl: (a: AuftragWahl) => void; fehler?: string; auchAbgeschlossene?: boolean }) {
  const [q, setQ] = useState("");
  const [treffer, setTreffer] = useState<AuftragTreffer[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const suchen = (wert: string) => {
    setQ(wert);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => setTreffer(wert.trim().length >= 2 ? await (art === "auftrag" ? auftraegeSuchen(wert, auchAbgeschlossene) : ticketsSuchen(wert)) : []), 250);
  };
  return (
    <div className="relative">
      <label className={`flex h-[42px] items-center gap-2 rounded-md border bg-surface px-[13px] ${fehler ? "border-tone-red-fg" : "border-line"}`}>
        <Search className="size-4 text-muted-2" aria-hidden="true" />
        <input
          aria-label={art === "auftrag" ? "Auftrag suchen" : "Ticket suchen"}
          role="combobox"
          aria-expanded={treffer.length > 0}
          aria-controls="auftrag-treffer"
          value={q}
          onChange={(x) => suchen(x.target.value)}
          placeholder={art === "auftrag" ? "Auftragsnummer, Kunde oder Titel …" : "Ticketnummer, Kunde oder Thema …"}
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
      {q.trim().length >= 2 && treffer.length === 0 && <small className="mt-1 block text-xs text-muted-2">{art === "ticket" ? "Kein offenes Ticket gefunden." : auchAbgeschlossene ? "Kein Auftrag gefunden." : "Kein offener Auftrag gefunden."}</small>}
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
