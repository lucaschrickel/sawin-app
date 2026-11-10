import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/app/shell";
import { getCustomer } from "@/customers";
import { ladeBelegTags, ladeKundeFuerBeleg, ladeZahlungsbedingungen, neuerBelegZustand } from "@/lib/belege";
import { APP_BELEGARTEN, BELEGART_TEXT, type Belegart } from "@/lib/belege-status";
import { BelegEditor } from "../editor";
import { AKTIV, LISTE } from "../navigation";

export const metadata: Metadata = { title: "Neuer Beleg" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Neuer Beleg: öffnet direkt den Vollbild-Editor (kein Dialog davor). Kunde und Bezug werden im Editor gewählt. */
export default async function NeuerBelegPage({ searchParams }: PageProps<"/beleg/neu">) {
  const sp = await searchParams;
  const art = (APP_BELEGARTEN as string[]).includes(eins(sp.art) ?? "") ? (eins(sp.art) as Belegart) : "angebot";
  const p = { art, vorgaenger: eins(sp.vorgaenger), anfrage: eins(sp.anfrage), auftrag: eins(sp.auftrag), kunde: eins(sp.kunde), kopie: eins(sp.kopie) };
  const [start, zahlungsbedingungen, tags] = await Promise.all([neuerBelegZustand(p), ladeZahlungsbedingungen(), ladeBelegTags()]);
  const zurueck = p.vorgaenger
    ? { href: `/beleg/${p.vorgaenger}`, text: "Vorgängerbeleg" }
    : p.kopie
      ? { href: `/beleg/${p.kopie}`, text: "Beleg" }
      : p.anfrage
        ? { href: `/anfragen/${p.anfrage}`, text: "Anfrage" }
        : p.auftrag
          ? { href: `/auftraege/${p.auftrag}`, text: "Auftrag" }
          : LISTE[art];
  const crumbs = [{ label: "Belege" }, { label: LISTE[art].text, href: LISTE[art].href }, { label: `${BELEGART_TEXT[art]} erstellen` }];

  if ("fehler" in start)
    return (
      <Shell active={AKTIV[art]} crumbs={crumbs}>
        <p role="alert" className="rounded-md bg-tone-red-bg px-4 py-3 text-sm text-tone-red-fg">{start.fehler}</p>
        <Link href={zurueck.href} className="mt-3 inline-block text-sm text-accent-text hover:underline">Zurück</Link>
      </Shell>
    );
  const kunde = start.zustand.kopf.kunde_id ? await ladeKundeFuerBeleg(start.zustand.kopf.kunde_id) : null;
  return (
    <Shell active={AKTIV[start.zustand.kopf.art]} crumbs={crumbs}>
      <BelegEditor
        key={JSON.stringify(p)}
        start={start.zustand}
        hinweis={start.hinweis}
        modus="neu"
        zahlungsbedingungen={zahlungsbedingungen}
        kundeStart={kunde}
        tagVorschlaege={tags}
        herkunftListe={getCustomer().herkunft}
        zurueck={zurueck}
      />
    </Shell>
  );
}
