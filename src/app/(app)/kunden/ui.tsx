"use client";

import { Search, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { konditionenSpeichern, kundeLoeschen, type Ergebnis } from "./aktionen";

/** Ändert Suchparameter der Liste (ersetzt den Verlaufseintrag, Seite zurück auf 1). */
function useListenParameter() {
  const router = useRouter();
  const pfad = usePathname();
  const params = useSearchParams();
  return (aenderung: Record<string, string>) => {
    const neu = new URLSearchParams(params);
    for (const [k, v] of Object.entries(aenderung)) {
      if (v) neu.set(k, v);
      else neu.delete(k);
    }
    neu.delete("seite");
    const qs = neu.toString();
    router.replace(qs ? `${pfad}?${qs}` : pfad, { scroll: false });
  };
}

export function KundenSuche({ wert }: { wert: string }) {
  const setze = useListenParameter();
  const [q, setQ] = useState(wert);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <label className="flex h-[42px] max-w-[380px] flex-[1_1_260px] items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-muted-2">
      <Search className="size-4" aria-hidden="true" />
      <input
        type="search"
        aria-label="Kunden durchsuchen"
        placeholder="Name, Nummer, Ort, Telefon …"
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setze({ q: v.trim() }), 300);
        }}
        className="min-w-0 flex-1 bg-transparent text-ink outline-none"
      />
    </label>
  );
}

export function HerkunftFilter({ wert, liste }: { wert: string; liste: string[] }) {
  const setze = useListenParameter();
  return (
    <select
      aria-label="Nach Herkunft filtern"
      value={wert}
      onChange={(e) => setze({ herkunft: e.target.value })}
      className="h-[42px] rounded-md border border-line bg-surface px-3 text-sm text-ink"
    >
      <option value="">Alle Herkünfte</option>
      {liste.map((h) => (
        <option key={h} value={h}>{h}</option>
      ))}
    </select>
  );
}

/** Tabellenzeile, die per Klick die Kundenseite öffnet (der Name ist zusätzlich ein Link für Tastatur und Screenreader). */
export function KlickZeile({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer hover:bg-surface-muted"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

export function KundeLoeschen({ id, name }: { id: string; name: string }) {
  const [fehler, setFehler] = useState<string>();
  const [laeuft, starten] = useTransition();
  return (
    <>
      <Bestaetigen
        titel="Kunde löschen?"
        text={
          <>
            <b className="text-ink">{name}</b> wird als gelöscht markiert und verschwindet aus allen Listen. Die Daten bleiben
            im Protokoll erhalten. Kunden mit Anfragen, Aufträgen, Belegen oder Service-Tickets lassen sich nicht löschen.
          </>
        }
        knopf="Löschen"
        gefahr
        ausfuehren={() => starten(async () => setFehler((await kundeLoeschen(id))?.fehler))}
      >
        <Button variant="danger" disabled={laeuft}>
          <Trash2 className="size-[15px]" />
          Löschen
        </Button>
      </Bestaetigen>
      {fehler && (
        <p role="alert" className="basis-full rounded-md bg-tone-red-bg px-3.5 py-2.5 text-sm text-tone-red-fg">
          {fehler}
        </p>
      )}
    </>
  );
}

export function KonditionenFormular({ kundeId, text }: { kundeId: string; text: string }) {
  const [geaendert, setGeaendert] = useState(false);
  const [z, aktion, laeuft] = useActionState<Ergebnis, FormData>(async (vorher, fd) => {
    const r = await konditionenSpeichern(vorher, fd);
    if (r.ok) setGeaendert(false);
    return r;
  }, {});
  return (
    <form action={aktion} onInput={() => setGeaendert(true)} className="flex flex-col gap-2.5">
      <input type="hidden" name="kunde_id" value={kundeId} />
      <Textarea name="konditionen" aria-label="Konditionen" defaultValue={text} placeholder="z. B. 5 % Objektrabatt, 2 % Skonto 7 Tage, Rahmenvertrag" />
      {z.fehler && <p role="alert" className="text-sm text-tone-red-fg">{z.fehler}</p>}
      <div className="flex items-center justify-between gap-3">
        <small className="text-xs text-muted-2">Nur intern. Geht nicht an Lexware und erscheint auf keinem Beleg.</small>
        <Button type="submit" size="sm" variant="primary" disabled={laeuft || !geaendert}>
          {laeuft ? "Speichern …" : z.ok && !geaendert ? "Gespeichert" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
