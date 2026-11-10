import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { KlickZeile } from "@/components/app/klick-zeile";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { ladeFahrzeuge } from "@/lib/fahrzeuge";
import { heute as ladeHeute } from "@/lib/heute";
import { PRUEFTERMINE, pruefAmpel } from "@/lib/pruefung";
import { kurzTermin, tag } from "@/lib/zeit";
import { FahrzeugDialog } from "./ui";

export const metadata: Metadata = { title: "Fahrzeuge" };

export default async function FahrzeugePage() {
  const heute = await ladeHeute();
  const liste = await ladeFahrzeuge();
  const faellig = liste
    .flatMap((f) => PRUEFTERMINE.map(([k, l]) => ({ f, l, a: pruefAmpel(f[k], heute) })))
    .filter((x) => x.a && x.a.tage <= 30)
    .sort((a, b) => a.a!.tage - b.a!.tage);

  return (
    <Shell active="fahrzeuge" crumbs={[{ label: "Team und Ressourcen" }, { label: "Fahrzeuge" }]}>
      <PageHeader title="Fahrzeuge" sub="Fahrzeugpool mit Prüfterminen · im Termin-Dialog der Plantafel einem Einsatz zuordnen" actions={<FahrzeugDialog />} />
      {faellig.length > 0 && (
        <p role="alert" className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-4 py-3 text-sm ${faellig.some((x) => x.a!.tage < 0) ? "bg-tone-red-bg text-tone-red-fg" : "bg-tone-amber-bg text-tone-amber-fg"}`}>
          <AlertTriangle className="size-4 shrink-0" />
          {faellig.map((x) => (
            <span key={`${x.f.id}-${x.l}`}>
              <b className="font-semibold">{x.f.kennzeichen}</b> {x.l} {x.a!.tage < 0 ? `überfällig seit ${-x.a!.tage} ${x.a!.tage === -1 ? "Tag" : "Tagen"}` : `in ${x.a!.tage} ${x.a!.tage === 1 ? "Tag" : "Tagen"}`}
            </span>
          ))}
        </p>
      )}
      <div className="rounded-lg border border-line-soft bg-surface">
        {liste.length ? (
          <Table className="min-w-[900px]">
            <thead>
              <tr>
                <Th className="pl-4">Kennzeichen</Th>
                {PRUEFTERMINE.map(([, l]) => <Th key={l}>{l}</Th>)}
                <Th className="text-right">Kilometer</Th>
                <Th className="pr-4">Nächster Einsatz</Th>
              </tr>
            </thead>
            <tbody>
              {liste.map((f) => (
                <KlickZeile key={f.id} href={`/fahrzeuge/${f.id}`}>
                  <Td className="pl-4">
                    <Link href={`/fahrzeuge/${f.id}`} className="font-mono font-medium hover:underline">{f.kennzeichen}</Link>
                    {f.typ && <div className="text-sm text-muted">{f.typ}</div>}
                    {f.werkstatt.length > 0 && (
                      <div className="mt-1 text-xs text-tone-amber-fg">Werkstatt {f.werkstatt.map((w) => (w.von === w.bis ? tag(w.von) : `${tag(w.von)} – ${tag(w.bis)}`)).join(", ")}</div>
                    )}
                  </Td>
                  {PRUEFTERMINE.map(([k, l]) => {
                    const a = pruefAmpel(f[k], heute);
                    return <Td key={l} className="whitespace-nowrap" data-pruefung={k}>{a ? <Badge tone={a.ton}>{a.text}</Badge> : <span className="text-muted-2">–</span>}</Td>;
                  })}
                  <Td className="text-right font-mono text-[13px]">{f.km_stand != null ? f.km_stand.toLocaleString("de-DE") : "–"}</Td>
                  <Td className="pr-4 text-sm whitespace-nowrap text-ink-3">{f.naechsterEinsatz ? kurzTermin(f.naechsterEinsatz) : "Kein Einsatz geplant"}</Td>
                </KlickZeile>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted">Noch keine Fahrzeuge. Über „Fahrzeug“ anlegen.</p>
        )}
      </div>
    </Shell>
  );
}
