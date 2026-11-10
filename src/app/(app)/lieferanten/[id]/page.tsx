import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { Angabe, Karte } from "@/components/app/info-karte";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { ladeLieferant } from "@/lib/einkauf";
import { BESTELL_STATUS_TEXT, BESTELL_STATUS_TON } from "@/lib/einkauf-status";
import { tag } from "@/lib/zeit";
import { NeueBestellung } from "../../bestellungen/neu";
import { KonditionFormular, LieferantDialog, LieferantLoeschen, VertraulichMarke } from "../ui";

export const metadata: Metadata = { title: "Lieferant" };

const knopf = "inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm hover:border-line-strong";

export default async function LieferantSeite({ params }: PageProps<"/lieferanten/[id]">) {
  const { id } = await params;
  const daten = await ladeLieferant(id);
  if (!daten) notFound();
  const { lieferant: l, bestellungen, kondition, darfKonditionen } = daten;

  return (
    <Shell active="lieferanten" crumbs={[{ label: "Einkauf" }, { label: "Lieferanten", href: "/lieferanten" }, { label: l.name }]}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-[-0.02em]">{l.name}</h1>
          {l.produktgruppen.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{l.produktgruppen.map((p) => <Badge key={p} tone="gray">{p}</Badge>)}</div>}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {l.konfigurator_url && <a href={l.konfigurator_url} target="_blank" rel="noopener noreferrer" className={knopf}><ExternalLink className="size-3.5" />Konfigurator</a>}
          {l.haendlerportal_url && <a href={l.haendlerportal_url} target="_blank" rel="noopener noreferrer" className={knopf}><ExternalLink className="size-3.5" />Händlerportal</a>}
          <NeueBestellung lieferantId={l.id} />
          <LieferantDialog lieferant={l} />
          <LieferantLoeschen id={l.id} name={l.name} />
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Karte titel="Bestellungen" rechts={<span className="text-sm text-muted-2 tabular">{bestellungen.length}</span>}>
          {bestellungen.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Bestellung</Th>
                  <Th>Datum</Th>
                  <Th>AB-Nr.</Th>
                  <Th>Aufträge</Th>
                  <Th>KW</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {bestellungen.map((b) => (
                  <tr key={b.id}>
                    <Td><Link href={`/bestellungen/${b.id}`} className="font-mono font-medium hover:underline">{b.nummer}</Link></Td>
                    <Td className="whitespace-nowrap">{tag(b.bestelldatum)}</Td>
                    <Td className="font-mono text-[13px]">{b.lieferanten_ab_nummer ?? "–"}</Td>
                    <Td className="text-sm">{[...new Set(b.zeilen.map((z) => z.auftrag?.nummer).filter(Boolean))].join(", ")}</Td>
                    <Td className="tabular">{b.liefer_kw ?? "–"}</Td>
                    <Td><Badge tone={BESTELL_STATUS_TON[b.abgeleitet]}>{BESTELL_STATUS_TEXT[b.abgeleitet]}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted">Noch keine Bestellungen.</p>
          )}
        </Karte>
        <div className="flex flex-col gap-4">
          {darfKonditionen && (
            <Karte titel="Konditionen" rechts={<VertraulichMarke />}>
              <KonditionFormular lieferantId={l.id} text={kondition?.text ?? ""} />
            </Karte>
          )}
          <Karte titel="Stammdaten">
            <dl className="flex flex-col gap-3 text-[14.5px]">
              <Angabe name="Unsere Kundennummer"><span className="font-mono">{l.unsere_kundennummer ?? "–"}</span></Angabe>
              <Angabe name="Lieferzeit">{l.lieferzeit ?? "–"}</Angabe>
              <Angabe name="Telefon">{l.telefon ? <a href={`tel:${l.telefon.replace(/\s/g, "")}`} className="text-accent-text hover:underline">{l.telefon}</a> : "–"}</Angabe>
              {l.notiz && <Angabe name="Notiz"><span className="whitespace-pre-line">{l.notiz}</span></Angabe>}
            </dl>
          </Karte>
          <Karte titel="Ansprechpartner">
            {l.kontakte.length ? (
              <ul className="flex flex-col">
                {l.kontakte.map((k) => (
                  <li key={k.id} className="border-t border-line-soft py-2.5 first:border-t-0" data-kontakt={k.name}>
                    <b className="font-semibold">{k.name}</b> <span className="text-sm text-muted-2">{k.funktion}</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {k.handy && <a href={`tel:${k.handy.replace(/\s/g, "")}`} className={knopf}><Phone className="size-3.5" />{k.handy}</a>}
                      {k.telefon && <a href={`tel:${k.telefon.replace(/\s/g, "")}`} className={knopf}><Phone className="size-3.5" />{k.telefon}</a>}
                      {k.email && <a href={`mailto:${k.email}`} className={knopf}><Mail className="size-3.5" />{k.email}</a>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Keine Ansprechpartner.</p>
            )}
          </Karte>
        </div>
      </div>
    </Shell>
  );
}
