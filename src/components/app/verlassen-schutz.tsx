"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/*
  Schutz vor dem Verlassen mit ungespeicherten Änderungen (CLAUDE.md „Speichern“): Links in der App, Browser-Zurück und
  Schließen bzw. Neuladen des Tabs. Links und Zurück öffnen die Abfrage Speichern | Verwerfen | Abbrechen, beim Schließen
  warnt der Browser. Genutzt vom Beleg-Editor und von der Bestellung.
*/

export type Verlassen = null | { weiter: () => void };

export function useVerlassenSchutz(geaendert: boolean) {
  const router = useRouter();
  const [verlassen, setVerlassen] = useState<Verlassen>(null);
  const geaendertRef = useRef(geaendert);
  useEffect(() => {
    geaendertRef.current = geaendert;
  }, [geaendert]);
  useEffect(() => {
    if (!geaendert) return;
    const vorEntladen = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const klick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || a.hasAttribute("download")) return;
      const ziel = new URL(a.href, location.href);
      if (ziel.origin !== location.origin || (ziel.pathname === location.pathname && ziel.search === location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      setVerlassen({ weiter: () => router.push(ziel.pathname + ziel.search) });
    };
    // Browser-Zurück: Wächter-Eintrag im Verlauf (gleicher Zustand wie die aktuelle Seite)
    history.pushState(history.state, "", location.href);
    const zurueckTaste = () => {
      if (!geaendertRef.current) return;
      history.pushState(history.state, "", location.href);
      setVerlassen({ weiter: () => history.go(-2) });
    };
    window.addEventListener("beforeunload", vorEntladen);
    document.addEventListener("click", klick, true);
    window.addEventListener("popstate", zurueckTaste);
    return () => {
      window.removeEventListener("beforeunload", vorEntladen);
      document.removeEventListener("click", klick, true);
      window.removeEventListener("popstate", zurueckTaste);
    };
  }, [geaendert, router]);
  return { verlassen, setVerlassen, geaendertRef };
}

/** Abfrage beim Verlassen: Abbrechen bleibt, Verwerfen geht ohne Speichern weiter, Speichern speichert und geht weiter */
export function VerlassenDialog({
  verlassen,
  text,
  onAbbrechen,
  onVerwerfen,
  onSpeichern,
}: {
  verlassen: Verlassen;
  text: string;
  onAbbrechen: () => void;
  onVerwerfen: (weiter: () => void) => void;
  onSpeichern: (weiter: () => void) => void;
}) {
  return (
    <Dialog open={!!verlassen} onOpenChange={(o) => !o && onAbbrechen()}>
      <DialogContent title="Ungespeicherte Änderungen">
        <p className="text-base text-ink-3">{text}</p>
        <div className="flex flex-wrap justify-end gap-2.5 pt-5">
          <Button onClick={onAbbrechen}>Abbrechen</Button>
          <Button variant="danger" onClick={() => verlassen && onVerwerfen(verlassen.weiter)}>
            Verwerfen
          </Button>
          <Button variant="primary" onClick={() => verlassen && onSpeichern(verlassen.weiter)}>
            Speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
