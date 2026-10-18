"use client";

import Link from "next/link";
import { Menu, Plus, Search, Bell } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { NAVIGATION } from "./navigation";

type AppShellProps = {
  active: string;
  crumbs: { label: string; href?: string }[];
  brand: { wordmark: string; tagline?: string; logo: ReactNode };
  user: { initials: string; name: string; role: string };
  children: ReactNode;
};

/** App-Rahmen: dunkle Seitenleiste, helles Inhaltsfeld, Kopfzeile mit Suche. */
export function AppShell({ active, crumbs, brand, user, children }: AppShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen py-3 pr-3 max-[960px]:p-0">
      <aside
        aria-label="Hauptnavigation"
        className={cn(
          "sticky top-3 flex h-[calc(100vh-24px)] w-[252px] shrink-0 flex-col gap-0.5 overflow-y-auto py-2.5 pr-3.5 pl-[18px] text-frame-ink [--focus-ring:var(--frame-focus-ring)] [scrollbar-width:none]",
          "max-[960px]:fixed max-[960px]:top-0 max-[960px]:left-0 max-[960px]:z-[60] max-[960px]:h-screen max-[960px]:bg-frame max-[960px]:pl-3.5 max-[960px]:transition-transform",
          open ? "max-[960px]:translate-x-0 max-[960px]:shadow-[0_0_40px_rgb(0_0_0/0.3)]" : "max-[960px]:-translate-x-[105%]",
        )}
      >
        <Link href="/" className="mb-2 flex items-center gap-3 border-b border-frame-line px-1 pt-1.5 pb-3.5">
          <span className="w-[46px] shrink-0">{brand.logo}</span>
          <span>
            <b className="block text-[17px] leading-tight font-bold tracking-[0.16em] text-accent">{brand.wordmark}</b>
            {brand.tagline && <small className="mt-0.5 block text-[11.5px] tracking-[0.04em] text-frame-muted">{brand.tagline}</small>}
          </span>
        </Link>

        {NAVIGATION.map((group) => (
          <div key={group.label}>
            <div className="px-2 pt-[11px] pb-1 text-[10.5px] font-medium tracking-[0.1em] text-frame-muted uppercase">
              {group.label}
            </div>
            {group.items.map((item) => {
              const on = item.key === active;
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-[11px] rounded-full py-[3px] pr-2.5 pl-[5px] text-[13.5px]",
                    on ? "bg-accent/15 font-medium text-white" : "text-[#c9c6c1] hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
                      on ? "bg-accent text-accent-ink" : "bg-white/[0.07] text-[#cfcac4]",
                    )}
                  >
                    <Icon className="size-[15px]" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="mt-auto flex flex-col gap-2.5 border-t border-frame-line px-1 pt-3.5">
          <div className="flex items-center gap-2 text-xs text-[#bdb9b3]">
            <span className="size-2 rounded-full bg-[#6fbf8e]" aria-hidden="true" />
            Buchhaltung: Lexware
          </div>
          <div className="flex items-center gap-2.5">
            <Avatar initials={user.initials} size="lg" className="bg-accent text-accent-ink" />
            <span>
              <b className="block text-base font-semibold text-white">{user.name}</b>
              <small className="block text-xs text-frame-muted">{user.role}</small>
            </span>
          </div>
        </div>
      </aside>

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
