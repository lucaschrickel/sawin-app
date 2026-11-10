import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Phone } from "lucide-react";
import { ListenSuche } from "@/components/app/listen-suche";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeLieferanten } from "@/lib/einkauf";
import { LieferantDialog, VertraulichMarke } from "./ui";

export const metadata: Metadata = { title: "Lieferanten" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const tel = (n: string) => `tel:${n.replace(/\s/g, "")}`;
const knopf = "inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm hover:border-line-strong";

export default async function LieferantenPage({ searchParams }: PageProps<"/lieferanten">) {
  const q = eins((await searchParams).q);
  const [{ benutzer }, liste] = await Promise.all([pruefeSitzung(), ladeLieferanten(q)]);
  return (
    <Shell active="lieferanten" crumbs={[{ label: "Einkauf" }, { label: "Lieferanten" }]}>
      <PageHeader
        title="Lieferanten"
        sub={`Konfiguratoren, Ansprechpartner${benutzer.konditionen ? " und Konditionen" : ""} an einem Ort`}
        actions={<LieferantDialog />}
      />
      <div className="mb-4">
        <ListenSuche wert={q} label="Lieferanten durchsuchen" platzhalter="Lieferant, Kundennummer …" />
      </div>
      {liste.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
          {liste.map((l) => (
            <section key={l.id} data-lieferant={l.id} className="flex flex-col gap-3 rounded-lg border border-line-soft bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/lieferanten/${l.id}`} className="min-w-0 hover:underline">
                  <b className="text-base font-semibold">{l.name}</b>
                  <div className="text-xs text-muted-2">Kd.-Nr. bei uns: {l.unsere_kundennummer ?? "–"} · Lieferzeit {l.lieferzeit ?? "–"}</div>
                </Link>
                {l.offeneBestellungen > 0 && <Badge tone="blue">{l.offeneBestellungen} offen</Badge>}
              </div>
              {l.produktgruppen.length > 0 && <span className="flex flex-wrap gap-1">{l.produktgruppen.map((p) => <Badge key={p} tone="gray">{p}</Badge>)}</span>}
              <ul className="flex flex-col gap-1.5">
                {l.kontakte.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate"><b className="font-medium">{k.name}</b> <span className="text-muted-2">{k.funktion}</span></span>
                    <span className="flex shrink-0 gap-1">
                      {(k.handy || k.telefon) && (
                        <a href={tel((k.handy || k.telefon)!)} className={knopf} aria-label={`${k.name} anrufen`}>
                          <Phone className="size-3.5" />
                          {k.handy || k.telefon}
                        </a>
                      )}
                    </span>
                  </li>
                ))}
                {!l.kontakte.length && <li className="text-sm text-muted-2">Keine Ansprechpartner.</li>}
              </ul>
              {benutzer.konditionen && l.kondition && (
                <div className="rounded-md bg-surface-muted px-3 py-2 text-sm" data-kondition>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-2">Konditionen <VertraulichMarke /></div>
                  <p className="whitespace-pre-line">{l.kondition}</p>
                </div>
              )}
              <div className="mt-auto flex flex-wrap gap-2 border-t border-line-soft pt-3">
                {l.konfigurator_url && <a href={l.konfigurator_url} target="_blank" rel="noopener noreferrer" className={knopf}><ExternalLink className="size-3.5" />Konfigurator</a>}
                {l.haendlerportal_url && <a href={l.haendlerportal_url} target="_blank" rel="noopener noreferrer" className={knopf}><ExternalLink className="size-3.5" />Händlerportal</a>}
                {l.telefon && <a href={tel(l.telefon)} className={knopf}><Phone className="size-3.5" />Zentrale</a>}
                <Link href={`/lieferanten/${l.id}`} className={`${knopf} ml-auto`}>Öffnen</Link>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-line-soft bg-surface px-4 py-10 text-center text-sm text-muted">{q ? "Keine Lieferanten für diese Suche." : "Noch keine Lieferanten. Über „Lieferant“ anlegen."}</p>
      )}
    </Shell>
  );
}
