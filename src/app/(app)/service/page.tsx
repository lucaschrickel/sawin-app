import type { Metadata } from "next";
import Link from "next/link";
import { KlickZeile } from "@/components/app/klick-zeile";
import { ListenSuche } from "@/components/app/listen-suche";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { getCustomer } from "@/customers";
import { ladeBenutzerAuswahl } from "@/lib/anfragen";
import { ladeAnsicht } from "@/lib/ansicht";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { cn } from "@/lib/cn";
import { ladeTickets, type TicketZeile } from "@/lib/service";
import {
  ABRECHNUNG_TEXT,
  TICKET_ART_TEXT,
  TICKET_ARTEN,
  TICKET_PRIO_TEXT,
  TICKET_PRIO_TON,
  TICKET_STATUS,
  TICKET_STATUS_TEXT,
  TICKET_STATUS_TON,
  type TicketArt,
  type TicketStatus,
} from "@/lib/status";
import { kurzTermin, tag } from "@/lib/zeit";
import { AnsichtUmschalter } from "../anfragen/ui";
import { TicketBoard, TicketDialog, type BoardKarte } from "./ui";

export const metadata: Metadata = { title: "Service-Tickets" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Termin: nächster Einsatz, sonst Wunschtermin */
function termin(t: TicketZeile) {
  const e = [...t.einsaetze].sort((a, b) => a.beginn.localeCompare(b.beginn)).at(-1);
  if (e) return `Termin ${kurzTermin(e.beginn)}${e.fest ? "" : " · vorgeplant"}`;
  if (t.wunschtermin) return `Wunsch ${tag(t.wunschtermin)}`;
  return "Noch kein Termin";
}

export default async function ServicePage({ searchParams }: PageProps<"/service">) {
  const sp = await searchParams;
  const { benutzer: ich } = await pruefeSitzung();
  const art = (TICKET_ARTEN as readonly string[]).includes(eins(sp.art)) ? (eins(sp.art) as TicketArt) : "";
  const status = (TICKET_STATUS as readonly string[]).includes(eins(sp.status)) ? (eins(sp.status) as TicketStatus) : "";
  const meine = eins(sp.meine) === "1";
  const erledigte = eins(sp.erledigte) === "1";
  const q = eins(sp.q);
  const [ansicht, benutzer] = await Promise.all([ladeAnsicht("service"), ladeBenutzerAuswahl()]);
  const board = ansicht === "board";
  const { liste, anzahl } = await ladeTickets({ art, status: board ? "" : status, q, meine, erledigte: board || erledigte });
  const c = getCustomer();
  const namen = new Map(benutzer.map((b) => [b.id, b.name]));

  const href = (aenderung: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ art, status, meine: meine ? "1" : "", erledigte: erledigte ? "1" : "", q, ...aenderung })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/service?${qs}` : "/service";
  };
  const chip = (aktiv: boolean) => cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm", aktiv ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink");

  return (
    <Shell active="service" crumbs={[{ label: "Montage & Service" }, { label: "Service-Tickets" }]}>
      <PageHeader
        title="Service-Tickets"
        sub="Reklamationen nach Abschluss, Wartung und Reparaturen · geplant im Service-Plan"
        actions={
          <>
            <AnsichtUmschalter ansicht={ansicht} seite="service" />
            <TicketDialog benutzer={benutzer} ichId={ich.id} herkunftListe={c.herkunft} />
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ListenSuche wert={q} label="Tickets durchsuchen" platzhalter="Nummer, Kunde, Thema, Objekt …" />
        <nav aria-label="Zuständig" className="flex gap-1 rounded-full bg-surface-sunken p-1">
          <Link replace scroll={false} href={href({ meine: "" })} className={chip(!meine)}>Alle</Link>
          <Link replace scroll={false} href={href({ meine: "1" })} aria-current={meine ? "true" : undefined} className={chip(meine)}>Meine</Link>
        </nav>
        {!board && (
          <Link replace scroll={false} href={href({ erledigte: erledigte ? "" : "1" })} role="checkbox" aria-checked={erledigte} className="ml-auto flex items-center gap-2 text-sm text-ink-3">
            <span className={cn("grid size-4 place-items-center rounded-[4px] border", erledigte ? "border-ink bg-ink text-surface" : "border-line-strong")}>{erledigte && <span className="text-[10px] leading-none">✓</span>}</span>
            Abgerechnete zeigen
          </Link>
        )}
      </div>
      <div className="mb-4 flex flex-col gap-2">
        <nav aria-label="Nach Art filtern" className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-sm text-muted">Art</span>
          <Link replace scroll={false} href={href({ art: "" })} className={chip(!art)}>Alle</Link>
          {TICKET_ARTEN.map((a) => (
            <Link key={a} replace scroll={false} href={href({ art: a })} aria-current={art === a ? "true" : undefined} className={chip(art === a)}>
              {TICKET_ART_TEXT[a]} <span className="text-xs text-muted-2 tabular">{anzahl[`a:${a}`] ?? 0}</span>
            </Link>
          ))}
        </nav>
        {!board && (
          <nav aria-label="Nach Status filtern" className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-sm text-muted">Status</span>
            <Link replace scroll={false} href={href({ status: "" })} className={chip(!status)}>Alle</Link>
            {TICKET_STATUS.map((s) => (
              <Link key={s} replace scroll={false} href={href({ status: s })} aria-current={status === s ? "true" : undefined} className={chip(status === s)}>
                {TICKET_STATUS_TEXT[s]} <span className="text-xs text-muted-2 tabular">{anzahl[`s:${s}`] ?? 0}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>

      {board ? (
        <TicketBoard
          key={liste.map((t) => t.id + t.status).join()}
          karten={liste.map<BoardKarte>((t) => ({
            id: t.id,
            nummer: t.nummer,
            thema: t.thema,
            kunde: t.kunde?.name ?? "",
            status: t.status,
            art: t.art,
            prioritaet: t.prioritaet,
            termin: termin(t),
            auftrag: t.auftrag?.nummer ?? null,
            abrechnung: t.abrechnung,
          }))}
        />
      ) : (
        <div className="rounded-lg border border-line-soft bg-surface">
          {liste.length ? (
            <Table className="min-w-[960px]">
              <thead>
                <tr>
                  <Th className="pl-4">Ticket</Th>
                  <Th>Kunde</Th>
                  <Th>Priorität</Th>
                  <Th>Art</Th>
                  <Th>Abrechnung</Th>
                  <Th>Bezug</Th>
                  <Th>Termin</Th>
                  <Th className="pr-4">Status</Th>
                </tr>
              </thead>
              <tbody>
                {liste.map((t) => (
                  <KlickZeile key={t.id} href={`/service/${t.id}`}>
                    <Td className="pl-4 whitespace-nowrap"><Link href={`/service/${t.id}`} className="font-mono font-medium hover:underline">{t.nummer}</Link></Td>
                    <Td>
                      <b className="font-medium">{t.kunde?.name ?? "–"}</b>
                      <div className="text-sm text-muted">{t.thema}</div>
                    </Td>
                    <Td><Badge tone={TICKET_PRIO_TON[t.prioritaet]}>{TICKET_PRIO_TEXT[t.prioritaet]}</Badge></Td>
                    <Td className="text-sm whitespace-nowrap">{TICKET_ART_TEXT[t.art]}</Td>
                    <Td className="text-sm">{ABRECHNUNG_TEXT[t.abrechnung]}</Td>
                    <Td className="text-sm">{t.auftrag ? <Link href={`/auftraege/${t.auftrag.id}`} className="font-mono hover:underline">{t.auftrag.nummer}</Link> : <span className="text-muted-2">–</span>}</Td>
                    <Td className="text-sm whitespace-nowrap text-ink-3">{termin(t)}</Td>
                    <Td className="pr-4">
                      <Badge tone={TICKET_STATUS_TON[t.status]} dot>{TICKET_STATUS_TEXT[t.status]}</Badge>
                      {t.zustaendig_id && <div className="mt-1 text-xs text-muted-2">{namen.get(t.zustaendig_id)}</div>}
                    </Td>
                  </KlickZeile>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted">{q || art || status || meine ? "Keine Tickets für diese Auswahl." : "Noch keine Service-Tickets. Über „Neues Ticket“ anlegen."}</p>
          )}
        </div>
      )}
    </Shell>
  );
}
