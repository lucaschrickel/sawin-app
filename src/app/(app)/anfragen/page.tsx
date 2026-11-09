import type { Metadata } from "next";
import Link from "next/link";
import { KlickZeile } from "@/components/app/klick-zeile";
import { ListenSuche } from "@/components/app/listen-suche";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { getCustomer } from "@/customers";
import { ladeAnfragen, ladeBenutzerAuswahl, type AnfrageZeile } from "@/lib/anfragen";
import { ANFRAGE_STATUS, ANFRAGE_STATUS_TEXT, ANFRAGE_STATUS_TON, istAnfrageStatus } from "@/lib/anfragen-status";
import { ladeAnsicht } from "@/lib/ansicht";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { cn } from "@/lib/cn";
import { eurK } from "@/lib/format";
import { heuteBerlin, tag, zeitpunkt } from "@/lib/zeit";
import { AnfrageDialog } from "./anfrage-dialog";
import { AnfragenBoard, AnsichtUmschalter, type BoardKarte } from "./ui";

export const metadata: Metadata = { title: "Anfragen" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Aufmaß-Termin oder Wiedervorlage; überfällig, wenn die Wiedervorlage heute oder früher ist */
function termin(a: AnfrageZeile, heute: string) {
  if (a.aufmass_termin) return { text: `Aufmaß ${zeitpunkt(a.aufmass_termin)}`, ueberfaellig: false };
  if (a.wiedervorlage) return { text: `Wiedervorlage ${tag(a.wiedervorlage)}`, ueberfaellig: a.wiedervorlage <= heute };
  return null;
}

export default async function AnfragenPage({ searchParams }: PageProps<"/anfragen">) {
  const sp = await searchParams;
  const { benutzer: ich } = await pruefeSitzung();
  const archiv = eins(sp.ansicht) === "archiv";
  const status = istAnfrageStatus(eins(sp.status)) ? (eins(sp.status) as (typeof ANFRAGE_STATUS)[number]) : "";
  const meine = eins(sp.meine) === "1";
  const q = eins(sp.q);
  const ansicht = await ladeAnsicht("anfragen");
  // Das Board zeigt immer alle Statusspalten; der Statusfilter gilt nur für die Liste
  const [{ liste, anzahl }, benutzer] = await Promise.all([
    ladeAnfragen({ ansicht: archiv ? "archiv" : "offen", status: !archiv && ansicht === "board" ? "" : status, q, meine }),
    ladeBenutzerAuswahl(),
  ]);
  const c = getCustomer();
  const heute = heuteBerlin();
  const namen = new Map(benutzer.map((b) => [b.id, b.name]));
  const board = !archiv && ansicht === "board";

  const href = (aenderung: Record<string, string>) => {
    const p = new URLSearchParams();
    const werte = { ansicht: archiv ? "archiv" : "", status, meine: meine ? "1" : "", q, ...aenderung };
    for (const [k, v] of Object.entries(werte)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/anfragen?${qs}` : "/anfragen";
  };
  const chip = (aktiv: boolean) =>
    cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm", aktiv ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink");

  return (
    <Shell active="anfragen" crumbs={[{ label: "Kunden & Anfragen" }, { label: "Anfragen" }]}>
      <PageHeader
        title="Anfragen"
        sub="Händisch erfasst · Ablauf: Anfrage, Aufmaß, Angebot, Auftrag"
        actions={
          <>
            <nav aria-label="Offen oder Archiv" className="flex gap-1 rounded-full bg-surface-sunken p-1">
              <Link replace href={href({ ansicht: "", status: "" })} aria-current={!archiv ? "true" : undefined} className={chip(!archiv)}>Offen</Link>
              <Link replace href={href({ ansicht: "archiv", status: "" })} aria-current={archiv ? "true" : undefined} className={chip(archiv)}>Archiv</Link>
            </nav>
            {!archiv && <AnsichtUmschalter ansicht={ansicht} />}
            <AnfrageDialog benutzer={benutzer} ichId={ich.id} herkunftListe={c.herkunft} produkteListe={c.produkte} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ListenSuche wert={q} label="Anfragen durchsuchen" platzhalter="Anfrage, Kunde, Objekt …" />
        {!archiv && !board && (
          <nav aria-label="Nach Status filtern" className="flex flex-wrap gap-1 rounded-full bg-surface-sunken p-1">
            <Link replace scroll={false} href={href({ status: "" })} className={chip(!status)}>
              Alle <span className="text-xs text-muted-2 tabular">{anzahl.alle ?? 0}</span>
            </Link>
            {ANFRAGE_STATUS.map((s) => (
              <Link key={s} replace scroll={false} href={href({ status: s })} aria-current={status === s ? "true" : undefined} className={chip(status === s)}>
                {ANFRAGE_STATUS_TEXT[s]} <span className="text-xs text-muted-2 tabular">{anzahl[s] ?? 0}</span>
              </Link>
            ))}
          </nav>
        )}
        <nav aria-label="Zuständig" className="flex gap-1 rounded-full bg-surface-sunken p-1">
          <Link replace scroll={false} href={href({ meine: "" })} className={chip(!meine)}>Alle</Link>
          <Link replace scroll={false} href={href({ meine: "1" })} aria-current={meine ? "true" : undefined} className={chip(meine)}>Meine</Link>
        </nav>
      </div>

      {board ? (
        <AnfragenBoard
          key={liste.map((a) => a.id + a.status).join()}
          karten={liste.map<BoardKarte>((a) => ({
            id: a.id,
            titel: a.titel,
            status: a.status,
            kunde: a.kunde?.name ?? "",
            objekt: a.objekt,
            wert: a.geschaetzter_wert ? eurK(a.geschaetzter_wert) : null,
            produkte: a.produkte,
            termin: termin(a, heute),
            zustaendig: a.zustaendig_id ? (namen.get(a.zustaendig_id) ?? null) : null,
          }))}
        />
      ) : (
        <div className="rounded-lg border border-line-soft bg-surface">
          {liste.length ? (
            <Table className={archiv ? "min-w-[760px]" : "min-w-[980px]"}>
              <thead>
                <tr>
                  <Th className="pl-4">Anfrage</Th>
                  <Th>Kunde</Th>
                  <Th>{archiv ? "Ergebnis" : "Status"}</Th>
                  <Th>Eingang</Th>
                  {archiv ? <Th className="pr-4">Auftrag / Grund</Th> : (
                    <>
                      <Th>Herkunft</Th>
                      <Th>Produkte</Th>
                      <Th className="text-right">Wert</Th>
                      <Th className="pr-4">Termin / Wiedervorlage</Th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {liste.map((a) => {
                  const t = termin(a, heute);
                  return (
                    <KlickZeile key={a.id} href={`/anfragen/${a.id}`}>
                      <Td className="pl-4">
                        <Link href={`/anfragen/${a.id}`} className="font-medium hover:underline">{a.titel}</Link>
                        {a.objekt && <div className="text-sm text-muted">{a.objekt}</div>}
                      </Td>
                      <Td>{a.kunde?.name ?? "–"}</Td>
                      <Td>
                        {archiv ? (
                          <Badge tone={a.archiv === "gewonnen" ? "green" : "red"}>{a.archiv === "gewonnen" ? "Gewonnen" : "Verloren"}</Badge>
                        ) : (
                          <Badge tone={ANFRAGE_STATUS_TON[a.status]} dot>{ANFRAGE_STATUS_TEXT[a.status]}</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">{tag(a.eingang)}</Td>
                      {archiv ? (
                        <Td className="pr-4 text-sm">{a.archiv === "verloren" ? (a.verlust_grund ?? "–") : "Auftrag angelegt"}</Td>
                      ) : (
                        <>
                          <Td>{a.herkunft ?? "–"}</Td>
                          <Td><span className="flex flex-wrap gap-1">{a.produkte.map((p) => <Badge key={p} tone="gray">{p}</Badge>)}</span></Td>
                          <Td className="text-right font-mono text-[13px] whitespace-nowrap">{a.geschaetzter_wert ? eurK(a.geschaetzter_wert) : "–"}</Td>
                          <Td className={cn("pr-4 text-sm whitespace-nowrap", t?.ueberfaellig ? "font-medium text-tone-red-fg" : "text-muted")}>{t?.text ?? "–"}</Td>
                        </>
                      )}
                    </KlickZeile>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted">
              {q || status || meine ? "Keine Anfragen für diese Auswahl." : archiv ? "Noch keine archivierten Anfragen." : "Keine offenen Anfragen. Neue über „Neue Anfrage“ erfassen."}
            </p>
          )}
        </div>
      )}
    </Shell>
  );
}
