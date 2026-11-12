import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/app/shell";
import { getCustomer } from "@/customers";
import { ladeAbrechnung, ladeArtikel, ladeBelegTags, ladeKundeFuerBeleg, ladeTextvorlagen, ladeZahlungsbedingungen, neuerBelegZustand } from "@/lib/belege";
import { BELEGART_TEXT, EDITOR_BELEGARTEN, type Belegart } from "@/lib/belege-status";
import { BelegEditor } from "../editor";
import { ladeSpaltenbreiten } from "@/lib/ansicht";
import { AKTIV, LISTE } from "../navigation";

export const metadata: Metadata = { title: "Neuer Beleg" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Neuer Beleg: öffnet direkt den Vollbild-Editor (kein Dialog davor). Kunde und Bezug werden im Editor gewählt. */
export default async function NeuerBelegPage({ searchParams }: PageProps<"/beleg/neu">) {
  const sp = await searchParams;
  const art = (EDITOR_BELEGARTEN as string[]).includes(eins(sp.art) ?? "") ? (eins(sp.art) as Belegart) : "angebot";
  const p = { art, vorgaenger: eins(sp.vorgaenger), anfrage: eins(sp.anfrage), auftrag: eins(sp.auftrag), ticket: eins(sp.ticket), kunde: eins(sp.kunde), kopie: eins(sp.kopie), aufmass: eins(sp.aufmass) };
  const [start, zahlungsbedingungen, tags, artikel, vorlagen] = await Promise.all([neuerBelegZustand(p), ladeZahlungsbedingungen(), ladeBelegTags(), ladeArtikel(), ladeTextvorlagen()]);
  const zurueck = p.vorgaenger
    ? { href: `/beleg/${p.vorgaenger}`, text: "Vorgängerbeleg" }
    : p.kopie
      ? { href: `/beleg/${p.kopie}`, text: "Beleg" }
      : p.anfrage
        ? { href: `/anfragen/${p.anfrage}`, text: "Anfrage" }
        : p.auftrag
          ? { href: `/auftraege/${p.auftrag}`, text: "Auftrag" }
          : p.ticket
            ? { href: `/service/${p.ticket}`, text: "Service-Ticket" }
            : LISTE[art];
  const crumbs = [{ label: "Belege" }, { label: LISTE[art].text, href: LISTE[art].href }, { label: `${BELEGART_TEXT[art]} erstellen` }];

  if ("fehler" in start)
    return (
      <Shell active={AKTIV[art]} crumbs={crumbs}>
        <p role="alert" className="rounded-md bg-tone-red-bg px-4 py-3 text-sm text-tone-red-fg">{start.fehler}</p>
        <Link href={zurueck.href} className="mt-3 inline-block text-sm text-accent-text hover:underline">Zurück</Link>
      </Shell>
    );
  const kopf = start.zustand.kopf;
  const [kunde, abrechnung] = await Promise.all([
    kopf.kunde_id ? ladeKundeFuerBeleg(kopf.kunde_id) : null,
    (kopf.art === "abschlagsrechnung" || kopf.art === "rechnung") && kopf.bezug.art === "auftrag" && kopf.bezug.id ? ladeAbrechnung(kopf.bezug.id) : null,
  ]);
  return (
    <Shell active={AKTIV[start.zustand.kopf.art]} crumbs={crumbs}>
      <BelegEditor
          spaltenStart={await ladeSpaltenbreiten("beleg_positionen")}
        key={JSON.stringify(p)}
        start={start.zustand}
        hinweis={start.hinweis}
        modus="neu"
        zahlungsbedingungen={zahlungsbedingungen}
        artikel={artikel}
        vorlagen={vorlagen}
        kundeStart={kunde}
        tagVorschlaege={tags}
        herkunftListe={getCustomer().herkunft}
        zurueck={zurueck}
        abrechnung={abrechnung}
      />
    </Shell>
  );
}
