"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Briefcase, ClipboardList, FileText, Inbox, ListChecks, Package, Plus, Search, UserPlus, Wrench } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { eur } from "@/lib/format";
import { ausschnitt, markieren, SUCH_BEREICHE, type Treffer } from "@/lib/such-typen";
import { glockeLaden, sucheVorschlaege } from "./kopf-aktionen";

type Hinweis = Awaited<ReturnType<typeof glockeLaden>>[number];

/** Klick außerhalb und Escape schließen ein Aufklappfeld */
function useSchliessen(offen: boolean, schliessen: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!offen) return;
    const klick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) schliessen();
    };
    const taste = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") schliessen();
    };
    document.addEventListener("mousedown", klick);
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("mousedown", klick);
      document.removeEventListener("keydown", taste);
    };
  }, [offen, schliessen, ref]);
}

const panel = "absolute z-50 mt-2 overflow-hidden rounded-lg border border-line-soft bg-surface shadow-pop";

function Markiert({ text, q }: { text: string; q: string }) {
  return (
    <>
      {markieren(text, q).map((t, i) =>
        t.treffer ? (
          <mark key={i} className="rounded-xs bg-accent-soft px-0.5 text-ink">
            {t.text}
          </mark>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
    </>
  );
}

/** Eine Zeile eines Treffers (Vorschlag und Ergebnisseite) */
export function TrefferZeile({ t, q, aktiv }: { t: Treffer; q: string; aktiv?: boolean }) {
  return (
    <span className={cn("flex w-full items-start gap-3 rounded-md px-3 py-2 text-left", aktiv ? "bg-surface-muted" : "hover:bg-surface-muted")}>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {t.nummer && <span className="shrink-0 font-mono text-[12.5px] text-ink-3"><Markiert text={t.nummer} q={q} /></span>}
          <span className="truncate text-sm font-medium"><Markiert text={t.titel} q={q} /></span>
        </span>
        {t.details && <span className="block truncate text-xs text-muted"><Markiert text={t.details} q={q} /></span>}
        {t.fundtext && (
          <span className="block truncate text-xs text-muted-2" data-fundstelle>
            {t.fundstelle}: <Markiert text={ausschnitt(t.fundtext, q)} q={q} />
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
        {t.betrag != null && t.betrag > 0 && <span className="tabular text-ink-3">{eur(t.betrag)}</span>}
        {t.status && <span className="text-muted-2">{t.status}</span>}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Globale Suche: ab zwei Zeichen Vorschläge je Bereich (höchstens drei), Pfeiltasten, Enter, Strg+K
// ---------------------------------------------------------------------------------------------------------------------
export function GlobaleSuche({ start = "" }: { start?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(start);
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [geladenFuer, setGeladenFuer] = useState("");
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(-1);
  const box = useRef<HTMLFormElement>(null);
  const feld = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const listeId = useId();
  useSchliessen(offen, () => setOffen(false), box);

  // Strg+K bzw. Cmd+K setzt den Fokus in die Suche
  useEffect(() => {
    const taste = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        feld.current?.focus();
        feld.current?.select();
      }
    };
    window.addEventListener("keydown", taste);
    return () => {
      window.removeEventListener("keydown", taste);
      window.clearTimeout(timer.current);
    };
  }, []);

  const eingabe = (wert: string) => {
    setQ(wert);
    setAktiv(-1);
    setOffen(true);
    window.clearTimeout(timer.current);
    if (wert.trim().length < 2) {
      setTreffer([]);
      setGeladenFuer("");
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const r = await sucheVorschlaege(wert);
        setTreffer(r);
        setGeladenFuer(wert);
      } catch {
        setTreffer([]);
      }
    }, 200);
  };

  const gruppen = SUCH_BEREICHE.map(([b, text]) => ({ b, text, liste: treffer.filter((t) => t.bereich === b) })).filter((g) => g.liste.length);
  const flach = gruppen.flatMap((g) => g.liste);
  const alleIndex = flach.length;
  const alleHref = `/suche?q=${encodeURIComponent(q.trim())}`;

  const tasten = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOffen(true);
      setAktiv((a) => Math.min(a + 1, alleIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAktiv((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      absenden();
    }
  };
  const absenden = () => {
    if (q.trim().length < 2) return;
    setOffen(false);
    router.push(aktiv >= 0 && aktiv < alleIndex ? flach[aktiv].href : alleHref);
  };

  const zeigen = offen && q.trim().length >= 2;
  return (
    <form
      ref={box}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        absenden();
      }}
      className="relative mx-auto flex h-[42px] max-w-[440px] flex-[1_1_240px] items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-muted-2 focus-within:border-line-strong max-[960px]:order-5 max-[960px]:max-w-none max-[960px]:basis-full"
    >
      <Search className="size-4" aria-hidden="true" />
      <input
        ref={feld}
        type="search"
        aria-label="Globale Suche"
        role="combobox"
        aria-expanded={zeigen}
        aria-controls={listeId}
        aria-activedescendant={aktiv >= 0 ? `${listeId}-${aktiv}` : undefined}
        autoComplete="off"
        placeholder="Kunden, Aufträge, Belege suchen…"
        value={q}
        onChange={(e) => eingabe(e.target.value)}
        onFocus={() => setOffen(true)}
        onKeyDown={tasten}
        data-globale-suche
        className="min-w-0 flex-1 bg-transparent text-ink outline-none"
      />
      <kbd className="hidden rounded-xs border border-line px-1.5 text-[10.5px] text-muted-2 min-[1200px]:inline">Strg K</kbd>
      {zeigen && (
        <div id={listeId} role="listbox" className={cn(panel, "top-full right-0 left-0 max-h-[70vh] overflow-y-auto p-1.5")} data-such-vorschlaege>
          {gruppen.map((g) => (
            <div key={g.b} role="group" aria-label={g.text} className="mb-1">
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-2 uppercase">{g.text}</p>
              {g.liste.map((t) => {
                const nr = flach.indexOf(t);
                return (
                  <Link
                    key={`${t.bereich}-${t.id}`}
                    id={`${listeId}-${nr}`}
                    role="option"
                    aria-selected={aktiv === nr}
                    href={t.href}
                    onClick={() => setOffen(false)}
                    onMouseEnter={() => setAktiv(nr)}
                    data-treffer={t.bereich}
                    className="block"
                  >
                    <TrefferZeile t={t} q={q} aktiv={aktiv === nr} />
                  </Link>
                );
              })}
            </div>
          ))}
          {geladenFuer === q && !flach.length && <p className="px-3 py-3 text-sm text-muted">Keine Treffer für „{q.trim()}“.</p>}
          <Link
            id={`${listeId}-${alleIndex}`}
            role="option"
            aria-selected={aktiv === alleIndex}
            href={alleHref}
            onClick={() => setOffen(false)}
            data-alle-ergebnisse
            className={cn("mt-1 block rounded-md border-t border-line-soft px-3 py-2 text-sm font-medium text-accent-text", aktiv === alleIndex ? "bg-surface-muted" : "hover:bg-surface-muted")}
          >
            Alle Ergebnisse für „{q.trim()}“ anzeigen
          </Link>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// „Neu“-Menü: Kunde, Anfrage, Angebot, Auftrag (über die AB), Service-Ticket, Bestellung, Aufgabe
// ---------------------------------------------------------------------------------------------------------------------
const NEU: { text: string; sub: string; ziel: string; icon: ReactNode; dialog?: boolean }[] = [
  { text: "Kunde", sub: "Stammdaten und Adressen", ziel: "/kunden", icon: <UserPlus className="size-4" />, dialog: true },
  { text: "Anfrage", sub: "Interessent, Objekt, Aufmaß", ziel: "/anfragen", icon: <Inbox className="size-4" />, dialog: true },
  { text: "Angebot", sub: "öffnet den Beleg-Editor", ziel: "/beleg/neu?art=angebot", icon: <FileText className="size-4" /> },
  { text: "Auftrag", sub: "über die Auftragsbestätigung", ziel: "/beleg/neu?art=auftragsbestaetigung", icon: <Briefcase className="size-4" /> },
  { text: "Service-Ticket", sub: "Reklamation, Wartung, Reparatur", ziel: "/service", icon: <Wrench className="size-4" />, dialog: true },
  { text: "Bestellung", sub: "beim Lieferanten", ziel: "/bestellungen", icon: <Package className="size-4" />, dialog: true },
  { text: "Aufgabe", sub: "für mich oder andere", ziel: "/aufgaben", icon: <ListChecks className="size-4" />, dialog: true },
];

export function NeuMenue() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useSchliessen(offen, () => setOffen(false), box);
  return (
    <div ref={box} className="relative">
      <Button variant="accent" aria-haspopup="menu" aria-expanded={offen} onClick={() => setOffen((o) => !o)} data-neu-menue>
        <Plus className="size-[15px]" strokeWidth={2.2} />
        Neu
      </Button>
      {offen && (
        <div role="menu" aria-label="Neu anlegen" className={cn(panel, "right-0 w-72 p-1.5")}>
          {NEU.map((n) => (
            <button
              key={n.text}
              type="button"
              role="menuitem"
              data-neu={n.text}
              onClick={() => {
                setOffen(false);
                // Dialoge öffnen über ?neu=<Zeitstempel>; ein neuer Wert öffnet auch dann, wenn die Liste schon offen ist
                router.push(n.dialog ? `${n.ziel}?neu=${Date.now().toString(36)}` : n.ziel);
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-muted"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-sunken text-ink-3">{n.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">Neue{n.text === "Auftrag" || n.text === "Kunde" ? "r" : n.text === "Angebot" || n.text === "Service-Ticket" ? "s" : ""} {n.text}</span>
                <span className="block text-xs text-muted-2">{n.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Glocke: Hinweise wie „Braucht Aufmerksamkeit“; geladen nach dem Seitenaufbau, höchstens einmal je Minute
// ---------------------------------------------------------------------------------------------------------------------
let zwischenspeicher: { zeit: number; liste: Hinweis[] } | null = null;
const TON: Record<Hinweis["ton"], string> = { red: "bg-tone-red-fg", amber: "bg-tone-amber-fg", blue: "bg-tone-blue-fg", gray: "bg-muted-2" };

export function Glocke() {
  const [liste, setListe] = useState<Hinweis[] | null>(() => zwischenspeicher?.liste ?? null);
  const [offen, setOffen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useSchliessen(offen, () => setOffen(false), box);

  const laden = async (erzwingen = false) => {
    if (!erzwingen && zwischenspeicher && Date.now() - zwischenspeicher.zeit < 60_000) return setListe(zwischenspeicher.liste);
    try {
      const l = await glockeLaden();
      zwischenspeicher = { zeit: Date.now(), liste: l };
      setListe(l);
    } catch {
      // Hinweise sind nicht kritisch: beim nächsten Öffnen erneut versuchen
    }
  };
  useEffect(() => {
    const t = window.setTimeout(() => void laden(), 400);
    return () => window.clearTimeout(t);
  }, []);

  const anzahl = liste?.length ?? 0;
  return (
    <div ref={box} className="relative">
      <Button
        size="icon"
        aria-label={anzahl ? `Hinweise (${anzahl})` : "Hinweise"}
        aria-haspopup="dialog"
        aria-expanded={offen}
        data-glocke={anzahl}
        onClick={() => {
          setOffen((o) => !o);
          if (!offen) void laden(true);
        }}
        className="relative"
      >
        <Bell className="size-[17px]" />
        {anzahl > 0 && <span aria-hidden="true" className="absolute top-2 right-2.5 size-2 rounded-full bg-tone-red-fg ring-2 ring-surface" />}
      </Button>
      {offen && (
        <div role="dialog" aria-label="Hinweise" className={cn(panel, "right-0 w-[380px] max-w-[calc(100vw-24px)]")} data-glocke-liste>
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <b className="text-sm font-semibold">Hinweise</b>
            <span className="text-xs text-muted-2">{liste === null ? "lädt …" : anzahl ? `${anzahl} offen` : "alles erledigt"}</span>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto p-1.5">
            {(liste ?? []).map((h) => (
              <li key={`${h.titel}-${h.href}`}>
                <Link href={h.href} onClick={() => setOffen(false)} className="flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-surface-muted" data-hinweis>
                  <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", TON[h.ton])} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{h.titel}</span>
                    {h.info && <span className="block truncate text-xs text-muted">{h.info}</span>}
                  </span>
                </Link>
              </li>
            ))}
            {liste !== null && !anzahl && (
              <li className="flex items-center gap-2 px-3 py-6 text-sm text-muted">
                <ClipboardList className="size-4" /> Keine offenen Hinweise.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
