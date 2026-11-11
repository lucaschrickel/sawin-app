import type { Metadata } from "next";
import { AblageKarte } from "@/components/app/ablage-karte";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Angabe, Karte } from "@/components/app/info-karte";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { getCustomer } from "@/customers";
import { ladeAnfrage, ladeBenutzerAuswahl } from "@/lib/anfragen";
import { ANFRAGE_STATUS_TEXT, ANFRAGE_STATUS_TON } from "@/lib/anfragen-status";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeAufgabenZu } from "@/lib/aufgaben";
import { AufgabenKarte } from "../../aufgaben/ui";
import { eurK } from "@/lib/format";
import { heuteBerlin, tag, zeitpunkt } from "@/lib/zeit";
import { AnfrageDialog } from "../anfrage-dialog";
import { AnfrageAktionen, NotizFormular, StatusAuswahl } from "../ui";
import { ladeBelegeZu } from "@/lib/belege";
import { anzeigeStatus, belegSchritte } from "@/lib/belege-status";
import { eur } from "@/lib/format";
import { Plus } from "lucide-react";
import { BelegeKompakt } from "../../beleg/kompakt";
import { SchrittKnoepfe } from "../../beleg/ui";

export const metadata: Metadata = { title: "Anfrage" };

export default async function AnfragePage({ params }: PageProps<"/anfragen/[id]">) {
  const { id } = await params;
  const [daten, benutzer, { benutzer: ich }, aufgaben, belege] = await Promise.all([ladeAnfrage(id), ladeBenutzerAuswahl(), pruefeSitzung(), ladeAufgabenZu({ anfrage_id: id }), ladeBelegeZu({ anfrage_id: id })]);
  if (!daten) notFound();
  const { anfrage: a, kunde: k, lieferadressen, auftrag, historie } = daten;
  const c = getCustomer();
  const heute = heuteBerlin();
  // Jede Kette ist eine Variante (ein Angebot = ein Auftrag)
  const varianten = [...new Set(belege.map((b) => b.kette_id))].map((kid) => belege.filter((b) => b.kette_id === kid));
  const angenommen = belege.find((b) => b.art === "angebot" && b.status === "angenommen");
  const angebote = belege.filter((b) => b.art === "angebot");
  const zustaendig = benutzer.find((b) => b.id === a.zustaendig_id)?.name;
  const objekte = [
    ...lieferadressen.map((la) => [la.strasse, [la.plz, la.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")),
    k ? [k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "",
  ].filter(Boolean);

  return (
    <Shell active="anfragen" crumbs={[{ label: "Kunden & Anfragen" }, { label: "Anfragen", href: "/anfragen" }, { label: a.titel }]}>
      <PageHeader
        title={a.titel}
        sub={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Anfrage <span className="font-mono text-[13px]">{a.nummer}</span></span>·
            {a.archiv ? (
              <Badge tone={a.archiv === "gewonnen" ? "green" : "red"}>{a.archiv === "gewonnen" ? "Gewonnen" : "Verloren"}</Badge>
            ) : (
              <Badge tone={ANFRAGE_STATUS_TON[a.status]} dot>{ANFRAGE_STATUS_TEXT[a.status]}</Badge>
            )}
            ·{k ? <Link href={`/kunden/${k.id}`} className="text-accent-text hover:underline">{k.name}</Link> : "–"}
            {a.objekt && <>·<span>{a.objekt}</span></>}·<span>Eingang {tag(a.eingang)}</span>
          </span>
        }
        actions={
          <>
            {!a.archiv &&
              (angenommen ? (
                <Link href={`/beleg/neu?art=auftragsbestaetigung&vorgaenger=${angenommen.id}`} className="inline-flex h-[42px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-surface hover:opacity-90" data-ab-erstellen>
                  Auftragsbestätigung erstellen →
                </Link>
              ) : (
                <Link href={`/beleg/neu?art=angebot&anfrage=${a.id}`} className="inline-flex h-[42px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-surface hover:opacity-90" data-neues-angebot>
                  <Plus className="size-4" strokeWidth={2.2} />
                  {angebote.length ? "Weitere Variante" : "Neues Angebot"}
                </Link>
              ))}
            {!a.archiv && <StatusAuswahl id={a.id} status={a.status} />}
            {!a.archiv && (
              <AnfrageDialog anfrage={a} objekte={objekte} benutzer={benutzer} ichId={ich.id} herkunftListe={c.herkunft} produkteListe={c.produkte} />
            )}
            <AnfrageAktionen id={a.id} titel={a.titel} archiv={a.archiv} hatAuftrag={!!auftrag} />
          </>
        }
      />

      {auftrag && (
        <Hinweis>
          Gewonnen · Auftrag{" "}
          <Link className="font-mono font-medium text-accent-text hover:underline" href={`/auftraege/${auftrag.id}`}>{auftrag.nummer}</Link> angelegt.
        </Hinweis>
      )}
      {a.archiv === "verloren" && <Hinweis ton="rot">Verloren · Grund: {a.verlust_grund ?? "–"}</Hinweis>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Karte titel="Angebote" rechts={<span className="text-sm text-muted-2 tabular">{angebote.length}</span>}>
            {varianten.length ? (
              <>
                {varianten.length > 1 && <p className="mb-3 text-xs text-muted-2">Jedes Angebot ist eine Variante. Die AB zum angenommenen Angebot legt den Auftrag an; die übrigen werden „Nicht beauftragt“.</p>}
                <div className="flex flex-col gap-3">
                  {varianten.map((kette, i) => {
                    const ag = kette.find((b) => b.art === "angebot") ?? kette[0];
                    const s = anzeigeStatus(ag, kette, heute);
                    const schritte = belegSchritte(ag, kette);
                    return (
                      <div key={ag.kette_id} className="rounded-md border border-line-soft px-4 py-3" data-variante={i + 1}>
                        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold">
                            {varianten.length > 1 ? `Variante ${i + 1}` : "Angebot"}
                            {ag.titel && <span className="font-normal text-muted"> · {ag.titel}</span>}
                          </span>
                          <span className="text-sm text-muted">{eur(ag.summe_brutto)} · {s.text}</span>
                        </div>
                        <BelegeKompakt belege={kette} kette={kette} heute={heute} mitDatum />
                        {schritte.length > 0 && (
                          <div className="mt-2 border-t border-line-soft pt-2.5">
                            <SchrittKnoepfe schritte={schritte} belegId={ag.id} klein />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">{auftrag ? "Die Angebote sind mit dem Auftrag in dessen Belegkette gewandert." : "Noch keine Angebote."}</p>
            )}
          </Karte>
          <Karte titel="Aufmaßblatt">
            <p className="text-sm text-muted">Noch kein Aufmaß. Das digitale Aufmaßblatt kommt mit dem Modul Formulare.</p>
          </Karte>
          <Karte titel="Historie">
            <NotizFormular anfrageId={a.id} />
            <ol className="mt-4 flex flex-col">
              {historie.map((h, i) => (
                <li key={i} className="flex gap-3 border-t border-line-soft py-2.5 text-sm">
                  <span className="w-[132px] shrink-0 text-xs text-muted-2 tabular">{zeitpunkt(h.zeit)}</span>
                  <span className="min-w-0 flex-1">
                    {h.art !== "ereignis" && <Badge tone={h.art === "telefonat" ? "blue" : "gray"} className="mr-2">{h.art === "telefonat" ? "Telefonat" : "Notiz"}</Badge>}
                    <span className="whitespace-pre-line">{h.text}</span>
                    {h.wer && <span className="text-muted-2"> · {h.wer}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Karte>
        </div>

        <div className="flex flex-col gap-4">
          <Karte titel="Kontakt">
            <dl className="flex flex-col gap-3 text-[14.5px]">
              <Angabe name="Kunde">{k ? <Link href={`/kunden/${k.id}`} className="text-accent-text hover:underline">{k.name}</Link> : "–"}{k && <span className="ml-1.5 font-mono text-xs text-muted-2">{k.nummer}</span>}</Angabe>
              <Angabe name="Telefon">{k?.telefon ? <a className="text-accent-text hover:underline" href={`tel:${k.telefon.replace(/\s/g, "")}`}>{k.telefon}</a> : "–"}</Angabe>
              <Angabe name="E-Mail">{k?.email ? <a className="text-accent-text hover:underline" href={`mailto:${k.email}`}>{k.email}</a> : "–"}</Angabe>
              <Angabe name="Objekt">{a.objekt ?? "–"}</Angabe>
            </dl>
          </Karte>
          <AblageKarte bezug={{ anfrage_id: a.id }} hinweisOhneOrdner="Der Ordner entsteht mit dem ersten Angebot." />
          <Karte titel="Details">
            <dl className="flex flex-col gap-3 text-[14.5px]">
              <Angabe name="Produkte">
                {a.produkte.length ? <span className="flex flex-wrap gap-1">{a.produkte.map((p) => <Badge key={p} tone="gray">{p}</Badge>)}</span> : "–"}
              </Angabe>
              <div className="grid grid-cols-2 gap-3">
                <Angabe name="Geschätzter Wert">{a.geschaetzter_wert ? eurK(a.geschaetzter_wert) : "–"}</Angabe>
                <Angabe name="Herkunft">{a.herkunft ?? "–"}</Angabe>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Angabe name="Wiedervorlage">{a.wiedervorlage ? tag(a.wiedervorlage) : "–"}</Angabe>
                <Angabe name="Zuständig">{zustaendig ?? "–"}</Angabe>
              </div>
              <Angabe name="Aufmaß-Termin">{a.aufmass_termin ? zeitpunkt(a.aufmass_termin) : "–"}</Angabe>
              {a.beschreibung && <Angabe name="Beschreibung"><span className="whitespace-pre-line">{a.beschreibung}</span></Angabe>}
              {a.notiz && <Angabe name="Interne Notiz"><span className="whitespace-pre-line">{a.notiz}</span></Angabe>}
            </dl>
          </Karte>
          <AufgabenKarte aufgaben={aufgaben} bezug={{ art: "anfrage", id: a.id, text: a.titel }} kontext={{ benutzer, ichId: ich.id, heute }} />
        </div>
      </div>
    </Shell>
  );
}

function Hinweis({ ton = "gruen", children }: { ton?: "gruen" | "rot"; children: ReactNode }) {
  return (
    <p className={ton === "rot" ? "mb-4 rounded-md bg-tone-red-bg px-4 py-3 text-sm text-tone-red-fg" : "mb-4 rounded-md bg-tone-green-bg px-4 py-3 text-sm text-tone-green-fg"}>
      {children}
    </p>
  );
}
