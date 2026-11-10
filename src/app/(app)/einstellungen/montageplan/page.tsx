import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeArbeitszeit } from "@/lib/montageplan";
import { EinstellungenReiter } from "../reiter";
import { ArbeitszeitFormular, UrlaubsanspruchFormular } from "./ui";

export const metadata: Metadata = { title: "Montageplan · Einstellungen" };

export default async function MontageplanEinstellungenPage() {
  const [{ benutzer, supabase }, zeit] = await Promise.all([pruefeSitzung(), ladeArbeitszeit()]);
  const { data: einstellung } = await supabase.from("einstellung").select("urlaubsanspruch_tage").maybeSingle();
  return (
    <Shell active="einstellungen" crumbs={[{ label: "Einstellungen" }, { label: "Montageplan" }]}>
      <PageHeader title="Montageplan" sub="Einstellungen für die Plantafel" />
      <EinstellungenReiter aktiv="montageplan" admin={benutzer.admin} />
      <section className="max-w-[620px] rounded-lg border border-line-soft bg-surface px-5 py-4">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Arbeitszeit</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Gilt für alle Benutzer: Stundenraster der Plantafel und Vorbelegung beim Einplanen.</p>
        <ArbeitszeitFormular von={zeit.von} bis={zeit.bis} />
      </section>
      <section className="mt-4 max-w-[620px] rounded-lg border border-line-soft bg-surface px-5 py-4">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Urlaubsanspruch</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Standard für das Urlaubskonto. Abweichende Werte (z. B. Teilzeit) stehen beim Mitarbeiter.</p>
        <UrlaubsanspruchFormular tage={einstellung?.urlaubsanspruch_tage ?? 30} />
      </section>
    </Shell>
  );
}
