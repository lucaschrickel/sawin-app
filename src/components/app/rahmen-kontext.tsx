"use client";

import { usePathname } from "next/navigation";
import { createContext, use, useLayoutEffect, useState, type ReactNode } from "react";
import { NAVIGATION, type Zaehler } from "./navigation";

/*
  Seitenleiste und Kopfzeile liegen im Layout von (app) und bleiben beim Seitenwechsel stehen. Jede Seite meldet über
  <Shell> (SeiteMelden) ihren Menüpunkt und ihren fachlichen Pfad; ihre Zähler kommen nach (ZaehlerMelden). Gemeldete
  Werte gelten nur für den Pfad, für den sie gemeldet wurden: Während die nächste Seite lädt, zeigt die Seitenleiste
  den Menüpunkt aus der Adresse, nie den der vorherigen Seite.
*/

export type Krume = { label: string; href?: string };
type Seite = { pfad: string; active: string; crumbs: Krume[] };
type Rahmen = {
  seite: Seite | null;
  zaehler: Zaehler;
  setSeite: (s: Seite) => void;
  setZaehler: (z: Zaehler) => void;
};

const RahmenKontext = createContext<Rahmen | null>(null);

export function RahmenProvider({ zaehler: start, children }: { zaehler: Zaehler; children: ReactNode }) {
  const [seite, setSeite] = useState<Seite | null>(null);
  const [zaehler, setZaehler] = useState<Zaehler>(start);
  return <RahmenKontext value={{ seite, zaehler, setSeite, setZaehler }}>{children}</RahmenKontext>;
}

/** Menüpunkt aus der Adresse (längster passender Eintrag der Seitenleiste) */
export function aktivAusPfad(pathname: string): string {
  if (pathname === "/") return "dashboard";
  let treffer = "";
  let laenge = 0;
  for (const g of NAVIGATION)
    for (const i of g.items)
      if (i.href !== "/" && (pathname === i.href || pathname.startsWith(`${i.href}/`)) && i.href.length > laenge) {
        treffer = i.key;
        laenge = i.href.length;
      }
  return treffer;
}

/** Für Seitenleiste und Kopfzeile: Menüpunkt, Pfad (nur wenn für diese Adresse gemeldet) und Zähler */
export function useRahmen() {
  const r = use(RahmenKontext);
  const pathname = usePathname();
  const passend = r?.seite && r.seite.pfad === pathname ? r.seite : null;
  return { active: passend ? passend.active : aktivAusPfad(pathname), crumbs: passend?.crumbs ?? null, zaehler: r?.zaehler ?? {} };
}

/** Meldet Menüpunkt und Pfad der Seite (vor dem Zeichnen, damit nichts springt) */
export function SeiteMelden({ active, crumbs }: { active: string; crumbs: Krume[] }) {
  const r = use(RahmenKontext);
  const pathname = usePathname();
  const schluessel = JSON.stringify(crumbs);
  useLayoutEffect(() => {
    r?.setSeite({ pfad: pathname, active, crumbs: JSON.parse(schluessel) as Krume[] });
    // r ist stabil genug: setSeite stammt aus useState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, active, schluessel]);
  return null;
}

/** Aktuelle Zähler der Seitenleiste (lädt jede Seite im Hintergrund mit) */
export function ZaehlerMelden({ zaehler }: { zaehler: Zaehler }) {
  const r = use(RahmenKontext);
  const schluessel = JSON.stringify(zaehler);
  useLayoutEffect(() => {
    r?.setZaehler(JSON.parse(schluessel) as Zaehler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);
  return null;
}
