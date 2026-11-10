"use client";

import Link from "next/link";
import { Bell, Menu, Plus, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Inaktivitaet } from "./inaktivitaet";
import type { Zaehler } from "./navigation";
import { Seitenleiste } from "./seitenleiste";

type AppShellProps = {
  active: string;
  crumbs: { label: string; href?: string }[];
  brand: { name: string; logo: ReactNode; symbol: ReactNode };
  user: { initials: string; name: string; role: string };
  /** Zahlen an den Menüpunkten */
  zaehler: Zaehler;
  /** Seitenleiste eingeklappt (je Benutzer gemerkt) */
  eingeklappt: boolean;
  /** automatische Abmeldung nach so vielen Minuten ohne Eingabe */
  inaktivMinuten: number;
  /** Lexware-Anbindung eingerichtet (Schlüssel auf dem Server gesetzt) */
  lexware: boolean;
  children: ReactNode;
};

/** App-Rahmen: dunkle Seitenleiste, helles Inhaltsfeld, Kopfzeile mit Suche. */
export function AppShell({ active, crumbs, brand, user, zaehler, eingeklappt, inaktivMinuten, lexware, children }: AppShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen py-3 pr-3 max-[960px]:p-0">
      <Inaktivitaet minuten={inaktivMinuten} />
      <Seitenleiste active={active} brand={brand} user={user} zaehler={zaehler} eingeklappt={eingeklappt} offen={open} lexware={lexware} />

      {open && (
        <div className="fixed inset-0 z-[55] bg-black/40 min-[961px]:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-clip rounded-xl bg-canvas max-[960px]:rounded-none">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3.5 bg-canvas/90 px-8 pt-4 pb-3.5 backdrop-blur max-[960px]:px-4 max-[960px]:py-2.5">
          <Button size="icon" className="min-[961px]:hidden" aria-label="Menü öffnen" onClick={() => setOpen(true)}>
            <Menu className="size-[18px]" />
          </Button>
          <nav aria-label="Pfad" className="flex min-w-0 items-center gap-2 text-[13.5px] text-muted-2">
            {crumbs.map((c, i) =>
              i === crumbs.length - 1 ? (
                <b key={c.label} className="truncate font-semibold text-ink">{c.label}</b>
              ) : (
                <span key={c.label} className="flex items-center gap-2">
                  {c.href ? <Link href={c.href} className="hover:text-ink">{c.label}</Link> : c.label}
                  <span aria-hidden="true">›</span>
                </span>
              ),
            )}
          </nav>
          <form role="search" className="mx-auto flex h-[42px] max-w-[440px] flex-[1_1_240px] items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-muted-2 max-[960px]:order-5 max-[960px]:max-w-none max-[960px]:basis-full">
            <Search className="size-4" aria-hidden="true" />
            <input
              type="search"
              aria-label="Globale Suche"
              placeholder="Kunden, Aufträge, Belege suchen…"
              className="min-w-0 flex-1 bg-transparent text-ink outline-none"
            />
          </form>
          <div className="flex items-center gap-2.5">
            <Button variant="accent">
              <Plus className="size-[15px]" strokeWidth={2.2} />
              Neu
            </Button>
            <Button size="icon" aria-label="Hinweise">
              <Bell className="size-[17px]" />
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1360px] px-8 pt-2 pb-20 max-[960px]:px-4">{children}</main>
      </div>
    </div>
  );
}
