"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { anzeige, ohneMaske, verlaufWeiter, zurueckPerHistorie, type VerlaufEintrag } from "@/lib/verlauf";

const SPEICHER = "sawin-verlauf";
const NEU = "sawin-verlauf-neu";

const lesen = (): VerlaufEintrag[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(SPEICHER) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** Klick in die Seitenleiste: der Verlauf beginnt mit der nächsten Seite neu */
export function verlaufNeuBeginnen() {
  try {
    sessionStorage.setItem(NEU, "1");
  } catch {
    /* ohne sessionStorage kein Verlauf */
  }
}

/** Gelöschter Vorgang: seine Maske aus dem Verlauf entfernen (vor dem Löschen der aktuellen Seite aufrufen) */
export function verlaufVergessen(pathname = window.location.pathname) {
  try {
    sessionStorage.setItem(SPEICHER, JSON.stringify(ohneMaske(lesen(), pathname)));
  } catch {
    /* ohne sessionStorage */
  }
}

type Krume = { label: string; href?: string };

/** Fachlicher Pfad (Brotkrumen): beim direkten Öffnen per Link und solange der Verlauf noch nicht gelesen ist */
export function Pfad({ crumbs, nurName }: { crumbs: Krume[]; nurName?: boolean }) {
  const sichtbar = nurName ? crumbs.slice(-1) : crumbs;
  return (
    <nav aria-label="Pfad" className="flex min-w-0 items-center gap-2 text-[13.5px] text-muted-2" data-pfad={nurName ? "name" : "pfad"}>
      {sichtbar.map((c, i) =>
        i === sichtbar.length - 1 ? (
          <b key={c.label} className="truncate font-semibold text-ink">{c.label}</b>
        ) : (
          <span key={c.label} className="flex items-center gap-2">
            {c.href ? <Link href={c.href} className="hover:text-ink">{c.label}</Link> : c.label}
            <span aria-hidden="true">›</span>
          </span>
        ),
      )}
    </nav>
  );
}

/**
 * Oben links: „← <vorherige Maske>“ (Verlauf je Browser-Tab, siehe src/lib/verlauf.ts), nach einem Klick in die
 * Seitenleiste nur der Name der Maske, beim direkten Öffnen per Link der fachliche Pfad.
 */
export function Verlauf({ crumbs }: { crumbs: Krume[] }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const titel = crumbs.at(-1)?.label ?? "";
  const [verlauf, setVerlauf] = useState<VerlaufEintrag[] | null>(null);

  useEffect(() => {
    let neu = false;
    try {
      neu = sessionStorage.getItem(NEU) === "1";
      sessionStorage.removeItem(NEU);
    } catch {
      /* ohne sessionStorage */
    }
    const pfad = pathname + (search ? `?${search}` : "");
    const weiter = verlaufWeiter(lesen(), { pfad, pathname, titel, laenge: window.history.length }, neu);
    try {
      sessionStorage.setItem(SPEICHER, JSON.stringify(weiter));
    } catch {
      /* ohne sessionStorage */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Verlauf liegt im sessionStorage (nur im Browser lesbar)
    setVerlauf(weiter);
  }, [pathname, search, titel]);

  if (!verlauf) return <Pfad crumbs={crumbs} />;
  const a = anzeige(verlauf);
  if (a.art === "pfad") return <Pfad crumbs={crumbs} />;
  if (a.art === "name") return <Pfad crumbs={crumbs} nurName />;
  return (
    <ZurueckKnopf
      href={a.pfad}
      titel={a.titel}
      onClick={(e) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        // Browser-Verlauf führt genau dorthin: echtes Zurück (Filter, Scrollstand und Browser-Zurück bleiben stimmig)
        if (zurueckPerHistorie(verlauf, window.history.length)) {
          e.preventDefault();
          window.history.back();
        }
      }}
    />
  );
}

/** Knopf „← <vorherige Maske>“ oben links (auch im Styleguide) */
export function ZurueckKnopf({ href, titel, onClick }: { href: string; titel: string; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <nav aria-label="Zurück" className="flex min-w-0 items-center gap-2 text-[13.5px]">
      <Link
        href={href}
        data-zurueck={href}
        onClick={onClick}
        className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 font-medium text-ink hover:border-line-strong"
      >
        <span aria-hidden="true">←</span>
        <span className="truncate">{titel}</span>
      </Link>
    </nav>
  );
}
