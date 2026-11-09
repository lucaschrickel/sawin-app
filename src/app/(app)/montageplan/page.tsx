import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeTafel } from "@/lib/montageplan";
import { kalenderwoche, plusTage, wocheAus } from "@/lib/woche";
import { heuteBerlin, tag } from "@/lib/zeit";
import type { AuftragWahl } from "./einsatz-dialog";
import { Plantafel } from "./plantafel";

export const metadata: Metadata = { title: "Montageplan" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MontageplanPage({ searchParams }: PageProps<"/montageplan">) {
  const sp = await searchParams;
  const heute = heuteBerlin();
  const montag = wocheAus(eins(sp.woche), heute);
  const auftragId = eins(sp.auftrag);
  const { supabase } = await pruefeSitzung();
  const [tafel, auftrag] = await Promise.all([
    ladeTafel(montag),
    UUID.test(auftragId)
      ? supabase.from("auftrag").select("id, nummer, titel, kunde:kunde_id(name)").eq("id", auftragId).maybeSingle<{ id: string; nummer: string; titel: string; kunde: { name: string } | null }>()
      : Promise.resolve({ data: null }),
  ]);
  const vorlage: AuftragWahl | null = auftrag.data ? { id: auftrag.data.id, nummer: auftrag.data.nummer, titel: auftrag.data.titel, kunde: auftrag.data.kunde?.name ?? "" } : null;
  const knopf = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm hover:border-line-strong";

  return (
    <Shell active="montageplan" crumbs={[{ label: "Montage & Service" }, { label: "Montageplan" }]}>
      <PageHeader
        title="Montageplan"
        sub={`KW ${kalenderwoche(montag)} · ${tag(montag)} – ${tag(plusTage(montag, 4))} · Arbeitszeit ${tafel.raster.von} bis ${tafel.raster.bis} Uhr`}
        actions={
          <nav aria-label="Woche" className="flex items-center gap-2">
            <Link replace scroll={false} href={`/montageplan?woche=${plusTage(montag, -7)}`} aria-label="Vorige Woche" className={knopf}>
              <ChevronLeft className="size-4" />
            </Link>
            <Link replace scroll={false} href="/montageplan" className={knopf} aria-current={montag === wocheAus("", heute) ? "date" : undefined}>
              Heute
            </Link>
            <Link replace scroll={false} href={`/montageplan?woche=${plusTage(montag, 7)}`} aria-label="Nächste Woche" className={knopf}>
              <ChevronRight className="size-4" />
            </Link>
          </nav>
        }
      />
      <Plantafel
        key={vorlage?.id ?? "tafel"}
        raster={tafel.raster}
        heute={heute}
        monteure={tafel.monteure}
        einsaetze={tafel.einsaetze}
        abwesenheiten={tafel.abwesenheiten}
        konflikte={tafel.konflikte}
        auftragVorlage={vorlage}
      />
    </Shell>
  );
}
