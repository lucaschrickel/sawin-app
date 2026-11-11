import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/app/shell";
import { getCustomer } from "@/customers";
import { ladeAufmassZeilen, ladeFormular } from "@/lib/formulare";
import { AufmassEditor } from "./editor";

export const metadata: Metadata = { title: "Aufmaßblatt" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aufmaßblatt digital (vor Ort auf Tablet oder Handy): speichert beim Tippen automatisch */
export default async function FormularPage({ params }: PageProps<"/formulare/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const f = await ladeFormular(id);
  if (!f) notFound();
  // Protokolle haben keinen Editor: zurück zum Reiter des Vorgangs
  if (f.typ !== "aufmass") redirect(f.bezug.href);
  const zeilen = await ladeAufmassZeilen(id);
  const c = getCustomer();
  const vorgang = `${f.bezug.nummer} · ${f.kunde?.name ?? f.bezug.titel}`;
  const [active, liste] =
    f.bezug.art === "anfrage" ? ["anfragen", { label: "Anfragen", href: "/anfragen" }] : f.bezug.art === "ticket" ? ["service", { label: "Service-Tickets", href: "/service" }] : ["auftraege", { label: "Aufträge", href: "/auftraege" }];
  return (
    <Shell active={active as string} crumbs={[liste as { label: string; href: string }, { label: vorgang, href: f.bezug.href }, { label: "Aufmaßblatt" }]}>
      <AufmassEditor
        formular={{ id: f.id, status: f.status, datum: f.datum, hinweise: f.hinweise ?? "" }}
        bezug={{ art: f.bezug.art, href: f.bezug.href, text: vorgang, objekt: f.bezug.objekt, archiviert: f.bezug.archiviert }}
        start={zeilen}
        elemente={c.aufmass.elemente}
        anschlag={c.aufmass.anschlag}
      />
    </Shell>
  );
}
