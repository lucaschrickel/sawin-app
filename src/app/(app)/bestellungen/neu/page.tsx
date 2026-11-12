import type { Metadata } from "next";
import { Shell } from "@/components/app/shell";
import { ladeBestellAuswahl } from "@/lib/einkauf";
import { heuteBerlin } from "@/lib/zeit";
import { BestellungEditor } from "../editor";

export const metadata: Metadata = { title: "Neue Bestellung" };

/** Neue Bestellung direkt in der Maske; vorbelegt mit ?lieferant=… bzw. ?auftrag=… (Positionen aus „Noch nicht bestellt“) */
export default async function NeueBestellungSeite({ searchParams }: PageProps<"/bestellungen/neu">) {
  const sp = await searchParams;
  const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;
  const auswahl = await ladeBestellAuswahl();
  return (
    <Shell active="bestellungen" crumbs={[{ label: "Einkauf" }, { label: "Bestellungen", href: "/bestellungen" }, { label: "Neue Bestellung" }]}>
      <h1 className="mb-5 text-4xl font-bold tracking-[-0.02em]">Neue Bestellung</h1>
      <BestellungEditor auswahl={auswahl} vorlage={{ lieferantId: eins(sp.lieferant), auftragId: eins(sp.auftrag) }} heute={heuteBerlin()} />
    </Shell>
  );
}
