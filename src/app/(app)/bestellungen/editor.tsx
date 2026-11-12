"use client";

import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { useVerlassenSchutz, VerlassenDialog } from "@/components/app/verlassen-schutz";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Formular } from "@/components/ui/formular";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { Bestellung } from "@/lib/einkauf";
import { bestellungSpeichern, type Ergebnis } from "./aktionen";
import { GeliefertSchalter, type BestellAuswahl } from "./ui";

/*
  Bestellung direkt in der Maske bearbeiten (wie der Beleg-Editor, kein Dialog): Kopf, Positionen und Notiz sind Felder
  der Seite. Gespeichert wird nur per Knopf; die Seitenleiste zeigt „ungespeicherte Änderungen“, beim Verlassen fragt
  die App Speichern | Verwerfen | Abbrechen. „Geliefert“ je gespeicherter Zeile wirkt sofort (eigene Aktion).
*/

type Zeile = { schluessel: string; id: string | null; auftrag_id: string; artikeltext: string; menge: string; geliefert: boolean };

const feld = "h-9 w-full rounded-sm border border-line bg-surface px-2 text-sm";

export function BestellungEditor({
  auswahl,
  bestellung: b,
  vorlage,
  heute,
  aktionen,
  seite,
}: {
  auswahl: BestellAuswahl;
  bestellung?: Bestellung;
  vorlage?: { lieferantId?: string; auftragId?: string };
  heute: string;
  /** weitere Knöpfe in der Seitenleiste (z. B. „Alles geliefert“, „Löschen“) */
  aktionen?: ReactNode;
  /** weitere Karten in der Seitenleiste (z. B. Lieferant) */
  seite?: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [geaendert, setGeaendert] = useState(false);
  const danach = useRef<null | (() => void)>(null);
  const { verlassen, setVerlassen, geaendertRef } = useVerlassenSchutz(geaendert);

  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (vorher, fd) => {
    const r = await bestellungSpeichern(vorher, fd);
    if (r.ok) {
      setGeaendert(false);
      geaendertRef.current = false;
      const weiter = danach.current;
      danach.current = null;
      if (weiter) setTimeout(weiter, 0);
      else if (!b && r.id) router.replace(`/bestellungen/${r.id}`);
    } else danach.current = null;
    return r;
  }, {});

  const [zeilen, setZeilen] = useState<Zeile[]>(() => {
    if (b) return b.zeilen.map((x) => ({ schluessel: x.id, id: x.id, auftrag_id: x.auftrag?.id ?? "", artikeltext: x.artikeltext, menge: String(x.menge).replace(".", ","), geliefert: x.geliefert }));
    const a = auswahl.auftraege.find((x) => x.id === vorlage?.auftragId);
    // Aus „Noch nicht bestellt“ vorbelegen (je Eintrag eine Zeile)
    const offen = (a?.nochNichtBestellt ?? "").split(/\n|,/).map((t) => t.trim()).filter(Boolean);
    return (offen.length ? offen : [""]).map((t, i) => ({ schluessel: `n${i}`, id: null, auftrag_id: a?.id ?? "", artikeltext: t, menge: "1", geliefert: false }));
  });
  const [status, setStatus] = useState<string>(b?.status ?? "bestellt");
  const f = z.felder ?? {};
  const aendern = () => setGeaendert(true);
  const zeileSetzen = (schluessel: string, teil: Partial<Zeile>) => {
    setZeilen((x) => x.map((r) => (r.schluessel === schluessel ? { ...r, ...teil } : r)));
    aendern();
  };
  const neueZeile = () => {
    setZeilen((x) => [...x, { schluessel: `n${Date.now()}`, id: null, auftrag_id: x.at(-1)?.auftrag_id ?? "", artikeltext: "", menge: "1", geliefert: false }]);
    aendern();
  };
  const kundeVon = (auftragId: string) => auswahl.auftraege.find((a) => a.id === auftragId)?.kunde ?? "";
  const statusText = laeuft ? "wird gespeichert …" : geaendert ? "ungespeicherte Änderungen" : b ? "gespeichert" : "noch nicht gespeichert";

  return (
    <>
      <Formular ref={formRef} aktion={aktion}
        // „Geliefert“ speichert sofort und zählt nicht als ungespeicherte Änderung
        onInput={(e) => !(e.target as HTMLElement).closest("[data-sofort]") && aendern()}
        className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]" data-bestellung-editor>
        <div className="flex min-w-0 flex-col gap-4">
          {b && <input type="hidden" name="id" value={b.id} />}
          <section className="rounded-lg border border-line-soft bg-surface px-5 py-4">
            <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">Bestellung</h2>
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              <Field label="Lieferant *" error={f.lieferant_id}>
                {(x) => (
                  <select id={x.id} name="lieferant_id" defaultValue={b?.lieferant?.id ?? vorlage?.lieferantId ?? ""} onChange={aendern} className="h-[42px] w-full rounded-md border border-line bg-surface px-3 text-[15px]">
                    <option value="" disabled>
                      Bitte wählen …
                    </option>
                    {auswahl.lieferanten.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Bestelldatum" error={f.bestelldatum}>
                {(x) => <Input {...x} name="bestelldatum" type="date" defaultValue={b?.bestelldatum ?? heute} />}
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3 max-md:grid-cols-2">
              <Field label="AB-Nr. des Lieferanten">{(x) => <Input {...x} name="lieferanten_ab_nummer" defaultValue={b?.lieferanten_ab_nummer ?? ""} placeholder="falls schon vorhanden" />}</Field>
              <Field label="Liefer-KW" error={f.liefer_kw}>
                {(x) => <Input {...x} name="liefer_kw" inputMode="numeric" defaultValue={b?.liefer_kw ?? ""} placeholder="z. B. 50" />}
              </Field>
              <Field label="Jahr" error={f.liefer_jahr}>
                {(x) => <Input {...x} name="liefer_jahr" inputMode="numeric" defaultValue={b?.liefer_jahr ?? heute.slice(0, 4)} />}
              </Field>
              <Field label="Status">
                {(x) => (
                  <Select
                    name="status"
                    value={status}
                    onValueChange={(v) => {
                      setStatus(v);
                      aendern();
                    }}
                  >
                    <SelectTrigger id={x.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bestellt">Bestellt</SelectItem>
                      <SelectItem value="bestaetigt">Bestätigt</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>
          </section>

          <section className="rounded-lg border border-line-soft bg-surface px-5 py-4">
            <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">Positionen je Auftrag</h2>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[620px] table-fixed border-collapse text-sm" data-bestellzeilen>
                <colgroup>
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "15%" }} />
                  <col />
                  <col style={{ width: 76 }} />
                  {b && <col style={{ width: 112 }} />}
                  <col style={{ width: 40 }} />
                </colgroup>
                <thead>
                  <tr className="text-left text-[11px] font-semibold tracking-[0.06em] text-muted-2 uppercase">
                    <th className="px-1 pb-2">Auftrag</th>
                    <th className="px-1 pb-2">Kunde</th>
                    <th className="px-1 pb-2">Artikel</th>
                    <th className="px-1 pb-2 text-right">Menge</th>
                    {b && <th className="px-1 pb-2">Geliefert</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((r, i) => (
                    <tr key={r.schluessel} className="border-t border-line-soft align-middle" data-zeile={i} data-bestellzeile={r.id ?? undefined}>
                      <td className="px-1 py-1.5">
                        <input type="hidden" name="z_id" value={r.id ?? ""} />
                        <select name="z_auftrag" aria-label="Auftrag" value={r.auftrag_id} onChange={(e) => zeileSetzen(r.schluessel, { auftrag_id: e.target.value })} className={feld}>
                          <option value="">Auftrag …</option>
                          {auswahl.auftraege.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.nummer} · {a.kunde}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="truncate px-1 py-1.5 text-muted" title={kundeVon(r.auftrag_id)}>
                        {kundeVon(r.auftrag_id) || "–"}
                      </td>
                      <td className="px-1 py-1.5">
                        <Input name="z_text" aria-label="Artikel" value={r.artikeltext} onChange={(e) => zeileSetzen(r.schluessel, { artikeltext: e.target.value })} placeholder="Artikel, z. B. 4 × Kunststofffenster" className="h-9" />
                      </td>
                      <td className="px-1 py-1.5">
                        <Input name="z_menge" aria-label="Menge" inputMode="decimal" value={r.menge} onChange={(e) => zeileSetzen(r.schluessel, { menge: e.target.value })} className="h-9 text-right" />
                      </td>
                      {b && <td className="px-1 py-1.5" data-sofort>{r.id ? <GeliefertSchalter id={r.id} geliefert={r.geliefert} text={r.artikeltext} /> : <span className="text-xs text-muted-2">nach dem Speichern</span>}</td>}
                      <td className="px-1 py-1.5 text-right">
                        <button
                          type="button"
                          aria-label="Position entfernen"
                          title="Position entfernen"
                          onClick={() => {
                            setZeilen((x) => x.filter((y) => y.schluessel !== r.schluessel));
                            aendern();
                          }}
                          className="grid size-8 place-items-center rounded-sm text-muted hover:bg-canvas hover:text-tone-red-fg"
                        >
                          <X className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {f.zeilen && <small className="mt-1 block text-xs text-tone-red-fg">{f.zeilen}</small>}
            <Button size="xs" className="mt-3" onClick={neueZeile}>
              <Plus className="size-3.5" />
              Weitere Zeile, auch für einen anderen Auftrag
            </Button>
            {!b && <p className="mt-3 text-xs text-muted-2">Bestellte Positionen verschwinden aus „Noch nicht bestellt“ des jeweiligen Auftrags.</p>}
          </section>

          <section className="rounded-lg border border-line-soft bg-surface px-5 py-4">
            <Field label="Notiz">{(x) => <Textarea {...x} name="notiz" defaultValue={b?.notiz ?? ""} />}</Field>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[84px]">
          <section className="flex flex-col gap-2.5 rounded-lg border border-line-soft bg-surface p-4">
            <p className={cn("text-sm", geaendert ? "font-medium text-tone-amber-fg" : "text-muted-2")} data-speicherstand>
              {statusText}
            </p>
            {z.fehler && (
              <p role="alert" className="rounded-md bg-tone-red-bg px-3 py-2 text-sm text-tone-red-fg">
                {z.fehler}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={laeuft} className="w-full justify-center">
              {laeuft ? "Speichern …" : b ? "Speichern" : "Bestellung anlegen"}
            </Button>
            {aktionen}
          </section>
          {seite}
        </aside>
      </Formular>

      <VerlassenDialog
        verlassen={verlassen}
        text="Die Bestellung hat ungespeicherte Änderungen. Was soll mit ihnen passieren?"
        onAbbrechen={() => setVerlassen(null)}
        onVerwerfen={(weiter) => {
          setGeaendert(false);
          geaendertRef.current = false;
          setVerlassen(null);
          setTimeout(weiter, 0);
        }}
        onSpeichern={(weiter) => {
          setVerlassen(null);
          danach.current = weiter;
          formRef.current?.requestSubmit();
        }}
      />
    </>
  );
}
