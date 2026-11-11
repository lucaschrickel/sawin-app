import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Table, Td, Th } from "@/components/ui/table";
import { getCustomer } from "@/customers";
import { cn } from "@/lib/cn";
import { KUNDEN_JE_SEITE, ladeKundenListe, type ListenFilter } from "@/lib/kunden";
import { KundeDialog } from "./kunde-dialog";
import { KlickZeile } from "@/components/app/klick-zeile";
import { HerkunftFilter, KundenSuche } from "./ui";

export const metadata: Metadata = { title: "Kunden" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function KundenPage({ searchParams }: PageProps<"/kunden">) {
  const sp = await searchParams;
  const filter: ListenFilter = {
    q: eins(sp.q),
    typ: eins(sp.typ) === "privat" || eins(sp.typ) === "firma" ? (eins(sp.typ) as "privat" | "firma") : "",
    herkunft: eins(sp.herkunft),
    seite: Math.max(1, Number.parseInt(eins(sp.seite), 10) || 1),
  };
  const { liste, gesamt, anzahl } = await ladeKundenListe(filter);
  const herkunftListe = getCustomer().herkunft;
  const seiten = Math.max(1, Math.ceil(gesamt / KUNDEN_JE_SEITE));

  // Links für Typ-Filter und Seiten behalten die übrigen Parameter
  const href = (aenderung: Record<string, string>) => {
    const p = new URLSearchParams();
    const werte = { q: filter.q, typ: filter.typ, herkunft: filter.herkunft, seite: "", ...aenderung };
    for (const [k, v] of Object.entries(werte)) if (v && !(k === "seite" && v === "1")) p.set(k, v);
    const qs = p.toString();
    return qs ? `/kunden?${qs}` : "/kunden";
  };
  const TYPEN = [
    ["", "Alle", anzahl.alle],
    ["privat", "Privat", anzahl.privat],
    ["firma", "Firma", anzahl.firma],
  ] as const;

  return (
    <Shell active="kunden" crumbs={[{ label: "Kunden & Anfragen" }, { label: "Kunden" }]}>
      <PageHeader
        title="Kunden"
        sub="Gepflegt in der App · an Lexware erst mit dem ersten Beleg"
        actions={<KundeDialog herkunftListe={herkunftListe} key={String(sp.neu ?? "")} startOffen={!!sp.neu} />}
      />
      <div className="rounded-lg border border-line-soft bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3.5">
          <KundenSuche wert={filter.q} />
          <nav aria-label="Nach Typ filtern" className="flex gap-1 rounded-full bg-surface-sunken p-1">
            {TYPEN.map(([wert, label, n]) => (
              <Link
                key={label}
                href={href({ typ: wert })}
                replace
                scroll={false}
                aria-current={filter.typ === wert ? "true" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm",
                  filter.typ === wert ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink",
                )}
              >
                {label}
                <span className="text-xs text-muted-2 tabular">{n}</span>
              </Link>
            ))}
          </nav>
          <HerkunftFilter wert={filter.herkunft} liste={herkunftListe} />
        </div>

        {liste.length ? (
          <Table className="min-w-[640px]">
            <thead>
              <tr>
                <Th className="pl-4">Nr.</Th>
                <Th>Name</Th>
                <Th>Typ</Th>
                <Th>Ort</Th>
                <Th className="pr-4">Telefon</Th>
              </tr>
            </thead>
            <tbody>
              {liste.map((k) => (
                <KlickZeile key={k.id} href={`/kunden/${k.id}`}>
                  <Td className="pl-4 font-mono text-[13px] text-muted">{k.nummer}</Td>
                  <Td>
                    <Link href={`/kunden/${k.id}`} className="font-medium hover:underline">{k.name}</Link>
                    {k.ansprechpartner && <div className="text-sm text-muted">{k.ansprechpartner}</div>}
                  </Td>
                  <Td>{k.typ === "firma" ? "Firma" : "Privat"}</Td>
                  <Td>{k.ort ?? "–"}</Td>
                  <Td className="pr-4 whitespace-nowrap">{k.telefon ?? "–"}</Td>
                </KlickZeile>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {filter.q || filter.typ || filter.herkunft ? "Keine Kunden für diese Suche." : "Noch keine Kunden. Lege den ersten über „Neuer Kunde“ an."}
          </p>
        )}

        {seiten > 1 && (
          <nav aria-label="Seiten" className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
            <span>
              {(filter.seite - 1) * KUNDEN_JE_SEITE + 1}–{Math.min(filter.seite * KUNDEN_JE_SEITE, gesamt)} von {gesamt}
            </span>
            <span className="flex gap-2">
              {filter.seite > 1 && <Link className="hover:text-ink" href={href({ seite: String(filter.seite - 1) })}>← Zurück</Link>}
              {filter.seite < seiten && <Link className="hover:text-ink" href={href({ seite: String(filter.seite + 1) })}>Weiter →</Link>}
            </span>
          </nav>
        )}
      </div>
    </Shell>
  );
}
