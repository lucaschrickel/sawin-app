import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "Anfrage" };

export default async function AnfragePage({ params }: PageProps<"/anfragen/[id]">) {
  const { id } = await params;
  const [daten, benutzer, { benutzer: ich }, aufgaben] = await Promise.all([ladeAnfrage(id), ladeBenutzerAuswahl(), pruefeSitzung(), ladeAufgabenZu({ anfrage_id: id })]);
  if (!daten) notFound();
  const { anfrage: a, kunde: k, lieferadressen, auftrag, historie } = daten;
  const c = getCustomer();
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
          <Karte titel="Angebote" rechts={<span className="text-sm text-muted-2 tabular">0</span>}>
            <p className="text-sm text-muted">Noch keine Angebote. Angebote und Varianten kommen mit dem Beleg-Modul.</p>
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
          <AufgabenKarte aufgaben={aufgaben} bezug={{ art: "anfrage", id: a.id, text: a.titel }} kontext={{ benutzer, ichId: ich.id, heute: heuteBerlin() }} />
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
