import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Angabe, Karte } from "@/components/app/info-karte";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { getCustomer } from "@/customers";
import { ladeBenutzerAuswahl } from "@/lib/anfragen";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeAufgabenZu } from "@/lib/aufgaben";
import { cn } from "@/lib/cn";
import { heute as ladeHeute } from "@/lib/heute";
import { ladeTicket } from "@/lib/service";
import { AUFTRAG_PHASE_TEXT, AUFTRAG_PHASE_TON } from "@/lib/status";
import { ABRECHNUNG_TEXT, TICKET_ART_TEXT, TICKET_PRIO_TEXT, TICKET_PRIO_TON, TICKET_STATUS_TEXT, TICKET_STATUS_TON } from "@/lib/ticket-status";
import { stundenText } from "@/lib/team";
import { lokalKurz, montagVon } from "@/lib/woche";
import { tag, zeitpunkt } from "@/lib/zeit";
import { ladeBuchungen, ladeZeitDialogDaten, summeJeAuftrag } from "@/lib/zeiten";
import { AufgabenKarte } from "../../aufgaben/ui";
import { ZeitDialog } from "../../zeiten/zeit-dialog";
import { TicketDialog, TicketLoeschen, TicketNotizFormular, TicketStatusAuswahl, TicketStatusleiste } from "../ui";

export const metadata: Metadata = { title: "Service-Ticket" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TicketSeite({ params, searchParams }: PageProps<"/service/[id]">) {
  const { id } = await params;
  const reiter = eins((await searchParams).reiter) === "historie" ? "historie" : "uebersicht";
  const heute = await ladeHeute();
  const [daten, benutzer, { benutzer: ich }, aufgaben, zeiten, zeitDialog] = await Promise.all([
    ladeTicket(id),
    ladeBenutzerAuswahl(),
    pruefeSitzung(),
    ladeAufgabenZu({ ticket_id: id }),
    ladeBuchungen({ von: null, bis: null, ticket: id }).catch(() => []),
    ladeZeitDialogDaten(),
  ]);
  if (!daten) notFound();
  const { ticket: t, kunde: k, auftrag: a, einsaetze, historie } = daten;
  const c = getCustomer();
  const zustaendig = benutzer.find((b) => b.id === t.zustaendig_id)?.name;
  const bezug = { art: "ticket" as const, id: t.id, nummer: t.nummer, titel: t.thema, kunde: k?.name ?? "" };
  const planWoche = montagVon(t.wunschtermin && t.wunschtermin > heute ? t.wunschtermin : heute);
  const tab = (aktiv: boolean) => cn("-mb-px border-b-2 px-1 pb-2.5 text-[15px]", aktiv ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink");
  const offen = t.status !== "abgerechnet";

  return (
    <Shell active="service" crumbs={[{ label: "Montage & Service" }, { label: "Service-Tickets", href: "/service" }, { label: `${t.nummer} · ${k?.name ?? ""}` }]}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-full bg-surface-sunken px-2.5 py-1 font-mono text-[13px]">{t.nummer}</span>
            <h1 className="text-4xl font-bold tracking-[-0.02em]">{t.thema}</h1>
            <Badge tone={TICKET_STATUS_TON[t.status]} dot>{TICKET_STATUS_TEXT[t.status]}</Badge>
          </div>
          <p className="text-[14.5px] text-muted">
            {k ? <Link href={`/kunden/${k.id}`} className="text-accent-text hover:underline">{k.name}</Link> : "–"}
            {t.objekt && ` · ${t.objekt}`}
            {a && (
              <>
                {" · zu Auftrag "}
                <Link href={`/auftraege/${a.id}`} className="font-mono text-accent-text hover:underline">{a.nummer}</Link>
              </>
            )}
            {k?.telefon && (
              <>
                {" · "}
                <a className="text-accent-text hover:underline" href={`tel:${k.telefon.replace(/\s/g, "")}`}>{k.telefon}</a>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <TicketStatusAuswahl id={t.id} status={t.status} />
          <TicketDialog
            ticket={{ ...t, auftragInfo: a ? { id: a.id, nummer: a.nummer, titel: a.titel, kunde: k?.name ?? "", phase: a.phase } : null }}
            benutzer={benutzer}
            ichId={ich.id}
            herkunftListe={c.herkunft}
          />
          <TicketLoeschen id={t.id} nummer={t.nummer} />
        </div>
      </div>

      <nav aria-label="Bereiche" className="mb-4 flex gap-6 border-b border-line-soft">
        <Link replace href={`/service/${t.id}`} aria-current={reiter === "uebersicht" ? "page" : undefined} className={tab(reiter === "uebersicht")}>Übersicht</Link>
        <Link replace href={`/service/${t.id}?reiter=historie`} aria-current={reiter === "historie" ? "page" : undefined} className={tab(reiter === "historie")}>Historie</Link>
      </nav>

      {reiter === "historie" ? (
        <Karte titel="Historie" rechts={<span className="text-xs text-muted-2">Ereignisse, Telefonate, Notizen</span>}>
          <TicketNotizFormular ticketId={t.id} />
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
      ) : (
        <div className="flex flex-col gap-4">
          <TicketStatusleiste status={t.status} />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-4">
              <Karte titel="Problem">
                <p className="text-[14.5px] whitespace-pre-line">{t.problem ?? "–"}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-[14.5px]">
                  <Angabe name="Art">{TICKET_ART_TEXT[t.art]}</Angabe>
                  <Angabe name="Abrechnung">{ABRECHNUNG_TEXT[t.abrechnung]}</Angabe>
                  <Angabe name="Priorität"><Badge tone={TICKET_PRIO_TON[t.prioritaet]}>{TICKET_PRIO_TEXT[t.prioritaet]}</Badge></Angabe>
                  <Angabe name="Wunschtermin">{t.wunschtermin ? tag(t.wunschtermin) : "–"}</Angabe>
                  <Angabe name="Zuständig">{zustaendig ?? "–"}</Angabe>
                  <Angabe name="Kunde">{k ? <Link href={`/kunden/${k.id}`} className="text-accent-text hover:underline">{k.name}</Link> : "–"}</Angabe>
                </dl>
              </Karte>
              {a && (
                <Karte titel="Ursprungsauftrag" rechts={<Badge tone={AUFTRAG_PHASE_TON[a.phase]} dot>{AUFTRAG_PHASE_TEXT[a.phase]}</Badge>}>
                  <Link href={`/auftraege/${a.id}`} className="text-sm hover:underline"><span className="font-mono">{a.nummer}</span> · {a.titel}</Link>
                </Karte>
              )}
              <Karte titel="Belege" rechts={<span className="text-sm text-muted-2 tabular">0</span>}>
                <p className="text-sm text-muted">
                  Noch keine Belege. Die Rechnung zum Ticket kommt mit dem Beleg-Modul{t.status === "erledigt" ? " und ist dann der nächste Schritt" : ""}.
                  {(t.abrechnung === "garantie" || t.abrechnung === "kulanz") && ` Abrechnung: ${ABRECHNUNG_TEXT[t.abrechnung]}.`}
                </p>
              </Karte>
              <AufgabenKarte aufgaben={aufgaben} bezug={{ art: "ticket", id: t.id, text: `${t.nummer} · ${t.thema}` }} kontext={{ benutzer, ichId: ich.id, heute }} />
            </div>
            <div className="flex flex-col gap-4">
              <Karte
                titel="Einsatz"
                rechts={<Badge tone={einsaetze.length ? (einsaetze.some((e) => !e.fest) ? "amber" : "green") : "gray"}>{einsaetze.length ? (einsaetze.some((e) => !e.fest) ? "Vorgeplant" : "Freigegeben") : t.vorab_datum && offen ? "Terminierbar" : "Ungeplant"}</Badge>}
              >
                {einsaetze.length ? (
                  <ul className="flex flex-col">
                    {einsaetze.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line-soft py-2.5 text-sm first:border-t-0">
                        <Link href={`/serviceplan?woche=${montagVon(e.beginn.slice(0, 10))}`} className="font-semibold hover:underline">
                          {lokalKurz(e.beginn)} – {e.beginn.slice(0, 10) === e.ende.slice(0, 10) ? e.ende.slice(11, 16) : lokalKurz(e.ende)}
                        </Link>
                        <span className="text-muted">{e.team.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">
                    {t.vorab_datum && offen ? `Noch kein Termin · im Service-Plan in der Zeile „Terminierbar“ am ${tag(t.vorab_datum)}.` : "Noch nicht geplant."}
                  </p>
                )}
                {offen && (
                  <Link href={`/serviceplan?woche=${planWoche}&ticket=${t.id}`} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium hover:border-line-strong">
                    {einsaetze.length ? "Weiterer Einsatz" : "Einsatz planen"}
                  </Link>
                )}
              </Karte>
              <Karte
                titel="Zeiten"
                rechts={
                  <ZeitDialog
                    daten={{ ...zeitDialog, heute }}
                    vorlage={{ auftrag: bezug }}
                    ausloeser={<button type="button" className="rounded-full border border-line px-3 py-1 text-sm font-medium hover:border-line-strong">Zeit eintragen</button>}
                  />
                }
              >
                <p className="text-2xl font-semibold tabular" data-stunden-ticket>{stundenText(zeiten.reduce((x, z) => x + z.stunden, 0))}</p>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-3">
                  {summeJeAuftrag(zeiten)[0]?.jeMitarbeiter.map((m) => (
                    <li key={m.name} className="flex justify-between gap-2"><span>{m.name}</span><span className="font-mono text-[13px]">{stundenText(m.stunden)}</span></li>
                  ))}
                </ul>
                {zeiten.length > 0 && <Link href={`/zeiten?zeitraum=gesamt&ticket=${t.id}`} className="mt-2 inline-block text-sm text-accent-text hover:underline">Alle Buchungen</Link>}
              </Karte>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
