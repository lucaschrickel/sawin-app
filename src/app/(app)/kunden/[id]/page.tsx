import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { getCustomer } from "@/customers";
import { datum } from "@/lib/format";
import { adresseText, ladeKunde } from "@/lib/kunden";
import { KundeDialog } from "../kunde-dialog";
import { KonditionenFormular, KundeLoeschen } from "../ui";

export const metadata: Metadata = { title: "Kunde" };

export default async function KundePage({ params }: PageProps<"/kunden/[id]">) {
  const { id } = await params;
  const daten = await ladeKunde(id);
  if (!daten) notFound();
  const { kunde: k, lieferadressen, konditionen } = daten;
  const aktiv = lieferadressen.filter((la) => !la.alt_seit);
  const alt = lieferadressen.filter((la) => la.alt_seit);
  const adresse = adresseText(k);

  return (
    <Shell active="kunden" crumbs={[{ label: "Kunden & Anfragen" }, { label: "Kunden", href: "/kunden" }, { label: k.name }]}>
      <PageHeader
        title={k.name}
        sub={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Kd.-Nr. <span className="font-mono text-[13px]">{k.nummer}</span></span>·<span>{k.typ === "firma" ? "Firma" : "Privat"}</span>
            {k.bauleister_13b && <Badge tone="brand" title="Neue Belege mit Steuerart § 13b UStG">Bauleister § 13b</Badge>}
            {adresse && <>·<span>{adresse}</span></>}
          </span>
        }
        actions={
          <>
            <KundeDialog kunde={k} lieferadressen={lieferadressen} herkunftListe={getCustomer().herkunft} />
            <KundeLoeschen id={k.id} name={k.name} />
          </>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Bereich titel="Aufträge" leer="Noch keine Aufträge. Ein Auftrag entsteht mit dem Fertigstellen einer Auftragsbestätigung." />
          <Bereich titel="Belege" leer="Noch keine Belege." />
          <Bereich titel="Anfragen" leer="Noch keine Anfragen." />
          <Bereich titel="Service-Tickets" leer="Noch keine Service-Tickets." />
        </div>

        <div className="flex flex-col gap-4">
          <Karte
            titel="Kontakt"
            rechts={
              k.lexware_kontakt_id ? (
                <Badge tone="green" title={k.lexware_seit ? `seit ${datum(k.lexware_seit)}` : undefined}>In Lexware angelegt</Badge>
              ) : (
                <Badge tone="gray">Geht mit dem ersten Beleg an Lexware</Badge>
              )
            }
          >
            <dl className="flex flex-col gap-3 text-[14.5px]">
              <Angabe name="Ansprechpartner">{k.ansprechpartner ?? "–"}</Angabe>
              <Angabe name="Telefon">
                {k.telefon ? <a className="text-accent-text hover:underline" href={`tel:${k.telefon.replace(/\s/g, "")}`}>{k.telefon}</a> : "–"}
              </Angabe>
              <Angabe name="E-Mail">
                {k.email ? <a className="text-accent-text hover:underline" href={`mailto:${k.email}`}>{k.email}</a> : "–"}
              </Angabe>
              <Angabe name="Rechnungsadresse">{adresse || "–"}</Angabe>
              <Angabe name="Lieferadressen">
                {aktiv.length ? (
                  aktiv.map((la) => (
                    <div key={la.id} className="mb-1.5 last:mb-0">
                      {la.bezeichnung && <b className="block font-medium">{la.bezeichnung}</b>}
                      {adresseText(la)}
                    </div>
                  ))
                ) : (
                  "wie Rechnungsadresse"
                )}
                {alt.map((la) => (
                  <div key={la.id} className="mt-1 text-[13px] text-muted-2">
                    alt: {la.bezeichnung ? `${la.bezeichnung} · ` : ""}{adresseText(la)}
                  </div>
                ))}
              </Angabe>
              <Angabe name="Herkunft">{k.herkunft ?? "–"}</Angabe>
              {k.notiz && <Angabe name="Notiz"><span className="whitespace-pre-line">{k.notiz}</span></Angabe>}
            </dl>
          </Karte>

          {konditionen && (
            <Karte
              titel="Konditionen"
              rechts={
                <Badge tone="gray" title="Nur Benutzer mit dem Recht „Konditionen sehen“">
                  <Lock className="size-3" aria-hidden="true" />
                  vertraulich
                </Badge>
              }
            >
              <KonditionenFormular kundeId={k.id} text={konditionen.text} />
            </Karte>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Karte({ titel, rechts, children }: { titel: string; rechts?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line-soft bg-surface px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{titel}</h2>
        {rechts}
      </div>
      {children}
    </section>
  );
}

function Bereich({ titel, leer }: { titel: string; leer: string }) {
  return (
    <Karte titel={titel} rechts={<span className="text-sm text-muted-2 tabular">0</span>}>
      <p className="text-sm text-muted">{leer}</p>
    </Karte>
  );
}

function Angabe({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-2">{name}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
