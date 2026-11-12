import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { istFarbschema } from "@/lib/darstellung";
import { EinstellungenReiter } from "../reiter";
import { DarstellungFormular } from "./ui";

export const metadata: Metadata = { title: "Darstellung · Einstellungen" };

/** Einstellungen › Darstellung: Farbschema und Seitenleiste je Benutzer */
export default async function DarstellungPage() {
  const { supabase, benutzer } = await pruefeSitzung();
  const { data } = await supabase.from("benutzer_einstellung").select("farbschema, seitenleiste_hell").eq("benutzer_id", benutzer.id).maybeSingle();
  return (
    <Shell active="einstellungen" crumbs={[{ label: "Einstellungen" }, { label: "Darstellung" }]}>
      <PageHeader title="Darstellung" sub="Farbschema und Seitenleiste, nur für Sie" />
      <EinstellungenReiter aktiv="darstellung" admin={benutzer.admin} />
      <section className="max-w-[900px] rounded-lg border border-line-soft bg-surface px-5 py-5">
        <DarstellungFormular start={{ farbschema: istFarbschema(data?.farbschema) ? data.farbschema : "hell", seitenleisteHell: data?.seitenleiste_hell ?? false }} />
      </section>
    </Shell>
  );
}
