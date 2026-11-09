import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Angabe, Karte } from "@/components/app/info-karte";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { getCustomer } from "@/customers";
import { ladeBenutzerAuswahl } from "@/lib/anfragen";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeAufgabenZu } from "@/lib/aufgaben";
import { ladeAuftrag } from "@/lib/auftraege";
import { cn } from "@/lib/cn";
import { AUFTRAG_PHASE_TEXT, AUFTRAG_PHASE_TON, MONTAGESTATUS_TEXT } from "@/lib/status";
import { montagVon } from "@/lib/woche";
import { heuteBerlin, kurzTermin, tag, utcNachBerlinLokal, zeitpunkt } from "@/lib/zeit";
import { NotizFormular } from "../../anfragen/ui";
import { AufgabenKarte } from "../../aufgaben/ui";
import { AuftragDialog, AuftragLoeschen, LieferungFormular, PhaseAuswahl, Phasenleiste, PruefhinweisEntfernen } from "../ui";

export const metadata: Metadata = { title: "Auftrag" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const uhrzeit = (iso: string) => kurzTermin(iso).split(" ").at(-1);

export default async function AuftragPage({ params, searchParams }: PageProps<"/auftraege/[id]">) {
  const { id } = await params;
  const reiter = eins((await searchParams).reiter) === "historie" ? "historie" : "uebersicht";
  const [daten, benutzer, { benutzer: ich }, aufgaben] = await Promise.all([ladeAuftrag(id), ladeBenutzerAuswahl(), pruefeSitzung(), ladeAufgabenZu({ auftrag_id: id })]);
  if (!daten) notFound();
  const { auftrag: a, kunde: k, anfrage, einsaetze, ursprung, nachtraege, historie } = daten;
  const c = getCustomer();
  const zustaendig = benutzer.find((b) => b.id === a.zustaendig_id)?.name;
  const heute = heuteBerlin();
  const woche = (iso: string) => montagVon(utcNachBerlinLokal(iso).slice(0, 10));
  const planWoche = montagVon(a.liefertermin && a.liefertermin > heute ? a.liefertermin : heute);
  const tab = (aktiv: boolean) => cn("-mb-px border-b-2 px-1 pb-2.5 text-[15px]", aktiv ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink");

  return (
    <Shell active="auftraege" crumbs={[{ label: "Belege" }, { label: "Aufträge", href: "/auftraege" }, { label: `${a.nummer} · ${k?.name ?? ""}` }]}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span title="Auftragsnummer = Nummer der Auftragsbestätigung" className="rounded-full bg-surface-sunken px-2.5 py-1 font-mono text-[13px]">{a.nummer}</span>
            <h1 className="text-4xl font-bold tracking-[-0.02em]">
              {k ? <Link href={`/kunden/${k.id}`} className="hover:underline">{k.name}</Link> : "–"}
            </h1>
            <Badge tone={AUFTRAG_PHASE_TON[a.phase]} dot>{AUFTRAG_PHASE_TEXT[a.phase]}</Badge>
            {ursprung && <Link href={`/auftraege/${ursprung.id}`}><Badge tone="gray">Nachtrag zu {ursprung.nummer}</Badge></Link>}
          </div>
          <p className="text-[14.5px] text-muted">
            {[a.titel, a.objekt].filter(Boolean).join(" · ")}
            {k?.telefon && (
              <>
                {" · "}
                <a className="text-accent-text hover:underline" href={`tel:${k.telefon.replace(/\s/g, "")}`}>{k.telefon}</a>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <PhaseAuswahl id={a.id} phase={a.phase} />
          <AuftragDialog auftrag={a} benutzer={benutzer} herkunftListe={c.herkunft} produkteListe={c.produkte} />
          <AuftragLoeschen id={a.id} nummer={a.nummer} />
        </div>
      </div>

      <nav aria-label="Bereiche" className="mb-4 flex gap-6 border-b border-line-soft">
        <Link replace href={`/auftraege/${a.id}`} aria-current={reiter === "uebersicht" ? "page" : undefined} className={tab(reiter === "uebersicht")}>Übersicht</Link>
        <Link replace href={`/auftraege/${a.id}?reiter=historie`} aria-current={reiter === "historie" ? "page" : undefined} className={tab(reiter === "historie")}>Historie</Link>
      </nav>

      {reiter === "historie" ? (
        <Karte titel="Historie" rechts={<span className="text-xs text-muted-2">Ereignisse, Telefonate, Notizen</span>}>
          <NotizFormular auftragId={a.id} />
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
          {a.pruefhinweis && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md bg-tone-amber-bg px-4 py-3 text-sm text-tone-amber-fg">
              <TriangleAlert className="size-5 shrink-0" />
              <span className="flex-1">{a.pruefhinweis}</span>
              <PruefhinweisEntfernen id={a.id} />
            </div>
          )}
          <Phasenleiste id={a.id} phase={a.phase} />

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-4">
              <Karte titel="Montage" rechts={<Badge tone={einsaetze.length ? (einsaetze.some((e) => !e.fest) ? "amber" : "green") : "gray"}>{einsaetze.length ? (einsaetze.some((e) => !e.fest) ? "Vorgeplant" : "Freigegeben") : "Ungeplant"}</Badge>}>
                {einsaetze.length ? (
                  <ul className="flex flex-col">
                    {einsaetze.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line-soft py-2.5 text-sm first:border-t-0">
                        <Link href={`/montageplan?woche=${woche(e.beginn)}`} className="font-semibold hover:underline">{kurzTermin(e.beginn)}–{tag(e.beginn) === tag(e.ende) ? uhrzeit(e.ende) : kurzTermin(e.ende)}</Link>
                        <span className="text-muted">{e.monteure.map((m) => m.name).join(", ") || "ohne Monteur"}</span>
                        {!e.fest && <Badge tone="amber">vorgeplant</Badge>}
                        {e.hinweis && <span className="basis-full text-xs text-muted-2">{e.hinweis}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Noch kein Montagetermin.</p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-2">Montagestatus: {MONTAGESTATUS_TEXT[a.montagestatus]}</span>
                  <Link href={`/montageplan?woche=${planWoche}&auftrag=${a.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium hover:border-line-strong">
                    {einsaetze.length ? "Weiterer Einsatz" : "Montage planen"}
                  </Link>
                </div>
              </Karte>

              <Karte titel="Bestellung & Lieferung">
                <LieferungFormular auftrag={a} />
              </Karte>

              <AufgabenKarte aufgaben={aufgaben} bezug={{ art: "auftrag", id: a.id, text: `${a.nummer} · ${a.titel}` }} kontext={{ benutzer, ichId: ich.id, heute }} />
              {a.bemerkung && <p className="text-sm whitespace-pre-line text-muted">Bemerkung: {a.bemerkung}</p>}
            </div>

            <div className="flex flex-col gap-4">
              <Karte titel="Belege" rechts={<span className="text-sm text-muted-2 tabular">0</span>}>
                <p className="text-sm text-muted">
                  Noch keine Belege. Die Belegkette (Angebot, AB, Lieferschein, Rechnungen) erscheint hier mit dem Beleg-Modul.
                </p>
              </Karte>
              <Karte titel="Kunde & Herkunft">
                <dl className="flex flex-col gap-3 text-[14.5px]">
                  <Angabe name="Kunde">
                    {k ? <Link href={`/kunden/${k.id}`} className="text-accent-text hover:underline">{k.name}</Link> : "–"}
                    {k && <span className="ml-1.5 font-mono text-xs text-muted-2">{k.nummer}</span>}
                  </Angabe>
                  {k?.email && <Angabe name="E-Mail"><a className="text-accent-text hover:underline" href={`mailto:${k.email}`}>{k.email}</a></Angabe>}
                  <Angabe name="Anfrage">
                    {anfrage ? <Link href={`/anfragen/${anfrage.id}`} className="text-accent-text hover:underline">{anfrage.titel}</Link> : "–"}
                    {anfrage && <span className="ml-1.5 font-mono text-xs text-muted-2">{anfrage.nummer}</span>}
                  </Angabe>
                  <div className="grid grid-cols-2 gap-3">
                    <Angabe name="Herkunft">{a.herkunft ?? "–"}</Angabe>
                    <Angabe name="Zuständig">{zustaendig ?? "–"}</Angabe>
                  </div>
                  <Angabe name="Produkte">
                    {a.produkte.length ? <span className="flex flex-wrap gap-1">{a.produkte.map((p) => <Badge key={p} tone="gray">{p}</Badge>)}</span> : "–"}
                  </Angabe>
                  {a.abgeschlossen_am && <Angabe name="Abgeschlossen am">{tag(a.abgeschlossen_am)}</Angabe>}
                </dl>
              </Karte>
              {nachtraege.length > 0 && (
                <Karte titel="Nachträge">
                  <ul className="flex flex-col">
                    {nachtraege.map((n) => (
                      <li key={n.id} className="flex items-center justify-between gap-2 border-t border-line-soft py-2 text-sm first:border-t-0">
                        <Link href={`/auftraege/${n.id}`} className="hover:underline"><span className="font-mono">{n.nummer}</span> · {n.titel}</Link>
                        <Badge tone={AUFTRAG_PHASE_TON[n.phase as keyof typeof AUFTRAG_PHASE_TON]} dot>{AUFTRAG_PHASE_TEXT[n.phase as keyof typeof AUFTRAG_PHASE_TEXT]}</Badge>
                      </li>
                    ))}
                  </ul>
                </Karte>
              )}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
