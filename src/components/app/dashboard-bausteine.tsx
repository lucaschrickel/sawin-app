import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { StatusDot, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/** Karte im Dashboard: Überschrift, optional Verweis rechts („Plantafel →“) */
export function DashKarte({ titel, mehr, className, children }: { titel: string; mehr?: { href: string; text: string }; className?: string; children: ReactNode }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border border-line-soft bg-surface px-5 py-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{titel}</h2>
        {mehr && (
          <Link href={mehr.href} className="flex items-center gap-1 text-sm text-muted hover:text-ink">
            {mehr.text}
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Waagerechte Balken für eine Kennzahl je Kategorie (eine Farbe, Länge = Anzahl). Die Kategorie steht als Text daneben,
 * die Zahl immer sichtbar; ein Tooltip nennt Kategorie und Wert.
 */
export function BalkenListe({ zeilen, einheit = "", leer }: { zeilen: { name: ReactNode; titel: string; n: number; zusatz?: string; href?: string }[]; einheit?: string; leer?: string }) {
  const max = Math.max(1, ...zeilen.map((z) => z.n));
  if (!zeilen.length) return <p className="text-sm text-muted">{leer ?? "Keine Daten."}</p>;
  return (
    <ul className="flex flex-col gap-3" data-balken>
      {zeilen.map((z) => {
        const inhalt = (
          <>
            <span className="flex items-baseline gap-2.5 text-[13.5px]">
              <span className="min-w-0 flex-1">{z.name}</span>
              <b className="font-semibold tabular">{z.n.toLocaleString("de-DE")}{einheit}</b>
              {z.zusatz && <span className="w-12 text-right text-xs text-muted-2 tabular">{z.zusatz}</span>}
            </span>
            <span className="block h-2 rounded-full bg-surface-sunken">
              <span className="block h-2 rounded-full bg-accent" style={{ width: `${Math.max(z.n ? 3 : 0, Math.round((z.n / max) * 100))}%` }} />
            </span>
          </>
        );
        return (
          <li key={z.titel} title={`${z.titel}: ${z.n.toLocaleString("de-DE")}${einheit}${z.zusatz ? ` (${z.zusatz})` : ""}`}>
            {z.href ? <Link href={z.href} className="flex flex-col gap-1.5 rounded-sm hover:opacity-80">{inhalt}</Link> : <span className="flex flex-col gap-1.5">{inhalt}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Ring mit Zahl in der Mitte; der Bogen zeigt einen Anteil (0–100) */
export function Ring({ prozent, zahl, dunkel = false, titel }: { prozent: number; zahl: number | string; dunkel?: boolean; titel: string }) {
  const r = 22;
  const u = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, prozent));
  return (
    <span className="relative grid size-[58px] shrink-0 place-items-center" role="img" aria-label={titel} title={titel}>
      <svg viewBox="0 0 54 54" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="27" cy="27" r={r} fill="none" strokeWidth="5" className={dunkel ? "stroke-frame-line" : "stroke-surface-sunken"} />
        <circle cx="27" cy="27" r={r} fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(p / 100) * u} ${u}`} className={dunkel ? "stroke-accent" : "stroke-ink"} />
      </svg>
      <b className="text-[17px] font-semibold tabular">{zahl}</b>
    </span>
  );
}

/** Große Verweis-Karte mit Ring (Abwesenheiten, Einsätze heute) */
export function RingKarte({ href, titel, text, ring, dunkel = false }: { href: string; titel: string; text: string; ring: ReactNode; dunkel?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 flex-1 basis-[380px] items-center gap-4 rounded-full py-3 pr-6 pl-3 transition",
        // Dunkle Fläche: im App-Rahmen erlaubte Weißtöne auf Anthrazit
        dunkel ? "bg-frame text-frame-ink hover:bg-frame-2" : "border border-line-soft bg-surface hover:border-line-strong",
      )}
    >
      {ring}
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-[15px] font-semibold">{titel}</b>
        <small className={cn("text-[13px]", dunkel ? "text-frame-muted" : "text-muted")}>{text}</small>
      </span>
      <ArrowRight className="size-[18px] shrink-0" />
    </Link>
  );
}

/** Platzhalter für Kennzahlen aus Belegen (folgt mit dem Beleg-Modul) */
export function Platzhalter({ titel, text = "Folgt mit dem Beleg-Modul" }: { titel: string; text?: string }) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border border-dashed border-line bg-surface px-[22px] py-5" data-platzhalter>
      <span className="text-[12.5px] font-medium text-muted-2">{titel}</span>
      <span className="text-[26px] leading-tight font-bold text-muted-2">–</span>
      <span className="text-[12.5px] text-muted-2">{text}</span>
    </div>
  );
}

/** Zeile in „Braucht Aufmerksamkeit“ und ähnlichen Listen */
export function HinweisZeile({ href, titel, info, ton }: { href: string; titel: string; info?: string; ton: Tone }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-md px-1.5 py-2.5 hover:bg-surface-sunken" data-hinweis>
      <StatusDot tone={ton} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="text-sm font-semibold">{titel}</b>
        {info && <span className="truncate text-[12.5px] text-muted">{info}</span>}
      </span>
      <ArrowRight className="size-[15px] shrink-0 text-muted-2" />
    </Link>
  );
}
