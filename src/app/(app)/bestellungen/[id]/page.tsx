import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Karte } from "@/components/app/info-karte";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { ladeBestellAuswahl, ladeBestellung } from "@/lib/einkauf";
import { BESTELL_STATUS_TEXT, BESTELL_STATUS_TON } from "@/lib/einkauf-status";
import { heuteBerlin } from "@/lib/zeit";
import { BestellungEditor } from "../editor";
import { AllesGeliefert, BestellungLoeschen } from "../ui";

export const metadata: Metadata = { title: "Bestellung" };

const knopf = "inline-flex h-[38px] items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-line-strong";

/** Bestellung: direkt in der Maske bearbeitbar (Kopf, Positionen, Notiz), Lieferung je Zeile sofort */
export default async function BestellungSeite({ params }: PageProps<"/bestellungen/[id]">) {
  const { id } = await params;
  const [daten, auswahl] = await Promise.all([ladeBestellung(id), ladeBestellAuswahl()]);
  if (!daten) notFound();
  const { bestellung: b, kontakte, lieferant } = daten;
  const etwasGeliefert = b.zeilen.some((z) => z.geliefert);
  // Aufträge der Zeilen müssen in der Auswahl stehen, auch wenn sie inzwischen abgeschlossen sind
  const fehlende = b.zeilen.flatMap((z) => (z.auftrag && !auswahl.auftraege.some((a) => a.id === z.auftrag!.id) ? [{ ...z.auftrag, nochNichtBestellt: null }] : []));
  const auswahlMitZeilen = { ...auswahl, auftraege: [...auswahl.auftraege, ...new Map(fehlende.map((a) => [a.id, a])).values()] };

  return (
    <Shell active="bestellungen" crumbs={[{ label: "Einkauf" }, { label: "Bestellungen", href: "/bestellungen" }, { label: b.nummer }]}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-surface-sunken px-2.5 py-1 font-mono text-[13px]">{b.nummer}</span>
          <h1 className="text-4xl font-bold tracking-[-0.02em]">
            {b.lieferant ? (
              <Link href={`/lieferanten/${b.lieferant.id}`} className="hover:underline">
                {b.lieferant.name}
              </Link>
            ) : (
              "–"
            )}
          </h1>
          <Badge tone={BESTELL_STATUS_TON[b.abgeleitet]} dot data-bestellstatus={b.abgeleitet}>
            {BESTELL_STATUS_TEXT[b.abgeleitet]}
          </Badge>
        </div>
        {lieferant?.konfigurator_url && (
          <a href={lieferant.konfigurator_url} target="_blank" rel="noopener noreferrer" className={knopf}>
            <ExternalLink className="size-4" />
            Konfigurator
          </a>
        )}
      </div>
      {/* Nach dem Speichern neu aufbauen (neue Zeilen haben dann ihre IDs) */}
      <BestellungEditor
        key={b.updated_at}
        auswahl={auswahlMitZeilen}
        bestellung={b}
        heute={heuteBerlin()}
        aktionen={
          <>
            {b.abgeleitet !== "geliefert" && <AllesGeliefert id={b.id} />}
            {!etwasGeliefert && <BestellungLoeschen id={b.id} nummer={b.nummer} />}
          </>
        }
        seite={
          <Karte titel="Lieferant">
            {kontakte.length ? (
              <ul className="flex flex-col">
                {kontakte.map((k) => (
                  <li key={k.id} className="border-t border-line-soft py-2 text-sm first:border-t-0">
                    <b className="font-medium">{k.name}</b> <span className="text-muted-2">{k.funktion}</span>
                    {(k.handy || k.telefon) && (
                      <div>
                        <a href={`tel:${(k.handy || k.telefon)!.replace(/\s/g, "")}`} className="text-accent-text hover:underline">
                          {k.handy || k.telefon}
                        </a>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Keine Ansprechpartner.</p>
            )}
            <p className="mt-2 text-xs text-muted-2">Kd.-Nr. {lieferant?.unsere_kundennummer ?? "–"}</p>
          </Karte>
        }
      />
    </Shell>
  );
}
