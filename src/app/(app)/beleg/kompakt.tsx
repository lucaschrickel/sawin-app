import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { anzeigeStatus, BELEGART_KURZ, type BelegKurz } from "@/lib/belege-status";
import { eurK } from "@/lib/format";
import { tag } from "@/lib/zeit";

/** Kompakte Belegliste in Kettenfolge (Auftrag, Anfrage): Kürzel, Nummer, Betrag, Status */
export function BelegeKompakt({ belege, kette, heute, mitDatum }: { belege: BelegKurz[]; kette?: BelegKurz[]; heute: string; mitDatum?: boolean }) {
  return (
    <ul className="flex flex-col" data-belege-kompakt>
      {belege.map((b) => {
        const s = anzeigeStatus(b, kette ?? belege.filter((x) => x.kette_id === b.kette_id), heute);
        return (
          <li key={b.id} className="flex items-center gap-2.5 border-t border-line-soft py-2 text-sm first:border-t-0" data-beleg={b.id}>
            <span className="w-8 shrink-0 font-mono text-[11.5px] font-semibold text-muted-2">{BELEGART_KURZ[b.art]}</span>
            <Link href={`/beleg/${b.id}`} className="min-w-0 flex-1 truncate font-mono text-[13px] hover:underline">
              {b.nummer ?? <span className="font-sans text-muted">Entwurf</span>}
              {mitDatum && <span className="ml-2 font-sans text-xs text-muted-2">{tag(b.datum)}</span>}
            </Link>
            <span className="shrink-0 text-right tabular text-muted">{b.art === "lieferschein" ? "–" : eurK(b.summe_brutto)}</span>
            <Badge tone={s.ton} dot className="shrink-0">{s.text}</Badge>
          </li>
        );
      })}
    </ul>
  );
}
