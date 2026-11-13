"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Unerwarteter Fehler in einer Seite der App (innerhalb von Seitenleiste und Kopfzeile). Zeigt nie technische Details:
 * In Produktion liefert Next.js für Fehler aus Server-Komponenten nur eine Kennung (digest), die im Server-Log steht.
 */
export default function Fehler({ error, retry }: { error: unknown; retry: () => void }) {
  const kennung = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <div className="grid min-h-[50vh] place-items-center px-6 py-16" data-fehlerseite="fehler">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-ink">Da ist etwas schiefgelaufen</h1>
        <p className="mt-3 text-muted">
          Die Seite konnte nicht geladen werden. Bitte versuche es noch einmal. Bleibt der Fehler, gib die Fehlernummer an
          den Support weiter.
        </p>
        {kennung && (
          <p className="mt-3 text-sm text-muted">
            Fehlernummer: <code className="font-mono">{kennung}</code>
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="primary" onClick={() => retry()}>Erneut versuchen</Button>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}
