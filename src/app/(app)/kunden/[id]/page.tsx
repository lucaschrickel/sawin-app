import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { KlickZeile } from "@/components/app/klick-zeile";
import { PageHeader } from "@/components/app/page-header";
import { Angabe, Karte } from "@/components/app/info-karte";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { getCustomer } from "@/customers";
import { ladeBenutzerAuswahl, ladeZumKunden } from "@/lib/anfragen";
import { ANFRAGE_STATUS_TEXT, ANFRAGE_STATUS_TON, type AnfrageStatus } from "@/lib/anfragen-status";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeAufgabenZu } from "@/lib/aufgaben";
import { AUFTRAG_PHASE_TEXT, AUFTRAG_PHASE_TON, type AuftragPhase } from "@/lib/status";
import { AufgabenKarte } from "../../aufgaben/ui";
import { datum } from "@/lib/format";
import { heuteBerlin, tag } from "@/lib/zeit";
import { AnfrageDialog } from "../../anfragen/anfrage-dialog";
import { adresseText, ladeKunde } from "@/lib/kunden";
import { KundeDialog } from "../kunde-dialog";
import { KonditionenFormular, KundeLoeschen } from "../ui";

export const metadata: Metadata = { title: "Kunde" };

export default async function KundePage({ params }: PageProps<"/kunden/[id]">) {
  const { id } = await params;
  const [daten, zum, benutzer, { benutzer: ich }, aufgaben] = await Promise.all([ladeKunde(id), ladeZumKunden(id), ladeBenutzerAuswahl(), pruefeSitzung(), ladeAufgabenZu({ kunde_id: id })]);
  if (!daten) notFound();
  const c = getCustomer();
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
            <AnfrageDialog kunde={{ id: k.id, name: k.name }} benutzer={benutzer} ichId={ich.id} herkunftListe={c.herkunft} produkteListe={c.produkte} />
            <KundeDialog kunde={k} lieferadressen={lieferadressen} herkunftListe={c.herkunft} />
            <KundeLoeschen id={k.id} name={k.name} />
          </>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Karte titel="Aufträge" rechts={<span className="text-sm text-muted-2 tabular">{zum.auftraege.length}</span>}>
            {zum.auftraege.length ? (
              <ul className="flex flex-col">
                {zum.auftraege.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 border-t border-line-soft py-2 first:border-t-0">
                    <Link href={`/auftraege/${a.id}`} className="font-mono text-[13px] font-medium hover:underline">{a.nummer}</Link>
                    <span className="flex-1">{a.titel}</span>
                    <Badge tone={AUFTRAG_PHASE_TON[a.phase as AuftragPhase]} dot>{AUFTRAG_PHASE_TEXT[a.phase as AuftragPhase]}</Badge>
                    <span className="text-xs text-muted-2 max-sm:hidden">angelegt {tag(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Noch keine Aufträge.</p>
            )}
          </Karte>
          <Bereich titel="Belege" leer="Noch keine Belege." />
          <Karte titel="Anfragen" rechts={<span className="text-sm text-muted-2 tabular">{zum.anfragen.length}</span>}>
            {zum.anfragen.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Anfrage</Th>
                    <Th>Status</Th>
                    <Th>Eingang</Th>
                  </tr>
                </thead>
                <tbody>
                  {zum.anfragen.map((q) => (
                    <KlickZeile key={q.id} href={`/anfragen/${q.id}`}>
                      <Td><Link href={`/anfragen/${q.id}`} className="font-medium hover:underline">{q.titel}</Link></Td>
                      <Td>
                        {q.archiv ? (
                          <Badge tone={q.archiv === "gewonnen" ? "green" : "red"}>{q.archiv === "gewonnen" ? "Gewonnen" : "Verloren"}</Badge>
                        ) : (
                          <Badge tone={ANFRAGE_STATUS_TON[q.status as AnfrageStatus]} dot>{ANFRAGE_STATUS_TEXT[q.status as AnfrageStatus]}</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">{tag(q.eingang)}</Td>
                    </KlickZeile>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted">Noch keine Anfragen.</p>
            )}
          </Karte>
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

          <AufgabenKarte aufgaben={aufgaben} bezug={{ art: "kunde", id: k.id, text: k.name }} kontext={{ benutzer, ichId: ich.id, heute: heuteBerlin() }} />

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


function Bereich({ titel, leer }: { titel: string; leer: string }) {
  return (
    <Karte titel={titel} rechts={<span className="text-sm text-muted-2 tabular">0</span>}>
      <p className="text-sm text-muted">{leer}</p>
    </Karte>
  );
}
