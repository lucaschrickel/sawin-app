"use client";

import { Check, Lock, Plus, Printer, Unlock, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { elementeSumme, FORMULAR_STATUS_TEXT, FORMULAR_STATUS_TON, leereAufmassZeile, type AufmassZeile, type FormularStatus } from "@/lib/formular-logik";
import { aufmassSpeichern, aufmassStatus } from "../aktionen";
import { InAngebot } from "../ui";

type Stand = { art: "ok" | "offen" | "laeuft" | "fehler"; text?: string; zeit?: string };

const feld = "h-9 w-full rounded-xs border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-(--focus-ring) focus:shadow-[0_0_0_1px_var(--focus-ring)] disabled:bg-surface-muted disabled:text-muted";
const uhr = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/**
 * Aufmaßblatt (CLAUDE.md „Formulare & Protokolle“): je Zeile Raum, Element, Breite und Höhe in mm, Anzahl, Anschlag,
 * Bemerkung; dazu Datum und Hinweise zur Baustelle. Speichert beim Tippen automatisch (Ausnahme vom „Speichern nur per
 * Knopf“ der Belege: das Aufmaß hat keine Versionen). Abgeschlossen ist es gesperrt, bis jemand „Wieder öffnen“ wählt.
 */
export function AufmassEditor({
  formular,
  bezug,
  start,
  elemente,
  anschlag,
}: {
  formular: { id: string; status: FormularStatus; datum: string; hinweise: string };
  bezug: { art: "anfrage" | "auftrag" | "ticket"; href: string; text: string; objekt: string | null; archiviert: boolean };
  start: AufmassZeile[];
  elemente: string[];
  anschlag: string[];
}) {
  const id = formular.id;
  const gesperrt = formular.status !== "entwurf";
  const [zeilen, setZeilen] = useState<AufmassZeile[]>(start.length ? start : [leereAufmassZeile(undefined, elemente[0])]);
  const [datum, setDatum] = useState(formular.datum);
  const [hinweise, setHinweise] = useState(formular.hinweise);
  const [stand, setStand] = useState<Stand>({ art: "ok" });
  const [statusLaeuft, statusStarten] = useTransition();
  const [meldung, setMeldung] = useState<{ fehler?: string; ok?: string }>({});

  // Automatisches Speichern: jede Änderung erhöht die Version; gespeichert wird 0,7 s nach der letzten Änderung
  const daten = useRef({ zeilen, datum, hinweise });
  const version = useRef(0);
  const gespeichert = useRef(0);
  const laeuft = useRef<Promise<boolean> | null>(null);
  const zeitgeber = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fokusNeu = useRef<string | null>(null);

  const speichernJetzt = async (): Promise<boolean> => {
    if (zeitgeber.current) clearTimeout(zeitgeber.current);
    if (laeuft.current) await laeuft.current;
    if (gespeichert.current === version.current) return true;
    const v = version.current;
    const d = daten.current;
    setStand({ art: "laeuft" });
    const p = aufmassSpeichern(id, d.datum, d.hinweise, d.zeilen)
      .then((r) => {
        if (r.fehler) {
          setStand({ art: "fehler", text: r.fehler });
          return false;
        }
        gespeichert.current = v;
        setStand(version.current === v ? { art: "ok", zeit: r.gespeichert } : { art: "offen" });
        return true;
      })
      .catch(() => {
        setStand({ art: "fehler", text: "Keine Verbindung. Die Eingaben werden gespeichert, sobald die Verbindung wieder steht." });
        return false;
      });
    laeuft.current = p;
    const ok = await p;
    laeuft.current = null;
    if (ok && version.current !== gespeichert.current) planen();
    return ok;
  };
  const planen = () => {
    if (zeitgeber.current) clearTimeout(zeitgeber.current);
    zeitgeber.current = setTimeout(() => void speichernJetzt(), 700);
  };
  const geaendert = (neu: Partial<typeof daten.current>) => {
    daten.current = { ...daten.current, ...neu };
    version.current++;
    setStand({ art: "offen" });
    planen();
  };

  const zeileAendern = (zid: string, teil: Partial<AufmassZeile>) => {
    const neu = zeilen.map((z) => (z.id === zid ? { ...z, ...teil } : z));
    setZeilen(neu);
    geaendert({ zeilen: neu });
  };
  const zeileHinzu = () => {
    const z = leereAufmassZeile(zeilen.at(-1), elemente[0]);
    const neu = [...zeilen, z];
    fokusNeu.current = z.id;
    setZeilen(neu);
    geaendert({ zeilen: neu });
  };
  const zeileWeg = (zid: string) => {
    const neu = zeilen.filter((z) => z.id !== zid);
    setZeilen(neu);
    geaendert({ zeilen: neu });
  };

  useEffect(() => {
    if (!fokusNeu.current) return;
    document.querySelector<HTMLInputElement>(`[data-aufmass-zeile="${fokusNeu.current}"] input[name="raum"]`)?.focus();
    fokusNeu.current = null;
  }, [zeilen]);

  // Ungespeicherte Eingaben: Browser warnt beim Schließen oder Neuladen
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      if (version.current !== gespeichert.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, []);

  const statusWechseln = (abschliessen: boolean) =>
    statusStarten(async () => {
      setMeldung({});
      if (abschliessen && !(await speichernJetzt())) return;
      const r = await aufmassStatus(id, abschliessen);
      setMeldung(r.fehler ? { fehler: r.fehler } : { ok: r.hinweis });
    });

  const pdfOeffnen = async () => {
    const fenster = window.open("", "_blank");
    await speichernJetzt();
    if (fenster) fenster.location.href = `/pdf/formular/${id}`;
  };

  const optionen = (liste: string[], wert: string) => (wert && !liste.includes(wert) ? [...liste, wert] : liste);
  const summe = elementeSumme(zeilen);

  return (
    <div className="flex flex-col gap-4" data-aufmass-editor={id}>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-soft bg-surface px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-[-0.01em]">Aufmaßblatt</h1>
          <p className="truncate text-sm text-muted">
            <Link href={bezug.href} className="hover:underline">{bezug.text}</Link>
            {bezug.objekt ? ` · ${bezug.objekt}` : ""}
          </p>
        </div>
        <Badge tone={FORMULAR_STATUS_TON[formular.status]} data-formular-status={formular.status}>{FORMULAR_STATUS_TEXT[formular.status]}</Badge>
        <span className="text-xs text-muted-2" role="status" data-speicherstand={stand.art}>
          {stand.art === "laeuft" ? "Speichert …" : stand.art === "offen" ? "Ungespeicherte Änderungen" : stand.art === "ok" && stand.zeit ? `Gespeichert ${uhr(stand.zeit)}` : ""}
        </span>
        <span className="flex-1" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={pdfOeffnen} data-aufmass-pdf>
            <Printer className="size-4" /> PDF
          </Button>
          {bezug.art !== "ticket" && !bezug.archiviert && <InAngebot id={id} klein={false} vorher={speichernJetzt} />}
          {gesperrt ? (
            <Button size="sm" disabled={statusLaeuft} onClick={() => statusWechseln(false)} data-aufmass-oeffnen>
              <Unlock className="size-4" /> Wieder öffnen
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={statusLaeuft} onClick={() => statusWechseln(true)} data-aufmass-abschliessen>
              <Lock className="size-4" /> Abschließen
            </Button>
          )}
        </div>
        {stand.art === "fehler" && <p role="alert" className="w-full text-sm text-tone-red-fg">{stand.text}</p>}
        {meldung.fehler && <p role="alert" className="w-full text-sm text-tone-red-fg">{meldung.fehler}</p>}
        {meldung.ok && (
          <p role="status" className="flex w-full items-center gap-1.5 text-sm text-tone-green-fg" data-aufmass-meldung>
            <Check className="size-4" /> {meldung.ok}
          </p>
        )}
      </div>

      <section className="rounded-lg border border-line-soft bg-surface px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Elemente</h2>
          <span className="text-xs text-muted-2" data-aufmass-summe={summe}>
            {summe === 1 ? "1 Element" : `${summe} Elemente`} · Maße in mm (Rohbau-Lichtmaß)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted-2">
                <th className="w-8 px-1.5 pb-2">#</th>
                <th className="px-1.5 pb-2">Raum</th>
                <th className="w-[150px] px-1.5 pb-2">Element</th>
                <th className="w-[96px] px-1.5 pb-2">Breite</th>
                <th className="w-[96px] px-1.5 pb-2">Höhe</th>
                <th className="w-[76px] px-1.5 pb-2">Anzahl</th>
                <th className="w-[124px] px-1.5 pb-2">Anschlag</th>
                <th className="px-1.5 pb-2">Bemerkung</th>
                <th className="w-9 pb-2" />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z, i) => (
                <tr key={z.id} className="border-t border-line-soft" data-aufmass-zeile={z.id}>
                  <td className="px-1.5 py-1.5 font-mono text-xs text-muted-2">{i + 1}</td>
                  <td className="px-1.5 py-1.5">
                    <input name="raum" aria-label={`Raum Zeile ${i + 1}`} className={feld} value={z.raum} placeholder="z. B. Küche" maxLength={200} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, { raum: e.target.value })} />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <select name="element" aria-label={`Element Zeile ${i + 1}`} className={feld} value={z.element} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, { element: e.target.value })}>
                      {optionen(elemente, z.element).map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <input name="breite" aria-label={`Breite in mm Zeile ${i + 1}`} className={`${feld} text-right tabular`} inputMode="numeric" value={z.breite_mm} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, { breite_mm: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <input name="hoehe" aria-label={`Höhe in mm Zeile ${i + 1}`} className={`${feld} text-right tabular`} inputMode="numeric" value={z.hoehe_mm} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, { hoehe_mm: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <input name="anzahl" aria-label={`Anzahl Zeile ${i + 1}`} className={`${feld} text-right tabular`} inputMode="numeric" value={z.anzahl} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, { anzahl: e.target.value.replace(/\D/g, "").slice(0, 5) })} />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <select name="anschlag" aria-label={`Anschlag Zeile ${i + 1}`} className={feld} value={z.anschlag} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, { anschlag: e.target.value })}>
                      <option value="">–</option>
                      {optionen(anschlag, z.anschlag).map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <input name="bemerkung" aria-label={`Bemerkung Zeile ${i + 1}`} className={feld} value={z.bemerkung} placeholder="Bemerkung" maxLength={1000} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, { bemerkung: e.target.value })} />
                  </td>
                  <td className="py-1.5 text-right">
                    {!gesperrt && (
                      <button type="button" onClick={() => zeileWeg(z.id)} aria-label={`Zeile ${i + 1} entfernen`} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-xs text-muted hover:bg-surface-sunken hover:text-ink" data-aufmass-zeile-weg>
                        <X className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!gesperrt && (
          <Button size="sm" className="mt-3" onClick={zeileHinzu} data-aufmass-zeile-neu>
            <Plus className="size-4" /> Zeile hinzufügen
          </Button>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-line-soft bg-surface px-5 py-4 md:grid-cols-[180px_1fr]">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-2">Datum</span>
          <Input type="date" name="datum" className="h-9 text-sm" value={datum} disabled={gesperrt} onChange={(e) => (setDatum(e.target.value), geaendert({ datum: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-2">Hinweise zur Baustelle</span>
          <Textarea name="hinweise" className="text-sm" value={hinweise} maxLength={4000} disabled={gesperrt} placeholder="z. B. Laibung schief, Zugang nur über Garten, Rollladenkasten vorhanden" onChange={(e) => (setHinweise(e.target.value), geaendert({ hinweise: e.target.value }))} />
        </label>
        <p className="text-xs text-muted-2 md:col-span-2">Das Aufmaß speichert sich beim Tippen automatisch. Es setzt in Version 1 eine Netzverbindung voraus.</p>
      </section>
    </div>
  );
}
