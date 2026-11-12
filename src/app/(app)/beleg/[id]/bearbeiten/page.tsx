import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/app/shell";
import { getCustomer } from "@/customers";
import { belegZuEingabe, istKopfbeleg, ladeArtikel, ladeBeleg, ladeBelegTags, ladeKundeFuerBeleg, ladeTextvorlagen, ladeZahlungsbedingungen } from "@/lib/belege";
import { bearbeitbar, BELEGART_TEXT } from "@/lib/belege-status";
import { BelegEditor } from "../../editor";
import { AKTIV, LISTE } from "../../navigation";

export const metadata: Metadata = { title: "Beleg bearbeiten" };

/** Fertiggestelltes Angebot bzw. AB bearbeiten (bis zum Folgebeleg). Speichern legt ggf. eine neue Version an. */
export default async function BelegBearbeitenPage({ params }: PageProps<"/beleg/[id]/bearbeiten">) {
  const { id } = await params;
  const d = await ladeBeleg(id);
  if (!d) notFound();
  const b = d.beleg;
  if (b.status === "entwurf" || !bearbeitbar(b, d.kette, istKopfbeleg(d))) redirect(`/beleg/${id}`);
  const [zahlungsbedingungen, tags, kunde, artikel, vorlagen] = await Promise.all([ladeZahlungsbedingungen(), ladeBelegTags(), b.kunde_id ? ladeKundeFuerBeleg(b.kunde_id) : null, ladeArtikel(), ladeTextvorlagen()]);
  const liste = LISTE[b.art];
  const hinweis =
    (b.eingefroren_version ?? 0) >= b.version
      ? `Version ${b.version} ist übergeben. Speichern legt Version ${b.version + 1} an, die Nummer bleibt ${b.nummer}. Das Belegdatum wird auf heute gesetzt.`
      : "Das Belegdatum wird beim Speichern auf heute gesetzt.";
  return (
    <Shell active={AKTIV[b.art]} crumbs={[{ label: "Belege" }, { label: liste.text, href: liste.href }, { label: `${BELEGART_TEXT[b.art]} ${b.nummer}`, href: `/beleg/${id}` }, { label: "Bearbeiten" }]}>
      <BelegEditor
        key={`${b.id}-${b.updated_at}`}
        start={belegZuEingabe(d)}
        hinweis={hinweis}
        modus="bearbeiten"
        zahlungsbedingungen={zahlungsbedingungen}
        artikel={artikel}
        vorlagen={vorlagen}
        kundeStart={kunde}
        tagVorschlaege={tags}
        herkunftListe={getCustomer().herkunft}
        zurueck={{ href: `/beleg/${id}`, text: `${BELEGART_TEXT[b.art]} ${b.nummer}` }}
      />
    </Shell>
  );
}
