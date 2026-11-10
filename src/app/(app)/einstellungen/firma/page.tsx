import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeFirma } from "@/lib/belege";
import { EinstellungenReiter } from "../reiter";
import { FirmaFormular } from "./ui";

export const metadata: Metadata = { title: "Firma · Einstellungen" };

export default async function FirmaEinstellungenPage() {
  const [{ benutzer }, firma] = await Promise.all([pruefeSitzung(), ladeFirma()]);
  return (
    <Shell active="einstellungen" crumbs={[{ label: "Einstellungen" }, { label: "Firma" }]}>
      <PageHeader title="Firma" sub="Firmendaten für Belege: Kopf, Absenderzeile und Fuß jeder Seite" />
      <EinstellungenReiter aktiv="firma" admin={benutzer.admin} />
      <section className="max-w-[760px] rounded-lg border border-line-soft bg-surface px-5 py-4">
        <FirmaFormular firma={firma} />
      </section>
    </Shell>
  );
}
