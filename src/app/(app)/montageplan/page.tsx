import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { heute as ladeHeute } from "@/lib/heute";
import { ladeTafel } from "@/lib/montageplan";
import { kalenderwoche, plusTage, wocheAus } from "@/lib/woche";
import { tag } from "@/lib/zeit";
import type { BezugWahl } from "./einsatz-dialog";
import { Plantafel } from "./plantafel";
import { WochenNavigation } from "./wochen-navigation";

export const metadata: Metadata = { title: "Montageplan" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MontageplanPage({ searchParams }: PageProps<"/montageplan">) {
  const sp = await searchParams;
  const heute = await ladeHeute();
  const montag = wocheAus(eins(sp.woche), heute);
  const auftragId = eins(sp.auftrag);
  const { supabase } = await pruefeSitzung();
  const [tafel, auftrag] = await Promise.all([
    ladeTafel(montag),
    UUID.test(auftragId)
      ? supabase.from("auftrag").select("id, nummer, titel, kunde:kunde_id(name)").eq("id", auftragId).maybeSingle<{ id: string; nummer: string; titel: string; kunde: { name: string } | null }>()
      : Promise.resolve({ data: null }),
  ]);
  const vorlage: BezugWahl | null = auftrag.data
    ? { art: "auftrag", id: auftrag.data.id, nummer: auftrag.data.nummer, titel: auftrag.data.titel, kunde: auftrag.data.kunde?.name ?? "" }
    : null;

  return (
    <Shell active="montageplan" crumbs={[{ label: "Montage & Service" }, { label: "Montageplan" }]}>
      <PageHeader
        title="Montageplan"
        sub={`KW ${kalenderwoche(montag)} · ${tag(montag)} – ${tag(plusTage(montag, 4))} · Arbeitszeit ${tafel.raster.von} bis ${tafel.raster.bis} Uhr`}
        actions={<WochenNavigation basis="/montageplan" montag={montag} heute={heute} />}
      />
      <Plantafel
        key={vorlage?.id ?? "tafel"}
        plan="montage"
        raster={tafel.raster}
        heute={heute}
        monteure={tafel.monteure}
        einsaetze={tafel.einsaetze}
        abwesenheiten={tafel.abwesenheiten}
        konflikte={tafel.konflikte}
        fahrzeuge={tafel.fahrzeuge}
        feiertage={tafel.feiertage}
        bezugVorlage={vorlage}
      />
    </Shell>
  );
}
