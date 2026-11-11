"use client";

import { AlertTriangle, Printer, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Formular } from "@/components/ui/formular";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { Monteur, TafelEinsatz, TafelFahrzeug, TafelRessource } from "@/lib/montageplan";
import { istHex, PLAN_FARBEN, schriftAuf, type TafelKolonne } from "@/lib/plantafel-logik";
import { lokalKurz } from "@/lib/woche";
import type { Ergebnis } from "./aktionen";
import { einsaetzeFreigeben, kolonneLoeschen, kolonneMonteur, kolonneSpeichern, ressourceLoeschen, ressourceSpeichern } from "./tafel-aktionen";

const OHNE = "ohne";
const Fehler = ({ text }: { text?: string }) => (text ? <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{text}</p> : null);

// ---------------------------------------------------------------------------------------------------------------------
// Farbe eines Einsatzes: Standard nach Typ, Planungspalette oder frei gewählt (Schrift automatisch hell oder dunkel)
// ---------------------------------------------------------------------------------------------------------------------
export function FarbWahl({ wert, onWahl }: { wert: string | null; onWahl: (farbe: string | null) => void }) {
  const frei = istHex(wert);
  const [eigene, setEigene] = useState(frei ? wert : "#7A4FBF");
  const ring = "ring-2 ring-ink ring-offset-2 ring-offset-surface";
  return (
    <div role="radiogroup" aria-label="Farbe in der Plantafel" className="flex flex-wrap items-center gap-2" data-farbwahl>
      <button
        type="button"
        role="radio"
        aria-checked={!wert}
        onClick={() => onWahl(null)}
        className={cn("h-7 rounded-full border border-line px-3 text-xs font-medium", !wert && ring)}
      >
        Standard
      </button>
      {PLAN_FARBEN.map(([token, name]) => (
        <button
          key={token}
          type="button"
          role="radio"
          aria-checked={wert === token}
          aria-label={name}
          title={name}
          data-farbe={token}
          onClick={() => onWahl(token)}
          className={cn("size-7 rounded-full border border-line-soft", wert === token && ring)}
          style={{ background: `var(--${token})` }}
        />
      ))}
      <label
        title="Eigene Farbe aus der Farbskala"
        className={cn("relative grid h-7 min-w-7 cursor-pointer place-items-center rounded-full border border-line px-2 text-xs font-medium", frei && ring)}
        style={frei ? { background: wert!, color: schriftAuf(wert!) } : undefined}
      >
        {frei ? "Eigene" : "Eigene …"}
        <input
          type="color"
          aria-label="Eigene Farbe wählen"
          value={eigene}
          onChange={(e) => {
            setEigene(e.target.value);
            onWahl(e.target.value.toUpperCase());
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Kolonne anlegen, bearbeiten, löschen (Name, Mitglieder, Stammfahrzeug)
// ---------------------------------------------------------------------------------------------------------------------
export function KolonneDialog({ kolonne, monteure, fahrzeuge, ausloeser }: { kolonne?: TafelKolonne; monteure: Monteur[]; fahrzeuge: TafelFahrzeug[]; ausloeser: ReactNode }) {
  return (
    <FormularDialog titel={kolonne ? `Kolonne ${kolonne.name}` : "Kolonne hinzufügen"} ausloeser={ausloeser}>
      {(s) => <KolonneFormular kolonne={kolonne} monteure={monteure} fahrzeuge={fahrzeuge} s={s} />}
    </FormularDialog>
  );
}
function KolonneFormular({ kolonne: k, monteure, fahrzeuge, s }: { kolonne?: TafelKolonne; monteure: Monteur[]; fahrzeuge: TafelFahrzeug[]; s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await kolonneSpeichern(v, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const [fahrzeug, setFahrzeug] = useState(k?.stammfahrzeug_id ?? OHNE);
  const [, starten] = useTransition();
  const [fehler, setFehler] = useState<string>();
  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4" data-kolonne-formular>
      {k && <input type="hidden" name="id" value={k.id} />}
      <input type="hidden" name="stammfahrzeug_id" value={fahrzeug === OHNE ? "" : fahrzeug} />
      <Fehler text={z.fehler ?? fehler} />
      <Field label="Name *" error={z.felder?.name}>{(p) => <Input {...p} name="name" defaultValue={k?.name} autoFocus placeholder="z. B. Kolonne 1" />}</Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-ink-3">Monteure</legend>
        <div className="flex flex-wrap gap-2">
          {monteure.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface-sunken">
              <input type="checkbox" name="mitglieder" value={m.id} defaultChecked={k?.mitglieder.includes(m.id)} className="size-4 [accent-color:var(--ink)]" />
              {m.name}
            </label>
          ))}
        </div>
        <small className="text-xs text-muted-2">Ein Monteur kann in mehreren Kolonnen stehen. Geplante Einsätze behalten ihr Team.</small>
      </fieldset>
      <Field label="Stammfahrzeug" hint="Ziehen auf die Kolonne bucht alle Monteure und dieses Fahrzeug">
        {(p) => (
          <Select value={fahrzeug} onValueChange={(v) => { setFahrzeug(v); s.aenderung(); }}>
            <SelectTrigger id={p.id} aria-label="Stammfahrzeug"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={OHNE}>– ohne Stammfahrzeug –</SelectItem>
              {fahrzeuge.map((f) => <SelectItem key={f.id} value={f.id}>{f.kennzeichen}{f.typ ? ` · ${f.typ}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span>
          {k && (
            <Bestaetigen
              titel="Kolonne löschen?"
              text={<>Die Kolonne <b className="text-ink">{k.name}</b> verschwindet aus der Plantafel. Ihre Monteure bleiben, geplante Einsätze behalten ihr Team.</>}
              knopf="Löschen"
              gefahr
              ausfuehren={() => starten(async () => { const r = await kolonneLoeschen(k.id); if (r.ok) s.fertig(); else setFehler(r.fehler); })}
            >
              <Button variant="danger"><Trash2 className="size-[15px]" />Löschen</Button>
            </Bestaetigen>
          )}
        </span>
        <span className="flex gap-2.5">
          <Button onClick={s.abbrechen}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={laeuft}>{k ? "Speichern" : "Kolonne anlegen"}</Button>
        </span>
      </div>
    </Formular>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Monteur: in weitere Kolonne duplizieren, in andere verschieben, aus der Kolonne entfernen
// ---------------------------------------------------------------------------------------------------------------------
export function MonteurKolonnenDialog({ monteur, gruppe, kolonnen, ausloeser }: { monteur: Monteur; gruppe: string | null; kolonnen: TafelKolonne[]; ausloeser: ReactNode }) {
  return (
    <FormularDialog titel={monteur.name} ausloeser={ausloeser}>
      {(s) => <MonteurKolonnenFormular monteur={monteur} gruppe={gruppe} kolonnen={kolonnen} s={s} />}
    </FormularDialog>
  );
}
function MonteurKolonnenFormular({ monteur: m, gruppe, kolonnen, s }: { monteur: Monteur; gruppe: string | null; kolonnen: TafelKolonne[]; s: FormularSteuerung }) {
  const drin = kolonnen.filter((k) => k.mitglieder.includes(m.id));
  const andere = kolonnen.filter((k) => !k.mitglieder.includes(m.id));
  const aktuell = kolonnen.find((k) => k.id === gruppe);
  const aktionen: [string, string][] = [
    ...(andere.length ? ([["dup", "In weitere Kolonne duplizieren"]] as [string, string][]) : []),
    ...(andere.length && aktuell ? ([["move", "In andere Kolonne verschieben"]] as [string, string][]) : []),
    ...(aktuell ? ([["remove", `Aus ${aktuell.name} entfernen`]] as [string, string][]) : []),
  ];
  const [aktion, setAktion] = useState(aktionen[0]?.[0] ?? "");
  const [ziel, setZiel] = useState(andere[0]?.id ?? "");
  const [fehler, setFehler] = useState<string>();
  const [laeuft, starten] = useTransition();
  const ausfuehren = () =>
    starten(async () => {
      const r =
        aktion === "remove"
          ? await kolonneMonteur(m.id, aktuell!.id, null, false, null)
          : await kolonneMonteur(m.id, aktion === "move" ? (aktuell?.id ?? null) : null, ziel, aktion === "dup", null);
      if (r.ok) s.fertig();
      else setFehler(r.fehler);
    });
  return (
    <Formular aktion={ausfuehren} className="flex flex-col gap-4">
      <p className="text-sm text-muted">{drin.length ? `In ${drin.map((k) => k.name).join(", ")}` : "Ohne Kolonne"}</p>
      <Fehler text={fehler} />
      {aktionen.length ? (
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field label="Aktion">
            {(p) => (
              <Select value={aktion} onValueChange={(v) => { setAktion(v); s.aenderung(); }}>
                <SelectTrigger id={p.id} aria-label="Aktion"><SelectValue /></SelectTrigger>
                <SelectContent>{aktionen.map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          {aktion !== "remove" && (
            <Field label="Zielkolonne">
              {(p) => (
                <Select value={ziel} onValueChange={(v) => { setZiel(v); s.aenderung(); }}>
                  <SelectTrigger id={p.id} aria-label="Zielkolonne"><SelectValue /></SelectTrigger>
                  <SelectContent>{andere.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </Field>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Es gibt noch keine Kolonne. Über „Kolonne hinzufügen“ anlegen.</p>
      )}
      <p className="text-xs text-muted-2">Tipp: Zeile am Griff ziehen verschiebt, mit gedrückter Alt-Taste oder im Duplizier-Modus wird dupliziert. Geplante Einsätze behalten ihr Team.</p>
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft || !aktionen.length}>Übernehmen</Button>
      </div>
    </Formular>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Weitere Ressource (Zeile): anlegen, umbenennen, löschen
// ---------------------------------------------------------------------------------------------------------------------
export function RessourceDialog({ ressource, ausloeser }: { ressource?: TafelRessource; ausloeser: ReactNode }) {
  return (
    <FormularDialog titel={ressource ? "Zeile bearbeiten" : "Zeile hinzufügen"} ausloeser={ausloeser}>
      {(s) => <RessourceFormular ressource={ressource} s={s} />}
    </FormularDialog>
  );
}
function RessourceFormular({ ressource: r, s }: { ressource?: TafelRessource; s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const x = await ressourceSpeichern(v, fd);
    if (x.ok) s.fertig();
    return x;
  }, {});
  const [fehler, setFehler] = useState<string>();
  const [, starten] = useTransition();
  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4" data-ressource-formular>
      {r && <input type="hidden" name="id" value={r.id} />}
      <Fehler text={z.fehler ?? fehler} />
      <Field label="Bezeichnung *" error={z.felder?.name}>{(p) => <Input {...p} name="name" defaultValue={r?.name} autoFocus placeholder="z. B. Selbstabholer, Subunternehmer Meyer" />}</Field>
      <Field label="Notiz">{(p) => <Input {...p} name="notiz" defaultValue={r?.notiz ?? ""} />}</Field>
      {!r && <p className="text-xs text-muted-2">Neue Monteure über „Monteur hinzufügen“. Fahrzeuge haben keine eigene Zeile, sie stehen unter Team und Ressourcen › Fahrzeuge.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span>
          {r && (
            <Bestaetigen
              titel="Zeile löschen?"
              text={<>Die Zeile <b className="text-ink">{r.name}</b> verschwindet aus der Plantafel (nur ohne geplante Einsätze).</>}
              knopf="Löschen"
              gefahr
              ausfuehren={() => starten(async () => { const x = await ressourceLoeschen(r.id); if (x.ok) s.fertig(); else setFehler(x.fehler); })}
            >
              <Button variant="danger"><Trash2 className="size-[15px]" />Löschen</Button>
            </Bestaetigen>
          )}
        </span>
        <span className="flex gap-2.5">
          <Button onClick={s.abbrechen}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={laeuft}>{r ? "Speichern" : "Hinzufügen"}</Button>
        </span>
      </div>
    </Formular>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Sammelfreigabe: vorgeplante Einsätze des sichtbaren Zeitraums auf einmal freigeben
// ---------------------------------------------------------------------------------------------------------------------
export type FreigabeEintrag = { einsatz: TafelEinsatz; team: string; konflikte: string[] };

export function FreigabeDialog({ eintraege, ausloeser, beiErgebnis }: { eintraege: FreigabeEintrag[]; ausloeser: ReactNode; beiErgebnis: (r: Ergebnis) => void }) {
  return (
    <FormularDialog titel="Vorplanung freigeben" breit ausloeser={ausloeser}>
      {(s) => <FreigabeFormular eintraege={eintraege} s={s} beiErgebnis={beiErgebnis} />}
    </FormularDialog>
  );
}
function FreigabeFormular({ eintraege, s, beiErgebnis }: { eintraege: FreigabeEintrag[]; s: FormularSteuerung; beiErgebnis: (r: Ergebnis) => void }) {
  // Einsätze mit Konflikt sind nicht vorausgewählt
  const [gewaehlt, setGewaehlt] = useState(() => new Set(eintraege.filter((x) => !x.konflikte.length).map((x) => x.einsatz.id)));
  const [fehler, setFehler] = useState<string>();
  const [laeuft, starten] = useTransition();
  const freigeben = () =>
    starten(async () => {
      const r = await einsaetzeFreigeben([...gewaehlt]);
      if (r.ok) {
        beiErgebnis({ ok: true, warnung: undefined });
        s.fertig();
      } else setFehler(r.fehler);
    });
  return (
    <Formular aktion={freigeben} className="flex flex-col gap-4" data-freigabe>
      <p className="text-sm text-muted">Freigegebene Einsätze sind fest gebucht und erscheinen im Wochenplan der Monteure. Einsätze mit Konflikt sind nicht vorausgewählt.</p>
      <Fehler text={fehler} />
      <ul className="flex max-h-[50vh] flex-col overflow-y-auto rounded-md border border-line-soft">
        {eintraege.map(({ einsatz: e, team, konflikte }) => (
          <li key={e.id} className="border-t border-line-soft first:border-t-0">
            <label className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5 hover:bg-surface-muted">
              <input
                type="checkbox"
                name="ids"
                value={e.id}
                checked={gewaehlt.has(e.id)}
                onChange={(x) => {
                  s.aenderung();
                  setGewaehlt((g) => {
                    const n = new Set(g);
                    if (x.target.checked) n.add(e.id);
                    else n.delete(e.id);
                    return n;
                  });
                }}
                className="mt-0.5 size-4 [accent-color:var(--ink)]"
              />
              <span className="min-w-0 flex-1 text-sm">
                <b className="font-semibold">{lokalKurz(e.beginn)}</b> · <span className="font-mono text-[13px]">{e.bezug?.nummer}</span> · {e.bezug?.kunde}
                <span className="block text-xs text-muted">{[e.bezug?.titel, team].filter(Boolean).join(" · ")}</span>
                {konflikte.length > 0 && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-tone-red-fg"><AlertTriangle className="size-3.5" />{konflikte.join(" · ")}</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft || !gewaehlt.size}>{gewaehlt.size === 1 ? "1 Einsatz freigeben" : `${gewaehlt.size} Einsätze freigeben`}</Button>
      </div>
    </Formular>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Wochenplan drucken: je Monteur oder Kolonne, PDF A4 quer (nur freigegebene Einsätze beider Pläne)
// ---------------------------------------------------------------------------------------------------------------------
export function WochenplanDialog({ montag, monteure, kolonnen, ausloeser }: { montag: string; monteure: Monteur[]; kolonnen: TafelKolonne[]; ausloeser: ReactNode }) {
  return (
    <FormularDialog titel="Wochenplan drucken" ausloeser={ausloeser}>
      {(s) => <WochenplanFormular montag={montag} monteure={monteure} kolonnen={kolonnen} s={s} />}
    </FormularDialog>
  );
}
function WochenplanFormular({ montag, monteure, kolonnen, s }: { montag: string; monteure: Monteur[]; kolonnen: TafelKolonne[]; s: FormularSteuerung }) {
  const [wer, setWer] = useState(kolonnen[0] ? `kolonne:${kolonnen[0].id}` : monteure[0] ? `monteur:${monteure[0].id}` : "");
  const [woche, setWoche] = useState(montag);
  const [art, id] = wer.split(":");
  const href = `/pdf/wochenplan?woche=${woche}&${art}=${id}`;
  return (
    <div className="flex flex-col gap-4" data-wochenplan-formular>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Monteur oder Kolonne">
          {(p) => (
            <Select value={wer} onValueChange={setWer}>
              <SelectTrigger id={p.id} aria-label="Monteur oder Kolonne"><SelectValue /></SelectTrigger>
              <SelectContent>
                {kolonnen.map((k) => <SelectItem key={k.id} value={`kolonne:${k.id}`}>{k.name} (Kolonne)</SelectItem>)}
                {monteure.map((m) => <SelectItem key={m.id} value={`monteur:${m.id}`}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Woche ab">{(p) => <Input {...p} type="date" value={woche} onChange={(e) => setWoche(e.target.value)} />}</Field>
      </div>
      <p className="text-xs text-muted-2">Enthält alle freigegebenen Einsätze aus Montage- und Service-Plan mit Kunde, Adresse, Zeit und Auftrag, dazu Feiertage und Abwesenheiten. Vorgeplante Termine erscheinen nicht. A4 quer.</p>
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button asChild variant="primary">
          <a href={href} target="_blank" rel="noopener" data-wochenplan-link onClick={() => s.fertig()} aria-disabled={!wer}>
            <Printer className="size-[15px]" />
            PDF öffnen
          </a>
        </Button>
      </div>
    </div>
  );
}
