"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useListenParameter } from "@/components/app/listen-suche";
import { Badge, type Tone } from "@/components/ui/badge";
import { ZiehbareTabelle, type KopfSpalte } from "@/components/ui/ziehbare-tabelle";
import { cn } from "@/lib/cn";

export type TabellenZeile = {
  id: string;
  nummer: string | null;
  art: string;
  datum: string;
  kunde: string;
  titel: string;
  betrag: string;
  status: { key: string; text: string; ton: Tone };
};

/** Spalten der Belegliste: Breiten ziehbar (je Benutzer gespeichert), „Kunde“ nimmt den übrigen Platz */
const LISTEN_SPALTEN: KopfSpalte[] = [
  { schluessel: "nummer", titel: "Nummer", standard: 104, min: 90, max: 260 },
  { schluessel: "art", titel: "Art", standard: 96, min: 72, max: 220 },
  { schluessel: "datum", titel: "Datum", standard: 96, min: 84, max: 180, ausblendenBis: 1380 },
  { schluessel: "kunde", titel: "Kunde", rest: true, min: 140 },
  { schluessel: "betrag", titel: "Betrag", standard: 120, min: 96, max: 220, klasse: "text-right" },
  { schluessel: "status", titel: "Status", standard: 104, min: 90, max: 240 },
];

/** Belegliste: Klick wählt (Vorschau rechts), Doppelklick oder Enter öffnet den Beleg; Spaltenbreiten ziehbar */
export function BelegTabelle({ zeilen, gewaehlt, mehrereArten, leer, spalten }: { zeilen: TabellenZeile[]; gewaehlt: string; mehrereArten: boolean; leer: string; spalten?: Record<string, number> }) {
  const router = useRouter();
  const pfad = usePathname();
  const params = useSearchParams();
  const waehle = (id: string) => {
    const neu = new URLSearchParams(params);
    neu.set("id", id);
    router.replace(`${pfad}?${neu}`, { scroll: false });
  };
  if (!zeilen.length) return <p className="rounded-lg border border-line-soft bg-surface px-5 py-8 text-center text-sm text-muted">{leer}</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-line-soft bg-surface">
      <ZiehbareTabelle tabelle="beleg_liste" spalten={LISTEN_SPALTEN.filter((x) => mehrereArten || x.schluessel !== "art")} start={spalten} className="text-[14px]" attribute={{ "data-belegliste": true }}>
        <tbody>
          {zeilen.map((z) => (
            <tr
              key={z.id}
              data-beleg-zeile={z.id}
              aria-selected={z.id === gewaehlt}
              tabIndex={0}
              onClick={() => waehle(z.id)}
              onDoubleClick={() => router.push(`/beleg/${z.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/beleg/${z.id}`);
                if (e.key === " ") {
                  e.preventDefault();
                  waehle(z.id);
                }
              }}
              className={cn("cursor-pointer border-t border-line-soft outline-none hover:bg-surface-muted focus-visible:bg-surface-muted", z.id === gewaehlt && "bg-tone-brand-bg hover:bg-tone-brand-bg")}
            >
              <td className="truncate px-3 py-2.5 font-mono text-[13px]" data-spalte="nummer">{z.nummer ?? <span className="font-sans text-muted">Entwurf</span>}</td>
              {mehrereArten && <td className="truncate px-3 py-2.5" data-spalte="art">{z.art}</td>}
              <td className="truncate px-3 py-2.5 text-muted max-[1380px]:hidden" data-spalte="datum">{z.datum}</td>
              <td className="px-3 py-2.5">
                <span className="block truncate">{z.kunde}</span>
                {z.titel && <span className="block truncate text-xs text-muted-2">{z.titel}</span>}
              </td>
              <td className="truncate px-3 py-2.5 text-right tabular" data-spalte="betrag">{z.betrag}</td>
              <td className="overflow-hidden px-3 py-2.5" data-spalte="status">
                <Badge tone={z.status.ton}>{z.status.text}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </ZiehbareTabelle>
    </div>
  );
}

const chip = (an: boolean) => cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm", an ? "border-ink bg-ink text-surface" : "border-line bg-surface hover:border-line-strong");

/** Schnellfilter Belegart (nur „Alle Belege“), Statusfilter, Tag-Filter, Suche */
export function Filterleiste(p: {
  arten: { wert: string; text: string; anzahl: number }[];
  art: string;
  gesamt: number;
  status: [string, string][];
  statusWert: string;
  tags: string[];
  tagWert: string;
  suche: ReactNode;
}) {
  const setze = useListenParameter();
  return (
    <div className="mb-4 flex flex-col gap-3">
      {p.arten.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Belegart" data-art-filter>
          <button type="button" className={chip(!p.art)} aria-pressed={!p.art} onClick={() => setze({ art: "", id: "" })}>
            Alle Arten <small className="opacity-70">{p.gesamt}</small>
          </button>
          {p.arten.map((a) => (
            <button key={a.wert} type="button" className={chip(p.art === a.wert)} aria-pressed={p.art === a.wert} onClick={() => setze({ art: a.wert, id: "" })}>
              {a.text} <small className="opacity-70">{a.anzahl}</small>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="radiogroup" aria-label="Status" className="inline-flex flex-wrap rounded-full border border-line bg-surface p-0.5 text-sm" data-status-filter>
          {p.status.map(([wert, text]) => (
            <button
              key={wert || "alle"}
              type="button"
              role="radio"
              aria-checked={p.statusWert === wert}
              onClick={() => setze({ status: wert, id: "" })}
              className={cn("rounded-full px-3 py-1", p.statusWert === wert ? "bg-ink font-semibold text-surface" : "text-muted hover:text-ink")}
            >
              {text}
            </button>
          ))}
        </div>
        {p.tags.length > 0 && (
          <select
            aria-label="Tag"
            value={p.tagWert}
            onChange={(e) => setze({ tag: e.target.value, id: "" })}
            className="h-[42px] rounded-full border border-line bg-surface px-3.5 text-sm"
          >
            <option value="">Alle Tags</option>
            {p.tags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        {p.suche}
      </div>
    </div>
  );
}

/** „Beleg erstellen“ in „Alle Belege“: öffnet direkt den Editor */
export function NeuMenue() {
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOffen(false);
    document.addEventListener("mousedown", zu);
    return () => document.removeEventListener("mousedown", zu);
  }, [offen]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={offen}
        onClick={() => setOffen((o) => !o)}
        className="inline-flex h-[42px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-surface hover:opacity-90"
        data-beleg-erstellen
      >
        <Plus className="size-4" strokeWidth={2.2} /> Beleg erstellen <ChevronDown className="size-4" />
      </button>
      {offen && (
        <div className="absolute top-full right-0 z-20 mt-1 w-72 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-pop">
          <Link href="/beleg/neu?art=angebot" className="block px-3 py-2 hover:bg-surface-muted">
            <span className="block text-sm font-medium">Angebot</span>
            <span className="block text-xs text-muted-2">Ohne Anfrage wird beim Speichern eine angelegt</span>
          </Link>
          <Link href="/beleg/neu?art=auftragsbestaetigung" className="block px-3 py-2 hover:bg-surface-muted">
            <span className="block text-sm font-medium">Auftragsbestätigung</span>
            <span className="block text-xs text-muted-2">Aus einem Angebot oder frei · legt den Auftrag an</span>
          </Link>
          <p className="border-t border-line-soft px-3 py-2 text-xs text-muted-2">Lieferscheine entstehen am Auftrag aus der AB.</p>
        </div>
      )}
    </div>
  );
}
