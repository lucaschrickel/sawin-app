import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Seite nicht gefunden (404): auch für gelöschte oder fremde Datensätze (notFound()) */
export default function NichtGefunden() {
  return (
    <main className="grid min-h-[60vh] place-items-center px-6 py-16" data-fehlerseite="404">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-muted">Fehler 404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Seite nicht gefunden</h1>
        <p className="mt-3 text-muted">
          Diese Seite gibt es nicht oder nicht mehr, zum Beispiel weil der Eintrag gelöscht wurde. Prüfe die Adresse oder
          gehe zurück zur Startseite.
        </p>
        <Link href="/" className={buttonVariants({ variant: "primary", className: "mt-6" })}>
          Zur Startseite
        </Link>
      </div>
    </main>
  );
}
