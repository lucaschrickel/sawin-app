import type { Metadata } from "next";
import Link from "next/link";
import { KlickZeile } from "@/components/app/klick-zeile";
import { ListenSuche } from "@/components/app/listen-suche";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { cn } from "@/lib/cn";
import { ladeMitarbeiterListe } from "@/lib/mitarbeiter";
import { ABWESENHEIT_TEXT, ABWESENHEIT_TON, stundenText } from "@/lib/team";
import { kalenderwoche } from "@/lib/woche";
import { MitarbeiterDialog } from "./ui";

export const metadata: Metadata = { title: "Mitarbeiter" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function MitarbeiterPage({ searchParams }: PageProps<"/mitarbeiter">) {
  const sp = await searchParams;
  const nurMonteure = eins(sp.monteure) === "1";
  const inaktive = eins(sp.inaktive) === "1";
  const q = eins(sp.q);
  const { supabase } = await pruefeSitzung();
  const [{ liste, montag }, { data: einstellung }] = await Promise.all([
    ladeMitarbeiterListe({ nurMonteure, inaktive, q }),
    supabase.from("einstellung").select("urlaubsanspruch_tage").maybeSingle(),
  ]);
  const href = (aenderung: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ monteure: nurMonteure ? "1" : "", inaktive: inaktive ? "1" : "", q, ...aenderung })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/mitarbeiter?${qs}` : "/mitarbeiter";
  };
  const chip = (aktiv: boolean) => cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm", aktiv ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink");
  const aktive = liste.filter((m) => m.aktiv);

  return (
    <Shell active="mitarbeiter" crumbs={[{ label: "Team und Ressourcen" }, { label: "Mitarbeiter" }]}>
      <PageHeader
        title="Mitarbeiter"
        sub={`${aktive.length} aktiv · ${aktive.filter((m) => m.ist_monteur).length} Monteure erscheinen in der Plantafel`}
        actions={<MitarbeiterDialog anspruchStandard={einstellung?.urlaubsanspruch_tage ?? 30} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ListenSuche wert={q} label="Mitarbeiter durchsuchen" platzhalter="Name, Kürzel, Rolle …" />
        <nav aria-label="Auswahl" className="flex gap-1 rounded-full bg-surface-sunken p-1">
          <Link replace scroll={false} href={href({ monteure: "" })} className={chip(!nurMonteure)}>Alle</Link>
          <Link replace scroll={false} href={href({ monteure: "1" })} aria-current={nurMonteure ? "true" : undefined} className={chip(nurMonteure)}>Monteure</Link>
        </nav>
        <Link replace scroll={false} href={href({ inaktive: inaktive ? "" : "1" })} role="checkbox" aria-checked={inaktive} className="ml-auto flex items-center gap-2 text-sm text-ink-3">
          <span className={cn("grid size-4 place-items-center rounded-[4px] border", inaktive ? "border-ink bg-ink text-surface" : "border-line-strong")}>
            {inaktive && <span className="text-[10px] leading-none">✓</span>}
          </span>
          Inaktive zeigen
        </Link>
      </div>

      <div className="rounded-lg border border-line-soft bg-surface">
        {liste.length ? (
          <Table className="min-w-[760px]">
            <thead>
              <tr>
                <Th className="pl-4">Name</Th>
                <Th>Rolle</Th>
                <Th>Telefon</Th>
                <Th className="text-right">Stunden KW {kalenderwoche(montag)}</Th>
                <Th className="pr-4">Heute</Th>
              </tr>
            </thead>
            <tbody>
              {liste.map((m) => (
                <KlickZeile key={m.id} href={`/mitarbeiter/${m.id}`}>
                  <Td className="pl-4">
                    <span className="flex items-center gap-2.5">
                      <span className="grid h-8 min-w-8 place-items-center rounded-full bg-surface-sunken px-1.5 text-xs font-semibold">{m.kuerzel}</span>
                      <Link href={`/mitarbeiter/${m.id}`} className={cn("font-medium hover:underline", !m.aktiv && "text-muted")}>{m.name}</Link>
                      {m.ist_monteur && <Badge tone="brand">Monteur</Badge>}
                      {!m.aktiv && <Badge tone="gray">Inaktiv</Badge>}
                    </span>
                  </Td>
                  <Td className="text-sm text-ink-3">{m.rolle ?? "–"}</Td>
                  <Td className="text-sm whitespace-nowrap">{m.telefon ? <a href={`tel:${m.telefon.replace(/\s/g, "")}`} className="text-accent-text hover:underline">{m.telefon}</a> : "–"}</Td>
                  <Td className="text-right font-mono text-[13px]">{m.stundenWoche ? stundenText(m.stundenWoche) : "–"}</Td>
                  <Td className="pr-4">
                    {m.heuteAbwesend ? (
                      <Badge tone={ABWESENHEIT_TON[m.heuteAbwesend.art]}>{ABWESENHEIT_TEXT[m.heuteAbwesend.art]}{m.heuteAbwesend.status === "beantragt" ? " (beantragt)" : ""}</Badge>
                    ) : (
                      <span className="text-sm text-muted-2">da</span>
                    )}
                  </Td>
                </KlickZeile>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted">{q || nurMonteure ? "Keine Mitarbeiter für diese Auswahl." : "Noch keine Mitarbeiter. Über „Mitarbeiter anlegen“ erfassen."}</p>
        )}
      </div>
    </Shell>
  );
}
