"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Tabellenzeile, die per Klick eine Seite öffnet (ein Link in der Zeile bleibt für Tastatur und Screenreader). */
export function KlickZeile({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer hover:bg-surface-muted"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, label")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
