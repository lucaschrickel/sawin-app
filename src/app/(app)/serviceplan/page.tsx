import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { heute as ladeHeute } from "@/lib/heute";
import { ladeTafel } from "@/lib/montageplan";
import { ladeTerminierbar } from "@/lib/service";
import { kalenderwoche, plusTage, wocheAus } from "@/lib/woche";
import { tag } from "@/lib/zeit";
import type { BezugWahl } from "../montageplan/einsatz-dialog";
import { WochenNavigation } from "../montageplan/wochen-navigation";
import { ServiceTafel } from "./service-tafel";

export const metadata: Metadata = { title: "Service-Plan" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ServiceplanPage({ searchParams }: PageProps<"/serviceplan">) {
  const sp = await searchParams;
  const heute = await ladeHeute();
  const montag = wocheAus(eins(sp.woche), heute);
  const wochen = eins(sp.ansicht) === "4" ? 4 : 1;
  const letzterTag = plusTage(montag, 7 * wochen - 3);
  const ticketId = eins(sp.ticket);
  const { supabase } = await pruefeSitzung();
  const [tafel, terminierbar, ticket] = await Promise.all([
    ladeTafel(montag, wochen),
    ladeTerminierbar(montag, letzterTag, heute >= montag && heute <= letzterTag),
    UUID.test(ticketId)
      ? supabase.from("service_ticket").select("id, nummer, thema, kunde:kunde_id(name)").eq("id", ticketId).maybeSingle<{ id: string; nummer: string; thema: string; kunde: { name: string } | null }>()
      : Promise.resolve({ data: null }),
  ]);
  const vorlage: BezugWahl | null = ticket.data ? { art: "ticket", id: ticket.data.id, nummer: ticket.data.nummer, titel: ticket.data.thema, kunde: ticket.data.kunde?.name ?? "" } : null;

  return (
    <Shell active="serviceplan" crumbs={[{ label: "Montage & Service" }, { label: "Service-Plan" }]}>
      <PageHeader
        title="Service-Plan"
        sub={`KW ${kalenderwoche(montag)}${wochen === 4 ? `–${kalenderwoche(letzterTag)}` : ""} · ${tag(montag)} – ${tag(letzterTag)}${wochen === 4 ? " · tagesgenau" : ""} · Einsätze zu Service-Tickets · Montagen erscheinen als „belegt“`}
        actions={<WochenNavigation basis="/serviceplan" montag={montag} heute={heute} wochen={wochen} />}
      />
      <ServiceTafel
        key={vorlage?.id ?? "tafel"}
        raster={tafel.raster}
        heute={heute}
        monteure={tafel.monteure}
        einsaetze={tafel.einsaetze}
        abwesenheiten={tafel.abwesenheiten}
        konflikte={tafel.konflikte}
        fahrzeuge={tafel.fahrzeuge}
        feiertage={tafel.feiertage}
        kolonnen={tafel.kolonnen}
        ressourcen={tafel.ressourcen}
        gruppen={tafel.gruppen}
        bezugVorlage={vorlage}
        terminierbar={terminierbar}
      />
    </Shell>
  );
}
