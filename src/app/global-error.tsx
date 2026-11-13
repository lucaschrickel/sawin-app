"use client";

// Ersetzt das Root-Layout, wenn dort ein Fehler auftritt: eigenes Dokument mit Schrift und Tokens
import "@fontsource-variable/inter";
import "./globals.css";

/** Schwerer Fehler (auch im Rahmen der App). Ohne technische Details, nur mit der Kennung aus dem Server-Log. */
export default function SchwererFehler({ error, retry }: { error: unknown; retry: () => void }) {
  const kennung = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <html lang="de" data-customer={process.env.NEXT_PUBLIC_CUSTOMER_ID}>
      <body className="min-h-full bg-canvas">
        <title>Fehler</title>
        <main className="grid min-h-screen place-items-center px-6 py-16" data-fehlerseite="global">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold text-ink">Die App konnte nicht geladen werden</h1>
            <p className="mt-3 text-muted">Bitte lade die Seite neu. Bleibt der Fehler, gib die Fehlernummer an den Support weiter.</p>
            {kennung && (
              <p className="mt-3 text-sm text-muted">
                Fehlernummer: <code className="font-mono">{kennung}</code>
              </p>
            )}
            <button
              type="button"
              onClick={() => retry()}
              className="mt-6 rounded-lg bg-accent px-4 py-2 font-medium text-accent-ink"
            >
              Erneut versuchen
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
