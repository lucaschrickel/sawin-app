"use client";

import { Menu } from "lucide-react";
import { Suspense, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Darstellung } from "@/lib/darstellung";
import { DarstellungAbgleich } from "./darstellung";
import { Inaktivitaet } from "./inaktivitaet";
import { Glocke, GlobaleSuche, NeuMenue } from "./kopfzeile";
import { Seitenleiste } from "./seitenleiste";
import { useRahmen } from "./rahmen-kontext";
import { Pfad, Verlauf } from "./verlauf";

type AppShellProps = {
  brand: { name: string; logo: ReactNode; symbol: ReactNode };
  user: { initials: string; name: string; role: string };
  /** Seitenleiste eingeklappt (je Benutzer gemerkt) */
  eingeklappt: boolean;
  /** automatische Abmeldung nach so vielen Minuten ohne Eingabe */
  inaktivMinuten: number;
  /** Lexware-Anbindung eingerichtet (Schlüssel auf dem Server gesetzt) */
  lexware: boolean;
  /** Farbschema und Seitenleiste des Benutzers (Einstellungen › Darstellung) */
  darstellung: Darstellung;
  children: ReactNode;
};

/** App-Rahmen: dunkle Seitenleiste, helles Inhaltsfeld, Kopfzeile mit Suche, „Neu“-Menü und Glocke. */
export function AppShell({ brand, user, eingeklappt, inaktivMinuten, lexware, darstellung, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  // Menüpunkt, Pfad und Zähler meldet die jeweilige Seite (Rahmen bleibt beim Seitenwechsel stehen)
  const { active, crumbs, zaehler } = useRahmen();

  return (
    <div className="flex min-h-screen py-3 pr-3 max-[960px]:p-0">
      <Inaktivitaet minuten={inaktivMinuten} />
      <DarstellungAbgleich {...darstellung} />
      <Seitenleiste active={active} brand={brand} user={user} zaehler={zaehler} eingeklappt={eingeklappt} offen={open} lexware={lexware} />

      {open && (
        <div className="fixed inset-0 z-[55] bg-black/40 min-[961px]:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-clip rounded-xl bg-canvas max-[960px]:rounded-none">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3.5 bg-canvas/90 px-8 pt-4 pb-3.5 backdrop-blur max-[960px]:px-4 max-[960px]:py-2.5">
          <Button size="icon" className="min-[961px]:hidden" aria-label="Menü öffnen" onClick={() => setOpen(true)}>
            <Menu className="size-[18px]" />
          </Button>
          {crumbs ? (
            <Suspense fallback={<Pfad crumbs={crumbs} />}>
              <Verlauf crumbs={crumbs} />
            </Suspense>
          ) : (
            // Seite lädt noch: Platz halten, damit Suche und Knöpfe nicht springen
            <div className="min-w-0" aria-hidden="true" />
          )}
          <GlobaleSuche />
          <div className="flex items-center gap-2.5">
            <NeuMenue />
            <Glocke />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1360px] px-8 pt-2 pb-20 max-[960px]:px-4">{children}</main>
      </div>
    </div>
  );
}
