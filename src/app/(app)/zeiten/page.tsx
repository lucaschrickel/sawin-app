import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ListenAuswahl } from "@/components/app/listen-suche";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Table, Td, Th } from "@/components/ui/table";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { cn } from "@/lib/cn";
import { stundenText, ZEIT_ART_TEXT, ZEIT_ARTEN } from "@/lib/team";
import { heuteBerlin } from "@/lib/zeit";
import { ladeBuchungen, ladeZeitDialogDaten, summeJeAuftrag, summeJeMitarbeiter, zeitraumAus } from "@/lib/zeiten";
import { BuchungenTabelle } from "./ui";
import { ZeitDialog } from "./zeit-dialog";

export const metadata: Metadata = { title: "Zeiterfassung" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ZeitenPage({ searchParams }: PageProps<"/zeiten">) {
  const sp = await searchParams;
  const heute = heuteBerlin();
  const ansicht = ["mitarbeiter", "auftraege"].includes(eins(sp.ansicht)) ? eins(sp.ansicht) : "buchungen";
  const zr = zeitraumAus(eins(sp.zeitraum), eins(sp.ab), heute);
  const mitarbeiter = UUID.test(eins(sp.mitarbeiter)) ? eins(sp.mitarbeiter) : "";
  const auftrag = UUID.test(eins(sp.auftrag)) ? eins(sp.auftrag) : "";
  const freigabe = eins(sp.freigabe) === "offen" ? "offen" : eins(sp.freigabe) === "freigegeben" ? "freigegeben" : "";
  const { supabase } = await pruefeSitzung();
  const [liste, dialog, alleMitarbeiter, auftragInfo] = await Promise.all([
    ladeBuchungen({ von: zr.von, bis: zr.bis, mitarbeiter, auftrag, freigabe }),
    ladeZeitDialogDaten(),
    supabase.from("mitarbeiter").select("id, name").order("name"),
    auftrag ? supabase.from("auftrag").select("id, nummer, kunde:kunde_id(name)").eq("id", auftrag).maybeSingle<{ id: string; nummer: string; kunde: { name: string } | null }>() : Promise.resolve({ data: null }),
  ]);
  const daten = { ...dialog, heute };

  const href = (aenderung: Record<string, string>) => {
    const p = new URLSearchParams();
    const werte = { ansicht: ansicht === "buchungen" ? "" : ansicht, zeitraum: zr.art === "woche" ? "" : zr.art, ab: eins(sp.ab), mitarbeiter, auftrag, freigabe, ...aenderung };
    for (const [k, v] of Object.entries(werte)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/zeiten?${qs}` : "/zeiten";
  };
  const chip = (aktiv: boolean) => cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm", aktiv ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink");
  const knopf = "inline-flex h-9 items-center justify-center rounded-full border border-line bg-surface px-3 text-sm hover:border-line-strong";
  const gesamt = liste.reduce((s, z) => s + z.stunden, 0);
  const jeMitarbeiter = summeJeMitarbeiter(liste);

  return (
    <Shell active="zeiten" crumbs={[{ label: "Team und Ressourcen" }, { label: "Zeiterfassung" }]}>
      <PageHeader
        title="Zeiterfassung"
        sub="Das Büro trägt die Zeiten ein · Montage, Aufmaß und Service mit Auftrag, Lager, Fahrt und Büro auch ohne · Freigabe durch das Büro"
        actions={<ZeitDialog daten={daten} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Ansicht" className="flex gap-1 rounded-full bg-surface-sunken p-1">
          <Link replace scroll={false} href={href({ ansicht: "" })} aria-current={ansicht === "buchungen" ? "page" : undefined} className={chip(ansicht === "buchungen")}>Buchungen</Link>
          <Link replace scroll={false} href={href({ ansicht: "mitarbeiter" })} aria-current={ansicht === "mitarbeiter" ? "page" : undefined} className={chip(ansicht === "mitarbeiter")}>Je Mitarbeiter</Link>
          <Link replace scroll={false} href={href({ ansicht: "auftraege" })} aria-current={ansicht === "auftraege" ? "page" : undefined} className={chip(ansicht === "auftraege")}>Je Auftrag</Link>
        </nav>
        <nav aria-label="Zeitraum" className="flex gap-1 rounded-full bg-surface-sunken p-1">
          <Link replace scroll={false} href={href({ zeitraum: "", ab: "" })} className={chip(zr.art === "woche")}>Woche</Link>
          <Link replace scroll={false} href={href({ zeitraum: "monat", ab: "" })} className={chip(zr.art === "monat")}>Monat</Link>
          <Link replace scroll={false} href={href({ zeitraum: "gesamt", ab: "" })} className={chip(zr.art === "gesamt")}>Gesamt</Link>
        </nav>
        {zr.zurueck && (
          <span className="flex items-center gap-2">
            <Link replace scroll={false} href={href({ ab: zr.zurueck })} aria-label="Zurück" className={knopf}><ChevronLeft className="size-4" /></Link>
            <b className="text-sm font-semibold whitespace-nowrap" data-zeitraum>{zr.text}</b>
            <Link replace scroll={false} href={href({ ab: zr.vor! })} aria-label="Vor" className={knopf}><ChevronRight className="size-4" /></Link>
          </span>
        )}
      </div>

      {ansicht === "buchungen" && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ListenAuswahl name="mitarbeiter" wert={mitarbeiter} label="Mitarbeiter filtern" alle="Alle Mitarbeiter" optionen={(alleMitarbeiter.data ?? []).map((m) => ({ wert: m.id, text: m.name }))} />
          <nav aria-label="Freigabe" className="flex gap-1 rounded-full bg-surface-sunken p-1">
            <Link replace scroll={false} href={href({ freigabe: "" })} className={chip(!freigabe)}>Alle</Link>
            <Link replace scroll={false} href={href({ freigabe: "offen" })} className={chip(freigabe === "offen")}>Offen</Link>
            <Link replace scroll={false} href={href({ freigabe: "freigegeben" })} className={chip(freigabe === "freigegeben")}>Freigegeben</Link>
          </nav>
          {auftragInfo.data && (
            <Link replace scroll={false} href={href({ auftrag: "" })} className="flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1.5 text-sm" aria-label="Auftragsfilter entfernen">
              Auftrag <span className="font-mono">{auftragInfo.data.nummer}</span> {auftragInfo.data.kunde?.name}
              <X className="size-3.5" />
            </Link>
          )}
          <span className="ml-auto text-sm text-muted">{liste.length} {liste.length === 1 ? "Buchung" : "Buchungen"} · <b className="font-semibold text-ink">{stundenText(gesamt)}</b></span>
        </div>
      )}

      {ansicht === "buchungen" && (
        <BuchungenTabelle
          zeilen={liste}
          daten={daten}
          summen={mitarbeiter ? [] : jeMitarbeiter.map((m) => ({ name: m.mitarbeiter.name, stunden: m.stunden }))}
        />
      )}

      {ansicht === "mitarbeiter" && (
        <div className="rounded-lg border border-line-soft bg-surface">
          {jeMitarbeiter.length ? (
            <Table className="min-w-[760px]">
              <thead>
                <tr>
                  <Th className="pl-4">Mitarbeiter</Th>
                  <Th className="text-right">Stunden</Th>
                  <Th className="text-right">davon freigegeben</Th>
                  <Th className="pr-4">nach Art</Th>
                </tr>
              </thead>
              <tbody>
                {jeMitarbeiter.map((m) => (
                  <tr key={m.mitarbeiter.id}>
                    <Td className="pl-4"><Link href={href({ ansicht: "", mitarbeiter: m.mitarbeiter.id })} className="font-medium hover:underline">{m.mitarbeiter.name}</Link></Td>
                    <Td className="text-right font-mono text-[13px] font-semibold">{stundenText(m.stunden)}</Td>
                    <Td className="text-right font-mono text-[13px]">{stundenText(m.freigegeben)}</Td>
                    <Td className="pr-4 text-sm text-ink-3">
                      {ZEIT_ARTEN.filter((a) => m.jeArt[a]).map((a) => `${ZEIT_ART_TEXT[a]} ${stundenText(m.jeArt[a]!)}`).join(" · ")}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <Td className="pl-4 font-semibold">Gesamt</Td>
                  <Td className="text-right font-mono text-[13px] font-semibold">{stundenText(gesamt)}</Td>
                  <Td colSpan={2} />
                </tr>
              </tfoot>
            </Table>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted">Keine Zeiten in diesem Zeitraum.</p>
          )}
        </div>
      )}

      {ansicht === "auftraege" && (
        <div className="rounded-lg border border-line-soft bg-surface">
          {liste.length ? (
            <Table className="min-w-[760px]">
              <thead>
                <tr>
                  <Th className="pl-4">Auftrag</Th>
                  <Th className="text-right">Stunden</Th>
                  <Th className="pr-4">nach Mitarbeiter</Th>
                </tr>
              </thead>
              <tbody>
                {summeJeAuftrag(liste).map((a) => (
                  <tr key={a.auftrag?.id ?? "ohne"} data-auftrag-summe={a.auftrag?.id ?? "ohne"}>
                    <Td className="pl-4">
                      {a.auftrag ? (
                        <>
                          <Link href={`/auftraege/${a.auftrag.id}`} className="font-mono font-medium hover:underline">{a.auftrag.nummer}</Link>
                          <div className="text-sm text-muted">{[a.auftrag.kunde, a.auftrag.titel].filter(Boolean).join(" · ")}</div>
                        </>
                      ) : (
                        <span className="text-muted">Ohne Bezug (Lager, Fahrt, Büro)</span>
                      )}
                    </Td>
                    <Td className="text-right font-mono text-[13px] font-semibold">
                      {a.auftrag ? <Link href={href({ ansicht: "", auftrag: a.auftrag.id })} className="hover:underline">{stundenText(a.stunden)}</Link> : stundenText(a.stunden)}
                    </Td>
                    <Td className="pr-4 text-sm text-ink-3">{a.jeMitarbeiter.map((m) => `${m.name} ${stundenText(m.stunden)}`).join(" · ")}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted">Keine Zeiten in diesem Zeitraum.</p>
          )}
        </div>
      )}
    </Shell>
  );
}
