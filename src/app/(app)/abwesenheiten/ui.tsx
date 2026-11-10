"use client";

import { AlertTriangle, Check, Plus, Trash2, X } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { ABWESENHEIT_ARTEN, ABWESENHEIT_TEXT, arbeitstageText, arbeitstageZwischen } from "@/lib/team";
import { abwesenheitEintragen, abwesenheitLoeschen, statusSetzen, type Ergebnis } from "./aktionen";

function Meldung({ e }: { e: Ergebnis }) {
  if (!e.fehler && !e.hinweis) return null;
  return (
    <p role={e.fehler ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-sm", e.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}>
      {e.fehler ?? e.hinweis}
    </p>
  );
}

type DialogProps = { mitarbeiter: { id: string; name: string }[]; admin: boolean; vorlage?: { mitarbeiter_id?: string }; ausloeser?: ReactNode; heute: string };

/** Abwesenheit eintragen (Büro). Danach Hinweis und, falls die Person eingeplant ist, eine Warnung. */
export function AbwesenheitDialog(p: DialogProps) {
  return (
    <FormularDialog
      titel="Abwesenheit eintragen"
      ausloeser={
        p.ausloeser ?? (
          <Button variant="primary">
            <Plus className="size-[15px]" strokeWidth={2.2} />
            Abwesenheit eintragen
          </Button>
        )
      }
    >
      {(s) => <AbwesenheitFormular {...p} s={s} />}
    </FormularDialog>
  );
}

function AbwesenheitFormular({ mitarbeiter, admin, vorlage, heute, s }: DialogProps & { s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await abwesenheitEintragen(v, fd);
    if (r.ok && !r.warnung) s.fertig();
    else if (r.ok) s.gespeichert();
    return r;
  }, {});
  const [von, setVon] = useState(heute);
  const [bis, setBis] = useState(heute);
  const [art, setArt] = useState("urlaub");
  const f = z.felder ?? {};

  if (z.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Meldung e={{ hinweis: z.hinweis }} />
        {z.warnung && (
          <p role="alert" className="flex items-center gap-2 rounded-md bg-tone-amber-bg px-3.5 py-2.5 text-sm text-tone-amber-fg">
            <AlertTriangle className="size-4 shrink-0" />
            {z.warnung}
          </p>
        )}
        <div className="flex justify-end">
          <Button variant="primary" onClick={s.fertig}>Schließen</Button>
        </div>
      </div>
    );
  }

  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {z.fehler && <Meldung e={{ fehler: z.fehler }} />}
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Mitarbeiter *" error={f.mitarbeiter_id}>
          {(p) => (
            <Select name="mitarbeiter_id" defaultValue={vorlage?.mitarbeiter_id} onValueChange={s.aenderung}>
              <SelectTrigger id={p.id}><SelectValue placeholder="Bitte wählen …" /></SelectTrigger>
              <SelectContent>{mitarbeiter.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Art *" error={f.art}>
          {(p) => (
            <Select name="art" value={art} onValueChange={(v) => { setArt(v); s.aenderung(); }}>
              <SelectTrigger id={p.id}><SelectValue /></SelectTrigger>
              <SelectContent>{ABWESENHEIT_ARTEN.map((a) => <SelectItem key={a} value={a}>{ABWESENHEIT_TEXT[a]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Von *" error={f.von}>{(p) => <Input {...p} name="von" type="date" value={von} onChange={(x) => { setVon(x.target.value); if (bis < x.target.value) setBis(x.target.value); }} />}</Field>
        <Field label="Bis *" error={f.bis} hint={von && bis >= von ? arbeitstageText(arbeitstageZwischen(von, bis)) : undefined}>
          {(p) => <Input {...p} name="bis" type="date" value={bis} min={von} onChange={(x) => setBis(x.target.value)} />}
        </Field>
      </div>
      <Field label="Notiz">{(p) => <Input {...p} name="notiz" />}</Field>
      {admin && art !== "krank" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="direkt" className="size-4 [accent-color:var(--ink)]" />
          Direkt genehmigen (Admin)
        </label>
      )}
      <p className="text-xs text-muted-2">Krankmeldungen gelten sofort. Alles andere ist ein Antrag, den ein Admin genehmigt.</p>
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : "Speichern"}</Button>
      </div>
    </Formular>
  );
}

/** Genehmigen und Ablehnen (nur Admins sehen die Knöpfe; die Datenbank prüft es ohnehin) */
export function Entscheiden({ id, admin }: { id: string; admin: boolean }) {
  const [fehler, setFehler] = useState<string>();
  const [laeuft, starten] = useTransition();
  if (!admin) return <span className="text-sm text-muted-2">wartet auf Admin</span>;
  const setzen = (status: "genehmigt" | "abgelehnt") => starten(async () => setFehler((await statusSetzen(id, status)).fehler));
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="danger" disabled={laeuft} onClick={() => setzen("abgelehnt")}>
        <X className="size-3.5" />
        Ablehnen
      </Button>
      <Button size="sm" variant="primary" disabled={laeuft} onClick={() => setzen("genehmigt")}>
        <Check className="size-3.5" />
        Genehmigen
      </Button>
      {fehler && <span role="alert" className="basis-full text-xs text-tone-red-fg">{fehler}</span>}
    </span>
  );
}

/** Löschen mit Bestätigung (nur Markierung) */
export function AbwesenheitLoeschen({ id, text }: { id: string; text: string }) {
  const [fehler, setFehler] = useState<string>();
  const [laeuft, starten] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Bestaetigen
        titel="Abwesenheit löschen?"
        text={<><b className="text-ink">{text}</b> wird als gelöscht markiert und verschwindet aus Plantafel und Urlaubskonto. Die Daten bleiben im Protokoll erhalten.</>}
        knopf="Löschen"
        gefahr
        ausfuehren={() => starten(async () => setFehler((await abwesenheitLoeschen(id)).fehler))}
      >
        <button type="button" disabled={laeuft} aria-label={`${text} löschen`} className="grid size-8 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-tone-red-fg">
          <Trash2 className="size-4" />
        </button>
      </Bestaetigen>
      {fehler && <span role="alert" className="text-xs text-tone-red-fg">{fehler}</span>}
    </span>
  );
}
