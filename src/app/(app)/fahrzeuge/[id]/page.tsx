import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { Angabe, Karte } from "@/components/app/info-karte";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { ladeFahrzeug } from "@/lib/fahrzeuge";
import { heute as ladeHeute } from "@/lib/heute";
import { PRUEFTERMINE, pruefAmpel } from "@/lib/pruefung";
import { lokalKurz, montagVon } from "@/lib/woche";
import { tag } from "@/lib/zeit";
import { bezugHref } from "@/lib/montageplan-text";
import { FahrzeugDialog, FahrzeugLoeschen, WerkstattDialog, WerkstattLoeschen } from "../ui";

export const metadata: Metadata = { title: "Fahrzeug" };

export default async function FahrzeugSeite({ params }: PageProps<"/fahrzeuge/[id]">) {
  const { id } = await params;
  const heute = await ladeHeute();
  const daten = await ladeFahrzeug(id);
  if (!daten) notFound();
  const { fahrzeug: f, werkstatt, einsaetze } = daten;
  const zeitraum = (von: string, bis: string) => (von === bis ? tag(von) : `${tag(von)} – ${tag(bis)}`);

  return (
    <Shell active="fahrzeuge" crumbs={[{ label: "Team und Ressourcen" }, { label: "Fahrzeuge", href: "/fahrzeuge" }, { label: f.kennzeichen }]}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-surface-sunken"><Truck className="size-5" /></span>
          <div>
            <h1 className="font-mono text-4xl font-bold tracking-[-0.02em]">{f.kennzeichen}</h1>
            <p className="mt-1 text-[14.5px] text-muted">{f.typ ?? "–"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <FahrzeugDialog fahrzeug={f} />
          <FahrzeugLoeschen id={f.id} kennzeichen={f.kennzeichen} />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Karte titel="Einsätze" rechts={<span className="text-xs text-muted-2">ab heute</span>}>
            {einsaetze.length ? (
              <ul className="flex flex-col">
                {einsaetze.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line-soft py-2.5 text-sm first:border-t-0">
                    <Link href={`/${e.bezug?.art === "ticket" ? "serviceplan" : "montageplan"}?woche=${montagVon(e.beginn.slice(0, 10))}`} className="font-semibold hover:underline">
                      {lokalKurz(e.beginn)} – {e.beginn.slice(0, 10) === e.ende.slice(0, 10) ? e.ende.slice(11, 16) : lokalKurz(e.ende)}
                    </Link>
                    {e.bezug && (
                      <Link href={bezugHref(e.bezug)} className="text-ink-3 hover:underline">
                        <span className="font-mono text-[13px]">{e.bezug.nummer}</span> · {e.bezug.kunde}
                      </Link>
                    )}
                    {!e.fest && <Badge tone="amber">vorgeplant</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Kein Einsatz geplant.</p>
            )}
          </Karte>
          <Karte titel="Werkstatttermine" rechts={<WerkstattDialog fahrzeugId={f.id} heute={heute} />}>
            {werkstatt.length ? (
              <ul className="flex flex-col">
                {werkstatt.map((w) => (
                  <li key={w.id} data-werkstatt={w.id} className="flex items-center gap-3 border-t border-line-soft py-2 text-sm first:border-t-0">
                    <span className="w-[200px] tabular">{zeitraum(w.von, w.bis)}</span>
                    <span className="flex-1 text-ink-3">{w.notiz ?? "–"}</span>
                    {w.bis < heute ? <Badge tone="gray">vorbei</Badge> : <Badge tone="amber">geplant</Badge>}
                    <WerkstattLoeschen id={w.id} text={zeitraum(w.von, w.bis)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Keine Werkstatttermine.</p>
            )}
          </Karte>
        </div>
        <div className="flex flex-col gap-4">
          <Karte titel="Prüftermine">
            <dl className="flex flex-col gap-3 text-[14.5px]">
              {PRUEFTERMINE.map(([k, l]) => {
                const a = pruefAmpel(f[k], heute);
                return <Angabe key={k} name={l}>{a ? <Badge tone={a.ton}>{a.text}</Badge> : "–"}</Angabe>;
              })}
            </dl>
          </Karte>
          <Karte titel="Daten">
            <dl className="flex flex-col gap-3 text-[14.5px]">
              <Angabe name="Kilometerstand">{f.km_stand != null ? `${f.km_stand.toLocaleString("de-DE")} km` : "–"}</Angabe>
              <Angabe name="Kolonne">– (Kolonnen folgen in der Plantafel)</Angabe>
              {f.hinweise && <Angabe name="Hinweise"><span className="whitespace-pre-line">{f.hinweise}</span></Angabe>}
            </dl>
          </Karte>
        </div>
      </div>
    </Shell>
  );
}
