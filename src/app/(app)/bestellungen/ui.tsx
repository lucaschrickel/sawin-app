"use client";

import { verlaufVergessen } from "@/components/app/verlauf";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { FormularDialog, type FormularSteuerung } from "@/components/ui/formular-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { Bestellung } from "@/lib/einkauf";
import { allesGeliefert, bestellungLoeschen, bestellungSpeichern, zeileGeliefert, type Ergebnis } from "./aktionen";

function Meldung({ e }: { e: Ergebnis }) {
  if (!e.fehler && !e.hinweis) return null;
  return (
    <p role={e.fehler ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-sm", e.fehler ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-green-bg text-tone-green-fg")}>
      {e.fehler ?? e.hinweis}
    </p>
  );
}

export type BestellAuswahl = {
  lieferanten: { id: string; name: string }[];
  auftraege: { id: string; nummer: string; titel: string; kunde: string; nochNichtBestellt: string | null }[];
};
type Props = { auswahl: BestellAuswahl; bestellung?: Bestellung; vorlage?: { lieferantId?: string; auftragId?: string }; ausloeser?: ReactNode; heute: string; startOffen?: boolean };

/** Bestellung anlegen oder bearbeiten; Positionen frei eingetippt, je Zeile ein Auftrag */
export function BestellungDialog(p: Props) {
  return (
    <FormularDialog
      titel={p.bestellung ? `Bestellung ${p.bestellung.nummer}` : "Neue Bestellung"}
      breit
      startOffen={p.startOffen}
      ausloeser={
        p.ausloeser ??
        (p.bestellung ? (
          <Button>
            <Pencil className="size-[15px]" />
            Bearbeiten
          </Button>
        ) : (
          <Button variant="primary">
            <Plus className="size-[15px]" strokeWidth={2.2} />
            Neue Bestellung
          </Button>
        ))
      }
    >
      {(s) => <BestellFormular {...p} s={s} />}
    </FormularDialog>
  );
}

type Zeile = { schluessel: number; id: string | null; auftrag_id: string; artikeltext: string; menge: string };
const auswahlKlasse = "h-9 w-full rounded-sm border border-line bg-surface px-2 text-sm";

function BestellFormular({ auswahl, bestellung: b, vorlage, heute, s }: Props & { s: FormularSteuerung }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (v, fd) => {
    const r = await bestellungSpeichern(v, fd);
    if (r.ok) s.fertig();
    return r;
  }, {});
  const [zeilen, setZeilen] = useState<Zeile[]>(() => {
    if (b) return b.zeilen.map((x, i) => ({ schluessel: i, id: x.id, auftrag_id: x.auftrag?.id ?? "", artikeltext: x.artikeltext, menge: String(x.menge).replace(".", ",") }));
    const a = auswahl.auftraege.find((x) => x.id === vorlage?.auftragId);
    // Aus „Noch nicht bestellt“ vorbelegen (je Eintrag eine Zeile)
    const offen = (a?.nochNichtBestellt ?? "").split(/\n|,/).map((t) => t.trim()).filter(Boolean);
    const erste = offen.length ? offen : [""];
    return erste.map((t, i) => ({ schluessel: i, id: null, auftrag_id: a?.id ?? "", artikeltext: t, menge: "1" }));
  });
  const [status, setStatus] = useState<string>(b?.status ?? "bestellt");
  const f = z.felder ?? {};
  const neueZeile = () => setZeilen((x) => [...x, { schluessel: Date.now(), id: null, auftrag_id: x.at(-1)?.auftrag_id ?? "", artikeltext: "", menge: "1" }]);

  return (
    <Formular aktion={aktion} onInput={s.aenderung} className="flex flex-col gap-4">
      {b && <input type="hidden" name="id" value={b.id} />}
      {z.fehler && <Meldung e={{ fehler: z.fehler }} />}
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Lieferant *" error={f.lieferant_id}>
          {(x) => (
            <select id={x.id} name="lieferant_id" defaultValue={b?.lieferant?.id ?? vorlage?.lieferantId ?? ""} className="h-[42px] w-full rounded-md border border-line bg-surface px-3 text-[15px]">
              <option value="" disabled>Bitte wählen …</option>
              {auswahl.lieferanten.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Bestelldatum" error={f.bestelldatum}>{(x) => <Input {...x} name="bestelldatum" type="date" defaultValue={b?.bestelldatum ?? heute} />}</Field>
      </div>
      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
        <Field label="AB-Nr. des Lieferanten">{(x) => <Input {...x} name="lieferanten_ab_nummer" defaultValue={b?.lieferanten_ab_nummer ?? ""} placeholder="falls schon vorhanden" />}</Field>
        <Field label="Liefer-KW" error={f.liefer_kw}>{(x) => <Input {...x} name="liefer_kw" inputMode="numeric" defaultValue={b?.liefer_kw ?? ""} placeholder="z. B. 50" />}</Field>
        <Field label="Jahr" error={f.liefer_jahr}>{(x) => <Input {...x} name="liefer_jahr" inputMode="numeric" defaultValue={b?.liefer_jahr ?? heute.slice(0, 4)} />}</Field>
        <Field label="Status">
          {(x) => (
            <Select name="status" value={status} onValueChange={(v) => { setStatus(v); s.aenderung(); }}>
              <SelectTrigger id={x.id}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bestellt">Bestellt</SelectItem>
                <SelectItem value="bestaetigt">Bestätigt</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-ink-3">Positionen je Auftrag *</legend>
        {zeilen.map((r, i) => (
          <div key={r.schluessel} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_72px_auto] items-center gap-2 max-md:grid-cols-1" data-zeile={i}>
            <input type="hidden" name="z_id" value={r.id ?? ""} />
            <select name="z_auftrag" aria-label="Auftrag" defaultValue={r.auftrag_id} className={auswahlKlasse}>
              <option value="">Auftrag …</option>
              {auswahl.auftraege.map((a) => <option key={a.id} value={a.id}>{a.nummer} · {a.kunde}</option>)}
            </select>
            <Input name="z_text" aria-label="Artikel" defaultValue={r.artikeltext} placeholder="Artikel, z. B. 4 × Kunststofffenster" className="h-9" />
            <Input name="z_menge" aria-label="Menge" inputMode="decimal" defaultValue={r.menge} className="h-9" />
            <button type="button" aria-label="Position entfernen" onClick={() => { setZeilen((x) => x.filter((y) => y.schluessel !== r.schluessel)); s.aenderung(); }} className="grid size-8 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-tone-red-fg">
              <X className="size-4" />
            </button>
          </div>
        ))}
        {f.zeilen && <small className="text-xs text-tone-red-fg">{f.zeilen}</small>}
        <Button size="xs" className="self-start" onClick={neueZeile}>
          <Plus className="size-3.5" />
          Weitere Zeile, auch für einen anderen Auftrag
        </Button>
      </fieldset>
      <Field label="Notiz">{(x) => <Textarea {...x} name="notiz" defaultValue={b?.notiz ?? ""} />}</Field>
      {!b && <p className="text-xs text-muted-2">Bestellte Positionen verschwinden aus „Noch nicht bestellt“ des jeweiligen Auftrags.</p>}
      <div className="flex justify-end gap-2.5">
        <Button onClick={s.abbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>{laeuft ? "Speichern …" : b ? "Speichern" : "Bestellung anlegen"}</Button>
      </div>
    </Formular>
  );
}

/** Häkchen „geliefert“ je Zeile */
export function GeliefertSchalter({ id, geliefert, text }: { id: string; geliefert: boolean; text: string }) {
  const [wert, setWert] = useState(geliefert);
  const [laeuft, starten] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={wert}
        disabled={laeuft}
        aria-label={`${text} geliefert`}
        data-geliefert={id}
        onChange={(e) => {
          const neu = e.target.checked;
          setWert(neu);
          starten(async () => {
            const r = await zeileGeliefert(id, neu);
            if (r.fehler) setWert(!neu);
          });
        }}
        className="size-4 [accent-color:var(--ink)]"
      />
      {wert ? "geliefert" : "offen"}
    </label>
  );
}

export function AllesGeliefert({ id }: { id: string }) {
  const [laeuft, starten] = useTransition();
  const [e, setE] = useState<Ergebnis>({});
  return (
    <>
      <Button variant="primary" disabled={laeuft} onClick={() => starten(async () => setE(await allesGeliefert(id)))}>
        <Check className="size-[15px]" />
        Alles geliefert
      </Button>
      {e.fehler && <div className="basis-full"><Meldung e={e} /></div>}
    </>
  );
}

export function BestellungLoeschen({ id, nummer }: { id: string; nummer: string }) {
  const [e, setE] = useState<Ergebnis>({});
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Bestaetigen
        titel="Bestellung löschen?"
        text={<>Bestellung <b className="font-mono text-ink">{nummer}</b> wird samt Positionen als gelöscht markiert. Schon (teilweise) gelieferte Bestellungen bleiben erhalten.</>}
        knopf="Löschen"
        gefahr
        ausfuehren={() => starten(async () => (verlaufVergessen(), setE((await bestellungLoeschen(id)) ?? {})))}
      >
        <Button variant="danger" disabled={laeuft}>
          <Trash2 className="size-[15px]" />
          Löschen
        </Button>
      </Bestaetigen>
      {e.fehler && <div className="basis-full"><Meldung e={e} /></div>}
    </>
  );
}
