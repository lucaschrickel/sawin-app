import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeArbeitszeit } from "@/lib/montageplan";
import { EinstellungenReiter } from "../reiter";
import { ArbeitszeitFormular } from "./ui";

export const metadata: Metadata = { title: "Montageplan · Einstellungen" };

export default async function MontageplanEinstellungenPage() {
  const [{ benutzer }, zeit] = await Promise.all([pruefeSitzung(), ladeArbeitszeit()]);
  return (
    <Shell active="einstellungen" crumbs={[{ label: "Einstellungen" }, { label: "Montageplan" }]}>
      <PageHeader title="Montageplan" sub="Einstellungen für die Plantafel" />
      <EinstellungenReiter aktiv="montageplan" admin={benutzer.admin} />
      <section className="max-w-[620px] rounded-lg border border-line-soft bg-surface px-5 py-4">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Arbeitszeit</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Gilt für alle Benutzer: Stundenraster der Plantafel und Vorbelegung beim Einplanen.</p>
        <ArbeitszeitFormular von={zeit.von} bis={zeit.bis} />
      </section>
    </Shell>
  );
}
