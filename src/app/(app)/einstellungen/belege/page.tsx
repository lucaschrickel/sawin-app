import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeArtikel, ladeFirma, ladeTextvorlagen, ladeZahlungsbedingungen } from "@/lib/belege";
import { EinstellungenReiter } from "../reiter";
import { ArtikelListe, TextvorlagenListe } from "./katalog";
import { GueltigkeitFormular, ZahlungsbedingungenListe } from "./ui";

export const metadata: Metadata = { title: "Belege · Einstellungen" };

/** Belege & Artikel: Gültigkeit der Angebote, Zahlungsbedingungen wie in Lexware, Artikelkatalog, Textvorlagen */
export default async function BelegeEinstellungenPage() {
  const [{ benutzer }, firma, bedingungen, artikel, vorlagen] = await Promise.all([pruefeSitzung(), ladeFirma(), ladeZahlungsbedingungen(), ladeArtikel(), ladeTextvorlagen()]);
  return (
    <Shell active="einstellungen" crumbs={[{ label: "Einstellungen" }, { label: "Belege" }]}>
      <PageHeader title="Belege & Artikel" sub="Gültigkeit, Zahlungsbedingungen, Artikelkatalog und Textvorlagen" />
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
      <section className="mt-4 max-w-[760px] rounded-lg border border-line-soft bg-surface px-5 py-4" data-artikelkatalog>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Artikelkatalog</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Artikel mit Stern erscheinen im Beleg-Editor als Knopf über den Positionen; alle übrigen über „aus dem Katalog“.</p>
        <ArtikelListe liste={artikel} />
      </section>
      <section className="mt-4 max-w-[760px] rounded-lg border border-line-soft bg-surface px-5 py-4">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Textvorlagen</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Für Einleitung, Lieferbedingungen und Nachbemerkung. Im Editor über das Symbol neben dem Feld wählbar; die Standard-Vorlage wird bei neuen Belegen vorbelegt.</p>
        <TextvorlagenListe liste={vorlagen} />
      </section>
    </Shell>
  );
}
