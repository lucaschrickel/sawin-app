import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { ladeBenutzerAuswahl } from "@/lib/anfragen";
import { ladeAufgaben, type Aufgabe } from "@/lib/aufgaben";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { cn } from "@/lib/cn";
import { heuteBerlin } from "@/lib/zeit";
import { AufgabeDialog, AufgabeZeile, type AufgabenKontext } from "./ui";

export const metadata: Metadata = { title: "Aufgaben" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AufgabenPage({ searchParams }: PageProps<"/aufgaben">) {
  const sp = await searchParams;
  const { benutzer: ich } = await pruefeSitzung();
  const alle = eins(sp.wer) === "alle";
  const zustand = eins(sp.zustand) === "erledigt" ? "erledigt" : eins(sp.zustand) === "alle" ? "alle" : "offen";
  const [{ liste, anzahl }, benutzer] = await Promise.all([ladeAufgaben({ meine: !alle, zustand }), ladeBenutzerAuswahl()]);
  const heute = heuteBerlin();
  const kontext: AufgabenKontext = { benutzer, ichId: ich.id, heute };

  const offen = (a: Aufgabe) => a.status !== "erledigt";
  const gruppen: [string, Aufgabe[]][] = [
    ["Überfällig", liste.filter((a) => offen(a) && a.faellig && a.faellig < heute)],
    ["Heute", liste.filter((a) => offen(a) && a.faellig === heute)],
    ["Demnächst", liste.filter((a) => offen(a) && a.faellig && a.faellig > heute)],
    ["Ohne Datum", liste.filter((a) => offen(a) && !a.faellig)],
    ["Erledigt", liste.filter((a) => !offen(a)).sort((x, y) => (y.erledigt_am ?? "").localeCompare(x.erledigt_am ?? ""))],
  ];

  const href = (aenderung: Record<string, string>) => {
    const p = new URLSearchParams();
    const werte = { wer: alle ? "alle" : "", zustand: zustand === "offen" ? "" : zustand, ...aenderung };
    for (const [k, v] of Object.entries(werte)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/aufgaben?${qs}` : "/aufgaben";
  };
  const chip = (aktiv: boolean) => cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm", aktiv ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink");

  return (
    <Shell active="aufgaben" crumbs={[{ label: "Übersicht" }, { label: "Aufgaben" }]}>
      <PageHeader
        title="Aufgaben"
        sub={alle ? "Alle Aufgaben im Büro" : "Mir zugewiesene Aufgaben"}
        actions={
          <AufgabeDialog
            {...kontext}
            key={String(sp.neu ?? "")} startOffen={!!sp.neu}
            ausloeser={
              <Button variant="primary">
                <Plus className="size-[15px]" strokeWidth={2.2} />
                Neue Aufgabe
              </Button>
            }
          />
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Wessen Aufgaben" className="flex gap-1 rounded-full bg-surface-sunken p-1">
          <Link replace href={href({ wer: "" })} aria-current={!alle ? "true" : undefined} className={chip(!alle)}>Meine Aufgaben</Link>
          <Link replace href={href({ wer: "alle" })} aria-current={alle ? "true" : undefined} className={chip(alle)}>Alle Aufgaben</Link>
        </nav>
        <nav aria-label="Offen oder erledigt" className="flex gap-1 rounded-full bg-surface-sunken p-1">
          <Link replace href={href({ zustand: "" })} className={chip(zustand === "offen")}>Offen <span className="text-xs text-muted-2 tabular">{anzahl.offen}</span></Link>
          <Link replace href={href({ zustand: "erledigt" })} className={chip(zustand === "erledigt")}>Erledigt <span className="text-xs text-muted-2 tabular">{anzahl.erledigt}</span></Link>
          <Link replace href={href({ zustand: "alle" })} className={chip(zustand === "alle")}>Alle</Link>
        </nav>
      </div>

      {liste.length ? (
        <div className="flex flex-col gap-4">
          {gruppen
            .filter(([, l]) => l.length)
            .map(([titel, l]) => (
              <section key={titel} aria-label={titel} className="rounded-lg border border-line-soft bg-surface px-5 py-3">
                <h2 className={cn("flex items-center justify-between py-1 text-sm font-semibold", titel === "Überfällig" && "text-tone-red-fg")}>
                  {titel}
                  <span className="text-xs font-normal text-muted-2 tabular">{l.length}</span>
                </h2>
                <ul>{l.map((a) => <AufgabeZeile key={a.id} aufgabe={a} kontext={kontext} zeigeZustaendig={alle} />)}</ul>
              </section>
            ))}
        </div>
      ) : (
        <p className="rounded-lg border border-line-soft bg-surface px-4 py-10 text-center text-sm text-muted">
          {zustand === "erledigt" ? "Noch keine erledigten Aufgaben." : alle ? "Keine offenen Aufgaben." : "Keine offenen Aufgaben für dich."}
        </p>
      )}
    </Shell>
  );
}
