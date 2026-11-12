import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ListenAuswahl, ListenSuche } from "@/components/app/listen-suche";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { getCustomer } from "@/customers";
import { ladeBenutzerAuswahl } from "@/lib/anfragen";
import { ladeAnsicht } from "@/lib/ansicht";
import { ladeAuftraege, montageTermin, type AuftragZeile } from "@/lib/auftraege";
import { cn } from "@/lib/cn";
import { AUFTRAG_BESTELL_TEXT, auftragBestellstatus } from "@/lib/einkauf-status";
import { AUFTRAG_PHASE_TEXT, AUFTRAG_PHASE_TON, AUFTRAG_PHASEN, istAuftragPhase, MONTAGESTATUS_TEXT } from "@/lib/status";
import { heuteBerlin, kurzTermin, tag } from "@/lib/zeit";
import { ladeBeleg, ladeBelegListe, ladeBelegTags } from "@/lib/belege";
import { eur } from "@/lib/format";
import { AnsichtUmschalter } from "../anfragen/ui";
import { VorschauLeiste } from "../belege/liste";
import { AuftraegePipeline, AuswahlZeile, type PipelineKarte } from "./ui";
import { ChatZahl } from "../chat/ui";
import { ladeChatUngelesen } from "@/lib/chat";

export const metadata: Metadata = { title: "Aufträge" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Stand eines Auftrags für Karte und Liste: Montagetermin, sonst Lieferung, sonst Montagestatus */
function stand(a: AuftragZeile, heute: string): PipelineKarte["stand"] & { ueberfaellig?: boolean } {
  const e = montageTermin(a.einsaetze);
  if (e) return { text: `Montage ${kurzTermin(e.beginn)}${e.fest ? "" : " · vorgeplant"}`, ton: "brand" };
  if (a.warten_auf_kunde) return { text: "Warten auf Kunde", ton: "amber" };
  if (a.liefertermin) return { text: `Lieferung ${tag(a.liefertermin)}`, ton: "blue", ueberfaellig: a.phase === "bestellung" && a.liefertermin < heute };
  if (a.phase === "bestellung") return { text: "Noch kein Liefertermin", ton: "gray" };
  return { text: MONTAGESTATUS_TEXT[a.montagestatus], ton: a.montagestatus === "abgeschlossen" ? "green" : "gray" };
}
const warnung = (a: AuftragZeile) =>
  a.pruefhinweis ? "Prüfhinweis" : a.phase === "bestellung" && a.noch_nicht_bestellt ? "Noch nicht alles bestellt" : null;

export default async function AuftraegePage({ searchParams }: PageProps<"/auftraege">) {
  const sp = await searchParams;
  const phase = istAuftragPhase(eins(sp.phase)) ? (eins(sp.phase) as (typeof AUFTRAG_PHASEN)[number]) : "";
  const meine = eins(sp.meine) === "1";
  const abgeschlossene = eins(sp.abgeschlossene) === "1";
  const q = eins(sp.q);
  const c = getCustomer();
  const produkt = c.produkte.includes(eins(sp.produkt)) ? eins(sp.produkt) : "";
  const ansicht = await ladeAnsicht("auftraege");
  const board = ansicht === "board";
  // Die Pipeline zeigt immer alle Phasenspalten; der Phasenfilter gilt nur für die Liste
  const [{ liste, anzahl }, benutzer, ungelesen] = await Promise.all([
    ladeAuftraege({ phase: board ? "" : phase, q, meine, abgeschlossene, produkt }),
    ladeBenutzerAuswahl(),
    ladeChatUngelesen(),
  ]);
  const namen = new Map(benutzer.map((b) => [b.id, b.name]));
  // Aufträge sind die führende Ansicht der Auftragsbestätigungen: Wert = AB, Vorschau rechts = AB
  const abEntwuerfeAnsicht = !board && eins(sp.ab) === "entwuerfe";
  const [abs, teilAbs] = await Promise.all([ladeBelegListe(["auftragsbestaetigung"]), ladeBelegListe(["teil_ab"])]);
  // „+n Teil-AB“ je Auftrag
  const teilAbZahl = new Map<string, number>();
  for (const t of teilAbs) if (t.auftrag && t.status !== "entwurf") teilAbZahl.set(t.auftrag.id, (teilAbZahl.get(t.auftrag.id) ?? 0) + 1);
  const abZu = new Map(abs.filter((b) => b.status !== "entwurf" && b.auftrag).map((b) => [b.auftrag!.id, b]));
  const abEntwuerfe = abs.filter((b) => b.status === "entwurf");
  const gewaehlt = abEntwuerfeAnsicht ? "" : liste.some((a) => a.id === eins(sp.id)) ? eins(sp.id) : (liste[0]?.id ?? "");
  const gewaehlteAb = gewaehlt ? abZu.get(gewaehlt) : undefined;
  const [vorschau, tagVorschlaege] = !board && gewaehlteAb ? await Promise.all([ladeBeleg(gewaehlteAb.id), ladeBelegTags()]) : [null, [] as string[]];
  const heute = heuteBerlin();
  const phasen = abgeschlossene ? AUFTRAG_PHASEN : AUFTRAG_PHASEN.filter((p) => p !== "abgeschlossen");
  const offen = Object.entries(anzahl).filter(([k]) => k !== "alle" && k !== "abgeschlossen").reduce((s, [, n]) => s + n, 0);

  const href = (aenderung: Record<string, string>) => {
    const p = new URLSearchParams();
    const werte = { phase, meine: meine ? "1" : "", abgeschlossene: abgeschlossene ? "1" : "", produkt, q, ab: eins(sp.ab) === "entwuerfe" ? "entwuerfe" : "", ...aenderung };
    for (const [k, v] of Object.entries(werte)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/auftraege?${qs}` : "/auftraege";
  };
  const chip = (aktiv: boolean) =>
    cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm", aktiv ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink");

  return (
    <Shell active="auftraege" crumbs={[{ label: "Belege" }, { label: "Aufträge" }]}>
      <PageHeader
        title="Aufträge"
        sub={`${offen} offen${abgeschlossene ? "" : " · abgeschlossene ausgeblendet"} · Ein Auftrag entsteht mit dem Fertigstellen der Auftragsbestätigung`}
        actions={
          <>
            <AnsichtUmschalter ansicht={ansicht} seite="auftraege" />
            <Link href="/beleg/neu?art=auftragsbestaetigung" className="inline-flex h-[42px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-surface hover:opacity-90" data-neuer-auftrag>
              <Plus className="size-4" strokeWidth={2.2} />
              Neuer Auftrag
            </Link>
          </>
        }
      />

      {!board && (
        <nav aria-label="Aufträge oder AB-Entwürfe" className="mb-3 inline-flex gap-1 rounded-full bg-surface-sunken p-1">
          <Link replace scroll={false} href={href({ ab: "" })} className={chip(!abEntwuerfeAnsicht)}>Aufträge</Link>
          <Link replace scroll={false} href={href({ ab: "entwuerfe" })} aria-current={abEntwuerfeAnsicht ? "true" : undefined} className={chip(abEntwuerfeAnsicht)} data-ab-entwuerfe>
            AB-Entwürfe <span className="text-xs text-muted-2 tabular">{abEntwuerfe.length}</span>
          </Link>
        </nav>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ListenSuche wert={q} label="Aufträge durchsuchen" platzhalter="Nummer, Kunde, Titel, Objekt …" />
        {!board && (
          <nav aria-label="Nach Phase filtern" className="flex flex-wrap gap-1 rounded-full bg-surface-sunken p-1">
            <Link replace scroll={false} href={href({ phase: "" })} className={chip(!phase)}>
              Alle <span className="text-xs text-muted-2 tabular">{anzahl.alle ?? 0}</span>
            </Link>
            {phasen.map((p) => (
              <Link key={p} replace scroll={false} href={href({ phase: p })} aria-current={phase === p ? "true" : undefined} className={chip(phase === p)}>
                {AUFTRAG_PHASE_TEXT[p]} <span className="text-xs text-muted-2 tabular">{anzahl[p] ?? 0}</span>
              </Link>
            ))}
          </nav>
        )}
        <nav aria-label="Zuständig" className="flex gap-1 rounded-full bg-surface-sunken p-1">
          <Link replace scroll={false} href={href({ meine: "" })} className={chip(!meine)}>Alle</Link>
          <Link replace scroll={false} href={href({ meine: "1" })} aria-current={meine ? "true" : undefined} className={chip(meine)}>Meine</Link>
        </nav>
        <ListenAuswahl name="produkt" wert={produkt} label="Nach Produkt filtern" alle="Alle Produkte" optionen={c.produkte} />
        <Link
          replace
          scroll={false}
          href={href({ abgeschlossene: abgeschlossene ? "" : "1", phase: abgeschlossene && phase === "abgeschlossen" ? "" : phase })}
          role="checkbox"
          aria-checked={abgeschlossene}
          className="ml-auto flex items-center gap-2 text-sm text-ink-3"
        >
          <span className={cn("grid size-4 place-items-center rounded-[4px] border", abgeschlossene ? "border-ink bg-ink text-surface" : "border-line-strong")}>
            {abgeschlossene && <span className="text-[10px] leading-none">✓</span>}
          </span>
          Abgeschlossene zeigen
        </Link>
      </div>

      {board ? (
        <AuftraegePipeline
          key={liste.map((a) => a.id + a.phase).join()}
          phasen={phasen}
          karten={liste.map<PipelineKarte>((a) => ({
            id: a.id,
            nummer: a.nummer,
            phase: a.phase,
            kunde: a.kunde?.name ?? "",
            titel: a.titel,
            produkte: a.produkte,
            stand: stand(a, heute),
            warnung: warnung(a),
            bestellstatus: a.phase === "abgeschlossen" ? null : AUFTRAG_BESTELL_TEXT[auftragBestellstatus(a.bestellzeilen, a.noch_nicht_bestellt, a.phase)],
            zustaendig: a.zustaendig_id ? (namen.get(a.zustaendig_id) ?? null) : null,
            chat: ungelesen.auftrag.get(a.id) ?? 0,
          }))}
        />
      ) : abEntwuerfeAnsicht ? (
        <div className="rounded-lg border border-line-soft bg-surface">
          {abEntwuerfe.length ? (
            <Table className="min-w-[640px]">
              <thead>
                <tr>
                  <Th className="pl-4">Entwurf</Th>
                  <Th>Kunde</Th>
                  <Th>Bezug</Th>
                  <Th className="text-right">Wert</Th>
                  <Th className="pr-4">Zuletzt geändert</Th>
                </tr>
              </thead>
              <tbody>
                {abEntwuerfe.map((b) => (
                  <AuswahlZeile key={b.id} id={b.id} href={`/beleg/${b.id}`} gewaehlt={false}>
                    <Td className="pl-4"><Link href={`/beleg/${b.id}`} className="font-medium hover:underline">AB-Entwurf</Link></Td>
                    <Td>{b.kunde?.name ?? b.adresse_name ?? "–"}</Td>
                    <Td className="text-sm text-muted">{b.auftrag ? `Auftrag ${b.auftrag.nummer}` : b.anfrage ? `Anfrage ${b.anfrage.nummer}` : "ohne Angebot"}</Td>
                    <Td className="text-right tabular">{eur(b.summe_brutto)}</Td>
                    <Td className="pr-4 text-sm text-muted">{tag(b.updated_at)}</Td>
                  </AuswahlZeile>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted">Keine AB-Entwürfe.</p>
          )}
        </div>
      ) : (
        <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 rounded-lg border border-line-soft bg-surface">
            {liste.length ? (
              <Table className="min-w-[700px]">
                <thead>
                  <tr>
                    <Th className="pl-4">Auftrag</Th>
                    <Th>Kunde</Th>
                    <Th>Status</Th>
                    <Th className="max-[1380px]:hidden">Produkte</Th>
                    <Th>Termin</Th>
                    <Th className="pr-4 text-right">Wert</Th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((a) => {
                    const s = stand(a, heute);
                    const w = warnung(a);
                    const ab = abZu.get(a.id);
                    return (
                      <AuswahlZeile key={a.id} id={a.id} href={`/auftraege/${a.id}`} gewaehlt={a.id === gewaehlt}>
                        <Td className="pl-4 whitespace-nowrap">
                          <Link href={`/auftraege/${a.id}`} className="font-mono font-medium hover:underline">{a.nummer}</Link>
                          {teilAbZahl.get(a.id) ? <div className="text-xs text-muted" data-teil-ab>+{teilAbZahl.get(a.id)} Teil-AB</div> : null}
                        </Td>
                        <Td>
                          <b className="font-medium">{a.kunde?.name ?? "–"}</b> <ChatZahl n={ungelesen.auftrag.get(a.id)} className="ml-1 align-text-bottom" />
                          <div className="text-sm text-muted">{[a.titel, a.objekt].filter(Boolean).join(" · ")}</div>
                        </Td>
                        <Td>
                          <Badge tone={AUFTRAG_PHASE_TON[a.phase]} dot>{AUFTRAG_PHASE_TEXT[a.phase]}</Badge>
                          {a.phase !== "abgeschlossen" && (() => { const b = auftragBestellstatus(a.bestellzeilen, a.noch_nicht_bestellt, a.phase); return <div className={cn("mt-1 text-xs", b === "abgeschlossen" ? "text-tone-green-fg" : "text-muted")} data-bestellstatus={b}>{AUFTRAG_BESTELL_TEXT[b]}</div>; })()}
                          {w && <div className="mt-1 text-xs text-tone-red-fg">{w}</div>}
                        </Td>
                        <Td className="max-[1380px]:hidden"><span className="flex flex-wrap gap-1">{a.produkte.map((p) => <Badge key={p} tone="gray">{p}</Badge>)}</span></Td>
                        <Td className={cn("text-sm whitespace-nowrap", s.ueberfaellig ? "font-medium text-tone-red-fg" : "text-ink-3")}>{s.text}</Td>
                        <Td className="pr-4 text-right tabular whitespace-nowrap" data-wert>{ab ? eur(ab.summe_brutto) : <span className="text-muted-2">ohne AB</span>}</Td>
                      </AuswahlZeile>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-muted">
                {q || phase || meine || produkt ? "Keine Aufträge für diese Auswahl." : "Noch keine Aufträge. Ein Auftrag entsteht mit dem Fertigstellen der Auftragsbestätigung."}
              </p>
            )}
          </div>
          {vorschau ? (
            <VorschauLeiste detail={vorschau} vorschlaege={tagVorschlaege} />
          ) : (
            gewaehlt && (
              <aside className="rounded-lg border border-line-soft bg-surface p-4 text-sm text-muted" aria-label="Vorschau">
                <p>Dieser Auftrag hat noch keine Auftragsbestätigung.</p>
                <Link href={`/beleg/neu?art=auftragsbestaetigung&auftrag=${gewaehlt}`} className="mt-3 inline-block font-medium text-accent-text hover:underline">Auftragsbestätigung erstellen</Link>
              </aside>
            )
          )}
        </div>
      )}
    </Shell>
  );
}
