import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeFirma, ladeZahlungsbedingungen } from "@/lib/belege";
import { EinstellungenReiter } from "../reiter";
import { GueltigkeitFormular, ZahlungsbedingungenListe } from "./ui";

export const metadata: Metadata = { title: "Belege · Einstellungen" };

/** Belege: Gültigkeit der Angebote und Zahlungsbedingungen wie in Lexware (Textvorlagen und Artikelkatalog folgen) */
export default async function BelegeEinstellungenPage() {
  const [{ benutzer }, firma, bedingungen] = await Promise.all([pruefeSitzung(), ladeFirma(), ladeZahlungsbedingungen()]);
  return (
    <Shell active="einstellungen" crumbs={[{ label: "Einstellungen" }, { label: "Belege" }]}>
      <PageHeader title="Belege" sub="Gültigkeit der Angebote und Zahlungsbedingungen" />
      <EinstellungenReiter aktiv="belege" admin={benutzer.admin} />
      <section className="max-w-[760px] rounded-lg border border-line-soft bg-surface px-5 py-4">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Angebote</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Vorbelegung für „Gültig bis“; im Angebot änderbar.</p>
        <GueltigkeitFormular tage={firma.angebot_gueltig_tage || 30} />
      </section>
      <section className="mt-4 max-w-[760px] rounded-lg border border-line-soft bg-surface px-5 py-4">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Zahlungsbedingungen</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Im Beleg wählbar; Text, Ziel und Skonto werden in den Beleg kopiert. Platzhalter füllt der Beleg mit Datum und Betrag.</p>
        <ZahlungsbedingungenListe liste={bedingungen} />
      </section>
    </Shell>
  );
}
