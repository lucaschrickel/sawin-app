import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Karte } from "@/components/app/info-karte";
import { KlickZeile } from "@/components/app/klick-zeile";
import { ListenSuche } from "@/components/app/listen-suche";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { ladeBestellungen, ladeNochNichtBestellt, type BestellFilter } from "@/lib/einkauf";
import { BESTELL_STATUS_TEXT, BESTELL_STATUS_TON } from "@/lib/einkauf-status";
import { tag } from "@/lib/zeit";
import { NeueBestellung } from "./neu";

export const metadata: Metadata = { title: "Bestellungen" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ANSICHTEN: { wert: BestellFilter["ansicht"]; text: string }[] = [
  { wert: "offen", text: "Offen" },
  { wert: "geliefert", text: "Geliefert" },
  { wert: "alle", text: "Alle" },
];

export default async function BestellungenPage({ searchParams }: PageProps<"/bestellungen">) {
  const sp = await searchParams;
  const ansicht = (["offen", "geliefert", "alle"] as const).find((x) => x === eins(sp.ansicht)) ?? "offen";
  const q = eins(sp.q);
  const [{ liste, anzahl }, fehlt] = await Promise.all([ladeBestellungen({ ansicht, q }), ladeNochNichtBestellt()]);
  const href = (a: string) => {
    const p = new URLSearchParams();
    if (a !== "offen") p.set("ansicht", a);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/bestellungen?${s}` : "/bestellungen";
  };
  const chip = (aktiv: boolean) => cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm", aktiv ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink");

  return (
    <Shell active="bestellungen" crumbs={[{ label: "Einkauf" }, { label: "Bestellungen" }]}>
      <PageHeader title="Bestellungen" sub="Bestellungen bei Lieferanten · eine Bestellung kann mehrere Aufträge abdecken" actions={<NeueBestellung key={String(sp.neu ?? "")} startOffen={!!sp.neu} />} />
      <div className="flex flex-col gap-4">
        {fehlt.length > 0 && (
          <Karte titel="Noch nicht bestellt" rechts={<span className="text-sm text-muted-2 tabular">{fehlt.length}</span>}>
            <ul className="flex flex-col" data-noch-nicht-bestellt>
              {fehlt.map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-t border-line-soft py-2.5 text-sm first:border-t-0">
                  <Link href={`/auftraege/${a.id}`} className="w-[92px] shrink-0 font-mono text-[13px] font-medium hover:underline">{a.nummer}</Link>
                  <span className="min-w-0 flex-1">
                    {a.kunde?.name ?? "–"}
                    <span className="block text-xs whitespace-pre-line text-muted-2">{a.noch_nicht_bestellt}</span>
                  </span>
                  <NeueBestellung
                    auftragId={a.id}
                    ausloeser={
                      <button type="button" aria-label={`${a.nummer} bestellen`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium hover:border-line-strong">
                        <ShoppingCart className="size-3.5" />
                        Bestellen
                      </button>
                    }
                  />
                </li>
              ))}
            </ul>
          </Karte>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <ListenSuche wert={q} label="Bestellungen durchsuchen" platzhalter="Nummer, Lieferant, Auftrag, Artikel …" />
          <nav aria-label="Nach Status filtern" className="flex gap-1 rounded-full bg-surface-sunken p-1">
            {ANSICHTEN.map((x) => (
              <Link key={x.wert} replace scroll={false} href={href(x.wert)} aria-current={ansicht === x.wert ? "true" : undefined} className={chip(ansicht === x.wert)}>
                {x.text} <span className="text-xs text-muted-2 tabular">{anzahl[x.wert]}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="rounded-lg border border-line-soft bg-surface">
          {liste.length ? (
            <Table className="min-w-[860px]">
              <thead>
                <tr>
                  <Th className="pl-4">Bestellung</Th>
                  <Th>Lieferant</Th>
                  <Th>Datum</Th>
                  <Th>AB-Nr. Lieferant</Th>
                  <Th>Aufträge</Th>
                  <Th className="text-right">Geliefert</Th>
                  <Th>Liefer-KW</Th>
                  <Th className="pr-4">Status</Th>
                </tr>
              </thead>
              <tbody>
                {liste.map((b) => {
                  const auftraege = [...new Map(b.zeilen.filter((z) => z.auftrag).map((z) => [z.auftrag!.id, z.auftrag!])).values()];
                  return (
                    <KlickZeile key={b.id} href={`/bestellungen/${b.id}`}>
                      <Td className="pl-4 whitespace-nowrap"><Link href={`/bestellungen/${b.id}`} className="font-mono font-medium hover:underline">{b.nummer}</Link></Td>
                      <Td>{b.lieferant?.name ?? "–"}</Td>
                      <Td className="whitespace-nowrap">{tag(b.bestelldatum)}</Td>
                      <Td className="font-mono text-[13px]">{b.lieferanten_ab_nummer ?? "–"}</Td>
                      <Td className="text-sm">
                        {auftraege.map((a, i) => (
                          <span key={a.id}>
                            {i > 0 && ", "}
                            <Link href={`/auftraege/${a.id}`} className="font-mono hover:underline">{a.nummer}</Link>
                          </span>
                        ))}
                        {auftraege.length > 1 && <Badge tone="gray" className="ml-1.5">Sammel</Badge>}
                      </Td>
                      <Td className="text-right tabular">{b.zeilen.filter((z) => z.geliefert).length}/{b.zeilen.length}</Td>
                      <Td className="tabular">{b.liefer_kw ? `KW ${b.liefer_kw}` : "–"}</Td>
                      <Td className="pr-4"><Badge tone={BESTELL_STATUS_TON[b.abgeleitet]} dot>{BESTELL_STATUS_TEXT[b.abgeleitet]}</Badge></Td>
                    </KlickZeile>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted">{q ? "Keine Bestellungen für diese Suche." : ansicht === "offen" ? "Keine offenen Bestellungen." : "Noch keine Bestellungen."}</p>
          )}
        </div>
      </div>
    </Shell>
  );
}
