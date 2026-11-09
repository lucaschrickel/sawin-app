"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Ändert Suchparameter einer Liste (ersetzt den Verlaufseintrag, Seite zurück auf 1). */
export function useListenParameter() {
  const router = useRouter();
  const pfad = usePathname();
  const params = useSearchParams();
  return (aenderung: Record<string, string>) => {
    const neu = new URLSearchParams(params);
    for (const [k, v] of Object.entries(aenderung)) {
      if (v) neu.set(k, v);
      else neu.delete(k);
    }
    neu.delete("seite");
    const qs = neu.toString();
    router.replace(qs ? `${pfad}?${qs}` : pfad, { scroll: false });
  };
}

/** Suchfeld einer Liste: filtert beim Tippen (Parameter q in der URL). */
export function ListenSuche({ wert, label, platzhalter }: { wert: string; label: string; platzhalter: string }) {
  const setze = useListenParameter();
  const [q, setQ] = useState(wert);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <label className="flex h-[42px] max-w-[380px] flex-[1_1_260px] items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-muted-2">
      <Search className="size-4" aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        placeholder={platzhalter}
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setze({ q: v.trim() }), 300);
        }}
        className="min-w-0 flex-1 bg-transparent text-ink outline-none"
      />
    </label>
  );
}
