"use client";

import { useOptimistic, useTransition } from "react";
import { cn } from "@/lib/cn";
import { dashboardAnsichtSetzen } from "@/lib/ansicht-aktion";

type Ansicht = "gf" | "montage" | "einkauf";
const ANSICHTEN: [Ansicht, string][] = [
  ["gf", "Geschäftsführung"],
  ["montage", "Montage"],
  ["einkauf", "Einkauf"],
];

/** Umschalter der Dashboard-Ansicht; die Wahl wird je Benutzer gemerkt (keine Rolle, keine Rechte) */
export function DashboardUmschalter({ ansicht }: { ansicht: Ansicht }) {
  const [laeuft, starten] = useTransition();
  const [aktiv, setAktiv] = useOptimistic(ansicht);
  return (
    <div role="tablist" aria-label="Dashboard-Ansicht" className="flex gap-1 rounded-full bg-surface-sunken p-1">
      {ANSICHTEN.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={aktiv === v}
          disabled={laeuft}
          onClick={() =>
            starten(async () => {
              setAktiv(v);
              await dashboardAnsichtSetzen(v);
            })
          }
          className={cn("rounded-full px-3.5 py-1.5 text-sm", aktiv === v ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
