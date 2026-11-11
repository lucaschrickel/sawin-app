import type { Metadata } from "next";
import Link from "next/link";
import { Truck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { heute as ladeHeute } from "@/lib/heute";
import { ladePipeline, ladeTafel } from "@/lib/montageplan";
import { kalenderwoche, plusTage, wocheAus } from "@/lib/woche";
import { tag } from "@/lib/zeit";
import type { BezugWahl } from "./einsatz-dialog";
import { MontageTafel } from "./montage-tafel";
import { WochenNavigation } from "./wochen-navigation";

export const metadata: Metadata = { title: "Montageplan" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MontageplanPage({ searchParams }: PageProps<"/montageplan">) {
  const sp = await searchParams;
  const heute = await ladeHeute();
  const montag = wocheAus(eins(sp.woche), heute);
  const wochen = eins(sp.ansicht) === "4" ? 4 : 1;
  const auftragId = eins(sp.auftrag);
  const { supabase } = await pruefeSitzung();
  const [tafel, pipeline, auftrag] = await Promise.all([
    ladeTafel(montag, wochen),
    ladePipeline(),
    UUID.test(auftragId)
      ? supabase.from("auftrag").select("id, nummer, titel, kunde:kunde_id(name)").eq("id", auftragId).maybeSingle<{ id: string; nummer: string; titel: string; kunde: { name: string } | null }>()
      : Promise.resolve({ data: null }),
  ]);
  const vorlage: BezugWahl | null = auftrag.data
    ? { art: "auftrag", id: auftrag.data.id, nummer: auftrag.data.nummer, titel: auftrag.data.titel, kunde: auftrag.data.kunde?.name ?? "" }
    : null;
  const letzter = tafel.raster.tage.at(-1)!;

  return (
    <Shell active="montageplan" crumbs={[{ label: "Montage & Service" }, { label: "Montageplan" }]}>
      <PageHeader
        title="Montageplan"
        sub={
          wochen === 4
            ? `KW ${kalenderwoche(montag)}–${kalenderwoche(letzter)} · ${tag(montag)} – ${tag(letzter)} · tagesgenau · Service-Einsätze erscheinen als „belegt“`
            : `KW ${kalenderwoche(montag)} · ${tag(montag)} – ${tag(plusTage(montag, 4))} · Arbeitszeit ${tafel.raster.von} bis ${tafel.raster.bis} Uhr · Service-Einsätze erscheinen als „belegt“`
        }
        actions={<WochenNavigation basis="/montageplan" montag={montag} heute={heute} wochen={wochen} />}
      />
      {pipeline.ohneTermin.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-md bg-tone-blue-bg px-4 py-2.5 text-sm text-tone-blue-fg" data-ohne-termin>
          <Truck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {pipeline.ohneTermin.length === 1 ? "1 Auftrag hat" : `${pipeline.ohneTermin.length} Aufträge haben`} noch keinen Liefertermin und keinen Montagetermin:{" "}
            {pipeline.ohneTermin.map((a, i) => (
              <span key={a.id}>
                {i > 0 && " · "}
                <Link href={`/auftraege/${a.id}`} className="font-medium underline-offset-2 hover:underline">{a.nummer}</Link> {a.kunde}
              </span>
            ))}
            . Mit Liefertermin erscheinen sie in der Zeile „Lieferung“.
          </span>
        </p>
      )}
      <MontageTafel
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
        pipeline={pipeline.eintraege}
      />
    </Shell>
  );
}
