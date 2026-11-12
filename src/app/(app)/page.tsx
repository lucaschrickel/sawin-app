import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { ladeDashboardAnsicht } from "@/lib/ansicht";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { zahlungenImHintergrund } from "@/lib/lexware/zahlungen";
import { ladeEinkauf, ladeGeschaeftsfuehrung, ladeMontage } from "@/lib/dashboard";
import { kalenderwoche } from "@/lib/woche";
import { heuteBerlin, utcNachBerlinLokal } from "@/lib/zeit";
import { NeueBestellung } from "./bestellungen/neu";
import { Einkauf, Geschaeftsfuehrung, Montage } from "./_dashboard/ansichten";
import { DashboardUmschalter } from "./_dashboard/umschalter";

export const metadata: Metadata = { title: "Dashboard" };

const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONAT = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** Startseite: Dashboard mit drei Ansichten (Geschäftsführung, Montage, Einkauf), je Benutzer gemerkt */
export default async function DashboardPage() {
  const [{ benutzer }, ansicht] = await Promise.all([pruefeSitzung(), ladeDashboardAnsicht()]);
  const heute = heuteBerlin();
  const jetzt = utcNachBerlinLokal(new Date().toISOString());
  const stunde = Number(jetzt.slice(11, 13));
  const datum = `${WOCHENTAG[new Date(`${heute}T12:00:00Z`).getUTCDay()]}, ${Number(heute.slice(8, 10))}. ${MONAT[Number(heute.slice(5, 7)) - 1]} ${heute.slice(0, 4)}`;
  const umschalter = <DashboardUmschalter ansicht={ansicht} />;
  // Die Ansicht steht im Umschalter; im Pfad und im Zurück-Knopf heißt die Maske „Dashboard“
  const crumbs = [{ label: "Übersicht" }, { label: "Dashboard" }];

  if (ansicht === "montage") {
    const d = await ladeMontage();
    return (
      <Shell active="dashboard" crumbs={crumbs}>
        <PageHeader
          title="Dashboard · Montage"
          sub={`${datum} · KW ${d.kw} · Planung, Freigabe und Ressourcen`}
          actions={
            <>
              {umschalter}
              <Link href="/montageplan" className="inline-flex h-[42px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-surface hover:opacity-90">
                <CalendarDays className="size-4" />
                Plantafel
              </Link>
            </>
          }
        />
        <Montage d={d} jetzt={jetzt} />
      </Shell>
    );
  }
  if (ansicht === "einkauf") {
    const d = await ladeEinkauf();
    return (
      <Shell active="dashboard" crumbs={crumbs}>
        <PageHeader title="Dashboard · Einkauf" sub={`KW ${kalenderwoche(heute)} · Bestellungen, Liefertermine und offene Positionen`} actions={<>{umschalter}<NeueBestellung /></>} />
        <Einkauf d={d} />
      </Shell>
    );
  }
  const d = await ladeGeschaeftsfuehrung();
  await zahlungenImHintergrund();
  const gruss = stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
  const abwesend = d.abwesenheiten.abwesendHeute;
  return (
    <Shell active="dashboard" crumbs={crumbs}>
      <PageHeader
        title="Dashboard"
        sub={`${gruss}, ${benutzer.name.split(" ")[0]} · ${datum} · ${d.termine.length} ${d.termine.length === 1 ? "Termin" : "Termine"} heute${abwesend.length ? ` · abwesend: ${abwesend.join(", ")}` : ""}`}
        actions={umschalter}
      />
      <Geschaeftsfuehrung d={d} jetzt={jetzt} />
    </Shell>
  );
}
