"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { seitenleisteSetzen } from "@/lib/ansicht-aktion";
import { cn } from "@/lib/cn";
import { NAVIGATION, type Zaehler } from "./navigation";

/**
 * Zuletzt gewählter Zustand in diesem Browser-Tab, geteilt von allen Instanzen: Jede Seite rendert ihre eigene Hülle, und
 * Next.js hält besuchte Seiten versteckt im Speicher. Ohne gemeinsamen Zustand zeigten sie noch den alten Wert.
 */
let zuletzt: boolean | null = null;
const hoerer = new Set<() => void>();
const abonnieren = (f: () => void) => {
  hoerer.add(f);
  return () => hoerer.delete(f);
};
const setzen = (wert: boolean) => {
  zuletzt = wert;
  hoerer.forEach((f) => f());
};

type Props = {
  active: string;
  brand: { wordmark: string; tagline?: string; logo: ReactNode };
  user: { initials: string; name: string; role: string };
  zaehler: Zaehler;
  /** gemerkter Zustand (benutzer_einstellung.seitenleiste_eingeklappt) */
  eingeklappt: boolean;
  /** auf dem Handy eingeblendet */
  offen: boolean;
};

/**
 * Seitenleiste wie in der Demo: Gruppen und Reihenfolge aus NAVIGATION, Zähler an den Menüpunkten, noch nicht gebaute
 * Module ausgegraut als „folgt“. Einklappbar auf eine Symbolleiste (Knopf neben dem Logo), je Benutzer gemerkt.
 */
export function Seitenleiste({ active, brand, user, zaehler, eingeklappt, offen }: Props) {
  const mini = useSyncExternalStore(abonnieren, () => zuletzt, () => null) ?? eingeklappt;
  const umschalten = () => {
    setzen(!mini);
    void seitenleisteSetzen(!mini);
  };
  // Auf dem Handy ist die Leiste immer ausgeklappt
  const nurSymbol = (k: string) => cn(mini && k);

  return (
    <aside
      aria-label="Hauptnavigation"
      data-eingeklappt={mini ? "1" : undefined}
      className={cn(
        "sticky top-3 flex h-[calc(100vh-24px)] shrink-0 flex-col gap-0.5 overflow-y-auto py-2.5 text-frame-ink [--focus-ring:var(--frame-focus-ring)] [scrollbar-width:none]",
        mini ? "w-[76px] px-3" : "w-[252px] pr-3.5 pl-[18px]",
        "max-[960px]:fixed max-[960px]:top-0 max-[960px]:left-0 max-[960px]:z-[60] max-[960px]:h-screen max-[960px]:w-[252px] max-[960px]:bg-frame max-[960px]:px-3.5 max-[960px]:transition-transform",
        offen ? "max-[960px]:translate-x-0 max-[960px]:shadow-[0_0_40px_rgb(0_0_0/0.3)]" : "max-[960px]:-translate-x-[105%]",
      )}
    >
      <div className={cn("mb-2 flex items-center gap-2 border-b border-frame-line pt-1.5 pb-3.5", mini ? "flex-col max-[960px]:flex-row" : "px-1")}>
        <Link href="/" aria-label={`${brand.wordmark} – Startseite`} className="flex min-w-0 flex-1 items-center gap-3">
          <span className={cn("shrink-0", mini ? "w-[40px]" : "w-[46px]")}>{brand.logo}</span>
          <span className={cn("min-w-0", nurSymbol("hidden max-[960px]:block"))}>
            <b className="block text-[17px] leading-tight font-bold tracking-[0.16em] text-accent">{brand.wordmark}</b>
            {brand.tagline && <small className="mt-0.5 block text-[11.5px] tracking-[0.04em] text-frame-muted">{brand.tagline}</small>}
          </span>
        </Link>
        <button
          type="button"
          onClick={umschalten}
          aria-label={mini ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
          title={mini ? "Ausklappen" : "Einklappen"}
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-frame-muted hover:bg-white/5 hover:text-white max-[960px]:hidden"
        >
          {mini ? <ChevronRight className="size-4" strokeWidth={2} /> : <ChevronLeft className="size-4" strokeWidth={2} />}
        </button>
      </div>

      {NAVIGATION.map((group) => (
        <div key={group.label}>
          {mini && <div className="mx-2 my-2 border-t border-frame-line max-[960px]:hidden" aria-hidden="true" />}
          <div className={cn("px-2 pt-[11px] pb-1 text-[10.5px] font-medium tracking-[0.1em] text-frame-muted uppercase", nurSymbol("sr-only max-[960px]:not-sr-only"))}>
            {group.label}
          </div>
          {group.items.map((item) => {
            const on = item.key === active;
            const Icon = item.icon;
            const z = item.bereit && item.zaehler ? zaehler[item.zaehler] : undefined;
            const zahl = z && z.n > 0 ? z : undefined;
            const zeile = cn(
              "flex items-center gap-[11px] rounded-full py-[3px] text-[13.5px]",
              mini ? "justify-center px-[5px] max-[960px]:justify-start max-[960px]:pr-2.5" : "pr-2.5 pl-[5px]",
            );
            const symbol = (
              <span className={cn("relative inline-flex size-7 shrink-0 items-center justify-center rounded-full", on ? "bg-accent text-accent-ink" : "bg-white/[0.07] text-[#cfcac4]")}>
                <Icon className="size-[15px]" strokeWidth={1.8} aria-hidden="true" />
                {mini && zahl && (
                  <i
                    aria-hidden="true"
                    className={cn(
                      "absolute -top-1 -right-1.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold not-italic max-[960px]:hidden",
                      zahl.dringend ? "bg-tone-red-fg text-white" : "bg-accent text-accent-ink",
                    )}
                  >
                    {zahl.n}
                  </i>
                )}
              </span>
            );
            const text = <span className={cn("min-w-0 flex-1 truncate", nurSymbol("sr-only max-[960px]:not-sr-only"))}>{item.label}</span>;

            if (!item.bereit) {
              return (
                <span key={item.key} aria-disabled="true" title={`${item.label} (folgt)`} data-folgt={item.key} className={cn(zeile, "cursor-default text-[#c9c6c1] opacity-45")}>
                  {symbol}
                  {text}
                  <small className={cn("text-[10.5px] tracking-[0.04em] text-frame-muted", nurSymbol("hidden max-[960px]:inline"))}>folgt</small>
                </span>
              );
            }
            return (
              <Link
                key={item.key}
                href={item.href}
                title={mini ? item.label : undefined}
                aria-current={on ? "page" : undefined}
                className={cn(zeile, on ? "bg-accent/15 font-medium text-white" : "text-[#c9c6c1] hover:bg-white/5 hover:text-white")}
              >
                {symbol}
                {text}
                {zahl && (
                  <span
                    data-zaehler={item.key}
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular",
                      nurSymbol("hidden max-[960px]:inline"),
                      zahl.dringend ? "bg-tone-red-fg/90 font-semibold text-white" : "text-frame-muted",
                    )}
                  >
                    {zahl.n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className={cn("mt-auto flex flex-col gap-2.5 border-t border-frame-line pt-3.5", mini ? "items-center max-[960px]:items-stretch" : "px-1")}>
        <div className="flex items-center gap-2 text-xs text-[#bdb9b3]" title="Die Lexware-Anbindung folgt">
          <span className="size-2 shrink-0 rounded-full bg-frame-muted" aria-hidden="true" />
          <span className={nurSymbol("sr-only max-[960px]:not-sr-only")}>Buchhaltung: Lexware nicht verbunden</span>
        </div>
        <div className={cn("flex items-center gap-2.5", mini && "flex-col max-[960px]:flex-row")}>
          <Avatar initials={user.initials} size="lg" className="bg-accent text-accent-ink" />
          <span className={cn("min-w-0 flex-1", nurSymbol("hidden max-[960px]:block"))}>
            <b className="block truncate text-base font-semibold text-white">{user.name}</b>
            <small className="block text-xs text-frame-muted">{user.role}</small>
          </span>
          {/* Abmelden per POST an den Route-Handler (kein Link, damit nichts vorab geladen wird) */}
          <form action="/abmelden" method="post">
            <button
              type="submit"
              aria-label="Abmelden"
              title="Abmelden"
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-frame-muted hover:bg-white/5 hover:text-white"
            >
              <LogOut className="size-[17px]" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
