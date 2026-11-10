"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Formular } from "@/components/ui/formular";
import { cn } from "@/lib/cn";
import type { Kunde, Lieferadresse } from "@/lib/kunden";
import { kundeSpeichern, type Ergebnis } from "./aktionen";

type LaZeile = { key: string; id: string; bezeichnung: string; strasse: string; plz: string; ort: string; alt: boolean };

const zuZeile = (la: Lieferadresse): LaZeile => ({
  key: la.id,
  id: la.id,
  bezeichnung: la.bezeichnung ?? "",
  strasse: la.strasse ?? "",
  plz: la.plz ?? "",
  ort: la.ort ?? "",
  alt: !!la.alt_seit,
});

type Props = {
  kunde?: Kunde;
  lieferadressen?: Lieferadresse[];
  herkunftListe: string[];
  /** Neuer Kunde aus einem anderen Dialog heraus: wird zurückgegeben statt zur Kundenseite zu springen */
  onAngelegt?: (k: { id: string; name: string }) => void;
  /** nach jedem erfolgreichen Speichern (z. B. Beleg-Editor übernimmt Adresse und Steuerart) */
  onGespeichert?: () => void;
  /** eigener Auslöser statt der Standard-Knöpfe */
  ausloeser?: ReactNode;
};

/** Kunde anlegen oder bearbeiten (Kundenmaske als Dialog, auch für den Beleg-Editor gedacht). */
export function KundeDialog({ kunde, lieferadressen = [], herkunftListe, onAngelegt, onGespeichert, ausloeser }: Props) {
  const [offen, setOffen] = useState(false);
  const [geaendert, setGeaendert] = useState(false);
  const [nachfrage, setNachfrage] = useState(false);
  // Schlüssel erzwingt ein frisches Formular bei jedem Öffnen
  const [formKey, setFormKey] = useState(0);

  const schliessen = () => {
    setOffen(false);
    setGeaendert(false);
    setNachfrage(false);
  };
  const oeffnenAendern = (o: boolean) => {
    if (o) {
      setFormKey((k) => k + 1);
      setOffen(true);
    } else if (geaendert) setNachfrage(true); // Schließen per ×, Escape oder Klick daneben fragt nach
    else schliessen();
  };

  return (
    <Dialog open={offen} onOpenChange={oeffnenAendern}>
      <DialogTrigger asChild>
        {ausloeser ?? (kunde ? (
          <Button>
            <Pencil className="size-[15px]" />
            Bearbeiten
          </Button>
        ) : (
          <Button variant="primary">
            <Plus className="size-[15px]" strokeWidth={2.2} />
            Neuer Kunde
          </Button>
        ))}
      </DialogTrigger>
      <DialogContent title={kunde ? "Kunde bearbeiten" : "Neuer Kunde"} wide>
        {nachfrage && (
          <div role="alertdialog" aria-label="Ungespeicherte Änderungen" className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-tone-amber-bg px-4 py-3 text-sm text-tone-amber-fg">
            <span className="flex-1">Es gibt ungespeicherte Änderungen.</span>
            <Button size="sm" onClick={() => setNachfrage(false)}>Weiter bearbeiten</Button>
            <Button size="sm" variant="danger" onClick={schliessen}>Verwerfen</Button>
          </div>
        )}
        <KundeFormular
          key={formKey}
          kunde={kunde}
          lieferadressen={lieferadressen}
          herkunftListe={herkunftListe}
          onAenderung={() => setGeaendert(true)}
          onGespeichert={(e) => {
            if (e.id && onAngelegt) onAngelegt({ id: e.id, name: e.name ?? "" });
            onGespeichert?.();
            schliessen();
          }}
          rueckgabe={!!onAngelegt}
          onAbbrechen={() => oeffnenAendern(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function KundeFormular({
  kunde,
  lieferadressen,
  herkunftListe,
  onAenderung,
  onGespeichert,
  onAbbrechen,
  rueckgabe,
}: Omit<Props, "onGespeichert"> & { lieferadressen: Lieferadresse[]; onAenderung: () => void; onGespeichert: (e: Ergebnis) => void; onAbbrechen: () => void; rueckgabe: boolean }) {
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(kundeSpeichern, {});
  const [typ, setTyp] = useState<"privat" | "firma">(kunde?.typ ?? "privat");
  const [zeilen, setZeilen] = useState<LaZeile[]>(() => lieferadressen.map(zuZeile));
  const neueNr = useRef(0);
  const f = z.felder ?? {};

  useEffect(() => {
    if (z.ok) onGespeichert(z);
  }, [z, onGespeichert]);

  const aktiv = zeilen.filter((r) => !r.alt);
  const alt = zeilen.filter((r) => r.alt);
  const setze = (key: string, aenderung: Partial<LaZeile>) => {
    setZeilen((rs) => rs.map((r) => (r.key === key ? { ...r, ...aenderung } : r)));
    onAenderung();
  };
  const neu = () => {
    neueNr.current += 1;
    setZeilen((rs) => [...rs, { key: `neu-${neueNr.current}`, id: "", bezeichnung: "", strasse: "", plz: "", ort: "", alt: false }]);
    onAenderung();
  };

  // Reihenfolge beim Speichern: aktive vor alten
  const sortiert = [...aktiv, ...alt];
  const zeile = (r: LaZeile) => {
    const i = sortiert.indexOf(r);
    return (
      <div key={r.key} className={cn("grid grid-cols-[1.1fr_1.4fr_90px_1fr_auto] items-start gap-2 max-md:grid-cols-2", r.alt && "opacity-60")}>
        <input type="hidden" name="la_id" value={r.id} />
        <input type="hidden" name="la_alt" value={r.alt ? "1" : ""} />
        <Input name="la_bezeichnung" aria-label="Bezeichnung" placeholder="Bezeichnung (z. B. Objekt Rosenweg)" value={r.bezeichnung} onChange={(e) => setze(r.key, { bezeichnung: e.target.value })} />
        <Input name="la_strasse" aria-label="Straße" placeholder="Straße" value={r.strasse} onChange={(e) => setze(r.key, { strasse: e.target.value })} />
        <Input name="la_plz" aria-label="PLZ" placeholder="PLZ" inputMode="numeric" maxLength={5} value={r.plz} aria-invalid={f[`la_plz_${i}`] ? true : undefined} onChange={(e) => setze(r.key, { plz: e.target.value })} />
        <Input name="la_ort" aria-label="Ort" placeholder="Ort" value={r.ort} aria-invalid={f[`la_ort_${i}`] ? true : undefined} onChange={(e) => setze(r.key, { ort: e.target.value })} />
        <div className="flex h-[42px] items-center gap-1">
          {r.id ? (
            <Button size="xs" onClick={() => setze(r.key, { alt: !r.alt })}>
              {r.alt ? "Reaktivieren" : "Alt"}
            </Button>
          ) : (
            <Button size="xs" variant="ghost" aria-label="Zeile entfernen" onClick={() => setZeilen((rs) => rs.filter((x) => x.key !== r.key))}>
              <X className="size-4" />
            </Button>
          )}
        </div>
        {(f[`la_plz_${i}`] || f[`la_ort_${i}`]) && <small className="col-span-full text-xs text-tone-red-fg">{f[`la_plz_${i}`] ?? f[`la_ort_${i}`]}</small>}
      </div>
    );
  };

  return (
    <Formular aktion={aktion} onInput={onAenderung} className="flex flex-col gap-4">
      {kunde && <input type="hidden" name="id" value={kunde.id} />}
      {rueckgabe && <input type="hidden" name="_rueckgabe" value="1" />}
      {z.fehler && <p role="alert" className="rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">{z.fehler}</p>}

      <Zeile>
        <Field label="Name / Firma *" error={f.name}>
          {(a) => <Input {...a} name="name" defaultValue={kunde?.name} placeholder="z. B. Familie Muster" required autoFocus={!kunde} />}
        </Field>
        <Field label="Typ">
          {(a) => (
            <Select name="typ" value={typ} onValueChange={(v) => { setTyp(v as "privat" | "firma"); onAenderung(); }}>
              <SelectTrigger id={a.id}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="privat">Privat</SelectItem>
                <SelectItem value="firma">Firma</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </Zeile>
      <Zeile>
        <Field label="Ansprechpartner">{(a) => <Input {...a} name="ansprechpartner" defaultValue={kunde?.ansprechpartner ?? ""} />}</Field>
        <Field label="Herkunft" error={f.herkunft}>
          {(a) => (
            <Select name="herkunft" defaultValue={kunde?.herkunft ?? undefined} onValueChange={onAenderung}>
              <SelectTrigger id={a.id}><SelectValue placeholder="Bitte wählen …" /></SelectTrigger>
              <SelectContent>
                {herkunftListe.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Field>
      </Zeile>

      <Abschnitt titel="Rechnungsadresse" hinweis="Hauptadresse des Kunden, geht mit dem ersten Beleg an Lexware.">
        <div className="grid grid-cols-[1.6fr_110px_1fr] gap-3 max-md:grid-cols-1">
          <Field label="Straße">{(a) => <Input {...a} name="strasse" defaultValue={kunde?.strasse ?? ""} />}</Field>
          <Field label="PLZ" error={f.plz}>{(a) => <Input {...a} name="plz" inputMode="numeric" maxLength={5} defaultValue={kunde?.plz ?? ""} />}</Field>
          <Field label="Ort">{(a) => <Input {...a} name="ort" defaultValue={kunde?.ort ?? ""} />}</Field>
        </div>
      </Abschnitt>

      <Abschnitt
        titel="Lieferadressen"
        hinweis={aktiv.length ? undefined : "Ohne eigene Lieferadresse gilt die Rechnungsadresse. Für Kunden mit mehreren Objekten (z. B. Hausverwaltung) beliebig viele anlegen."}
        aktion={<Button size="xs" onClick={neu}><Plus className="size-3.5" strokeWidth={2.2} />Lieferadresse</Button>}
      >
        <div className="flex flex-col gap-2">{aktiv.map(zeile)}</div>
        {alt.length > 0 && (
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer text-muted">Alte Lieferadressen ({alt.length}) · werden nicht mehr vorgeschlagen</summary>
            <div className="mt-2 flex flex-col gap-2">{alt.map(zeile)}</div>
          </details>
        )}
      </Abschnitt>

      <Zeile>
        <Field label="Telefon">{(a) => <Input {...a} name="telefon" type="tel" defaultValue={kunde?.telefon ?? ""} />}</Field>
        <Field label="E-Mail" error={f.email}>{(a) => <Input {...a} name="email" type="email" defaultValue={kunde?.email ?? ""} />}</Field>
      </Zeile>
      <label className={cn("flex items-start gap-2.5 text-sm", typ !== "firma" && "text-muted")}>
        <input
          type="checkbox"
          name="bauleister_13b"
          defaultChecked={kunde?.bauleister_13b}
          disabled={typ !== "firma"}
          className="mt-0.5 size-[18px] [accent-color:var(--ink)]"
        />
        <span>
          Bauleister (§ 13b UStG) · nur bei Firmen: neue Belege werden mit der Steuerart „§ 13b“ vorbelegt
          {f.bauleister_13b && <small className="block text-xs text-tone-red-fg">{f.bauleister_13b}</small>}
        </span>
      </label>
      <Field label="Notiz">{(a) => <Textarea {...a} name="notiz" defaultValue={kunde?.notiz ?? ""} />}</Field>

      <div className="flex justify-end gap-2.5 pt-1">
        <Button onClick={onAbbrechen}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={laeuft}>
          {laeuft ? "Speichern …" : kunde ? "Speichern" : "Kunde anlegen"}
        </Button>
      </div>
    </Formular>
  );
}

function Zeile({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">{children}</div>;
}

function Abschnitt({ titel, hinweis, aktion, children }: { titel: string; hinweis?: string; aktion?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-md border border-line-soft p-3.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{titel}</h3>
        {aktion}
      </div>
      {hinweis && <p className="text-sm text-muted">{hinweis}</p>}
      {children}
    </section>
  );
}
