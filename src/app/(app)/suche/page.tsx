import type { Metadata } from "next";
import Link from "next/link";
import { TrefferZeile } from "@/components/app/kopfzeile";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { cn } from "@/lib/cn";
import { SUCH_BEREICHE, type SuchBereich } from "@/lib/such-typen";
import { suchen } from "@/lib/suche";

export const metadata: Metadata = { title: "Suche" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Ergebnisseite der globalen Suche: Schnellfilter je Bereich mit Anzahl, eine Liste je Bereich */
export default async function SuchePage({ searchParams }: PageProps<"/suche">) {
  const sp = await searchParams;
  const q = eins(sp.q).trim();
  const bereich = SUCH_BEREICHE.some(([b]) => b === eins(sp.bereich)) ? (eins(sp.bereich) as SuchBereich) : null;
  const treffer = q.length >= 2 ? await suchen(q, 50) : [];
  const gruppen = SUCH_BEREICHE.map(([b, text]) => ({ b, text, liste: treffer.filter((t) => t.bereich === b) }));
  const sichtbar = gruppen.filter((g) => g.liste.length && (!bereich || g.b === bereich));
  const chip = "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm";

  return (
    <Shell active="" crumbs={[{ label: "Suche" }]}>
      <PageHeader title="Suche" sub={q.length >= 2 ? `${treffer.length === 1 ? "1 Ergebnis" : `${treffer.length} Ergebnisse`} für „${q}“` : "Bitte mindestens zwei Zeichen eingeben."} />
      {q.length >= 2 && (
        <nav aria-label="Bereiche" className="mb-4 flex flex-wrap gap-2" data-such-filter>
          <Link href={`/suche?q=${encodeURIComponent(q)}`} replace className={cn(chip, !bereich ? "border-ink bg-ink text-surface" : "border-line bg-surface hover:border-line-strong")}>
            Alle <span className="tabular opacity-70">{treffer.length}</span>
          </Link>
          {gruppen.map((g) => (
            <Link
              key={g.b}
              href={`/suche?q=${encodeURIComponent(q)}&bereich=${g.b}`}
              replace
              aria-disabled={!g.liste.length}
              className={cn(chip, bereich === g.b ? "border-ink bg-ink text-surface" : "border-line bg-surface hover:border-line-strong", !g.liste.length && "pointer-events-none opacity-50")}
            >
              {g.text} <span className="tabular opacity-70">{g.liste.length}</span>
            </Link>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-4">
        {sichtbar.map((g) => (
          <section key={g.b} className="rounded-lg border border-line-soft bg-surface p-2" data-such-bereich={g.b}>
            <h2 className="px-3 pt-2 pb-1 text-sm font-semibold">
              {g.text} <span className="font-normal text-muted-2">{g.liste.length}</span>
            </h2>
            <ul>
              {g.liste.map((t) => (
                <li key={t.id} className="border-t border-line-soft first:border-t-0">
                  <Link href={t.href} className="block" data-treffer={t.bereich}>
                    <TrefferZeile t={t} q={q} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {q.length >= 2 && !treffer.length && <p className="rounded-lg border border-line-soft bg-surface px-4 py-8 text-center text-sm text-muted">Keine Treffer. Gesucht wird in Nummern, Namen, Adressen, Telefon, E-Mail, Positionen, Bauvorhaben, Tags, Kommentaren und Notizen.</p>}
      </div>
    </Shell>
  );
}
