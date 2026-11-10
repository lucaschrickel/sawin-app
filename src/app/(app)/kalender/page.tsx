import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { cn } from "@/lib/cn";
import { heute as ladeHeute } from "@/lib/heute";
import { ladeKalender } from "@/lib/kalender";
import { amTag, KALENDER_ART_TEXT, KALENDER_ARTEN, KALENDER_TOKEN, kalenderSchritt, kalenderZeitraum, type KalenderAnsicht, type KalenderArt } from "@/lib/kalender-text";
import { plusTage } from "@/lib/woche";
import { KalenderInhalt, NeuerTermin } from "./ansicht";

export const metadata: Metadata = { title: "Kalender" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANSICHTEN: [KalenderAnsicht, string][] = [
  ["monat", "Monat"],
  ["woche", "Woche"],
  ["tag", "Tag"],
  ["liste", "Liste"],
];

export default async function KalenderPage({ searchParams }: PageProps<"/kalender">) {
  const sp = await searchParams;
  const heute = await ladeHeute();
  const ansicht = (ANSICHTEN.map(([a]) => a) as string[]).includes(eins(sp.ansicht)) ? (eins(sp.ansicht) as KalenderAnsicht) : "monat";
  const datum = DATUM.test(eins(sp.datum)) ? eins(sp.datum) : heute;
  const aus = eins(sp.aus).split(",").filter((a): a is KalenderArt => (KALENDER_ARTEN as readonly string[]).includes(a));
  const ma = eins(sp.ma).split(",").filter((x) => UUID.test(x));
  const zr = kalenderZeitraum(ansicht, datum);
  const mini = kalenderZeitraum("monat", datum);
  // Einmal laden für Ansicht und Mini-Kalender (dort werden Tage mit Einträgen markiert)
  const von = zr.von < mini.von ? zr.von : mini.von;
  const bis = zr.bis > mini.bis ? zr.bis : mini.bis;
  const k = await ladeKalender({ von, bis, aus, mitarbeiter: ma });

  const href = (aenderung: Record<string, string>) => {
    const p = new URLSearchParams();
    const werte = { ansicht: ansicht === "monat" ? "" : ansicht, datum: datum === heute ? "" : datum, aus: aus.join(","), ma: ma.join(","), ...aenderung };
    for (const [key, v] of Object.entries(werte)) if (v) p.set(key, v);
    const qs = p.toString();
    return qs ? `/kalender?${qs}` : "/kalender";
  };
  const umschalten = (liste: string[], wert: string) => (liste.includes(wert) ? liste.filter((x) => x !== wert) : [...liste, wert]).join(",");
  const knopf = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm hover:border-line-strong";
  const chip = (aktiv: boolean) => cn("rounded-full px-3.5 py-1.5 text-sm", aktiv ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:text-ink");

  const miniTage: string[] = [];
  for (let d = mini.von; d <= mini.bis; d = plusTage(d, 1)) miniTage.push(d);
  const feiertag = new Set(k.feiertage.map((f) => f.datum));
  const sichtbar = k.eintraege.filter((e) => e.ende.slice(0, 10) >= zr.von && e.beginn.slice(0, 10) <= zr.bis);

  return (
    <Shell active="kalender" crumbs={[{ label: "Team und Ressourcen" }, { label: "Kalender" }]}>
      <PageHeader
        title="Kalender"
        sub={zr.titel}
        actions={
          <>
            <nav aria-label="Zeitraum" className="flex items-center gap-2">
              <Link replace scroll={false} href={href({ datum: kalenderSchritt(ansicht, datum, -1) })} aria-label="Zurück" className={knopf}><ChevronLeft className="size-4" /></Link>
              <Link replace scroll={false} href={href({ datum: "" })} className={knopf}>Heute</Link>
              <Link replace scroll={false} href={href({ datum: kalenderSchritt(ansicht, datum, 1) })} aria-label="Weiter" className={knopf}><ChevronRight className="size-4" /></Link>
            </nav>
            <nav aria-label="Ansicht" className="flex gap-1 rounded-full bg-surface-sunken p-1">
              {ANSICHTEN.map(([a, l]) => (
                <Link key={a} replace scroll={false} href={href({ ansicht: a === "monat" ? "" : a })} aria-current={ansicht === a ? "page" : undefined} className={chip(ansicht === a)}>{l}</Link>
              ))}
            </nav>
            <NeuerTermin mitarbeiter={k.mitarbeiter} datum={datum} />
          </>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4" aria-label="Kalender-Filter">
          <section className="rounded-lg border border-line-soft bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <Link replace scroll={false} href={href({ datum: kalenderSchritt("monat", datum, -1) })} aria-label="Voriger Monat" className="grid size-7 place-items-center rounded-full hover:bg-surface-sunken"><ChevronLeft className="size-4" /></Link>
              <b className="text-sm font-semibold">{mini.titel}</b>
              <Link replace scroll={false} href={href({ datum: kalenderSchritt("monat", datum, 1) })} aria-label="Nächster Monat" className="grid size-7 place-items-center rounded-full hover:bg-surface-sunken"><ChevronRight className="size-4" /></Link>
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center text-[11px]">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => <span key={w} className="py-1 text-muted-2">{w}</span>)}
              {miniTage.map((d) => {
                const hat = k.eintraege.some((e) => amTag(e, d));
                return (
                  <Link
                    key={d}
                    replace
                    scroll={false}
                    href={href({ datum: d, ansicht: ansicht === "monat" || ansicht === "liste" ? "tag" : ansicht })}
                    aria-label={`${d.split("-").reverse().join(".")}${hat ? ", mit Einträgen" : ""}`}
                    data-mini={d}
                    data-hat={hat ? "1" : undefined}
                    className={cn(
                      "relative mx-auto grid size-7 place-items-center rounded-full tabular hover:bg-surface-sunken",
                      d.slice(0, 7) !== datum.slice(0, 7) && "text-muted-2",
                      feiertag.has(d) && "text-tone-red-fg",
                      d === heute && "bg-ink text-surface hover:bg-ink",
                      d === datum && d !== heute && "ring-1 ring-ink",
                    )}
                  >
                    {Number(d.slice(8, 10))}
                    {hat && <i className="absolute bottom-0.5 size-1 rounded-full bg-accent" aria-hidden="true" />}
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-line-soft bg-surface p-3">
            <h2 className="mb-2 px-1 text-xs font-medium tracking-[0.06em] text-muted-2 uppercase">Terminarten</h2>
            <ul className="flex flex-col">
              {KALENDER_ARTEN.map((a) => (
                <li key={a}>
                  <Link replace scroll={false} href={href({ aus: umschalten(aus, a) })} role="checkbox" aria-checked={!aus.includes(a)} data-filter-art={a} className="flex items-center gap-2.5 rounded-sm px-1 py-1.5 text-sm hover:bg-surface-muted">
                    <span className={cn("grid size-4 place-items-center rounded-[4px] border", !aus.includes(a) ? "border-ink bg-ink text-surface" : "border-line-strong")}>
                      {!aus.includes(a) && <span className="text-[10px] leading-none">✓</span>}
                    </span>
                    <span className="size-2.5 rounded-full" style={{ background: `var(--cal-${KALENDER_TOKEN[a]})` }} aria-hidden="true" />
                    <span className="flex-1">{KALENDER_ART_TEXT[a]}</span>
                    <span className="text-xs text-muted-2 tabular">{k.anzahl[a]}</span>
                  </Link>
                </li>
              ))}
              <li className="flex items-center gap-2.5 px-1 py-1.5 text-sm">
                <span className="size-4" />
                <span className="size-2.5 rounded-full bg-tone-red-fg" aria-hidden="true" />
                <span className="flex-1">Feiertage</span>
                <span className="text-xs text-muted-2">immer</span>
              </li>
            </ul>
          </section>

          <section className="rounded-lg border border-line-soft bg-surface p-3">
            <h2 className="mb-2 px-1 text-xs font-medium tracking-[0.06em] text-muted-2 uppercase">Mitarbeiter</h2>
            <div className="flex flex-wrap gap-1.5">
              {k.mitarbeiter.map((m) => (
                <Link
                  key={m.id}
                  replace
                  scroll={false}
                  href={href({ ma: umschalten(ma, m.id) })}
                  aria-pressed={ma.includes(m.id)}
                  data-filter-ma={m.id}
                  className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm", ma.includes(m.id) ? "border-ink bg-surface-sunken font-medium" : "border-line text-ink-3 hover:border-line-strong")}
                >
                  <span className="text-[11px] font-semibold">{m.kuerzel}</span>
                  {m.name.split(" ")[0]}
                </Link>
              ))}
            </div>
            {ma.length > 0 && <Link replace scroll={false} href={href({ ma: "" })} className="mt-2 inline-block px-1 text-xs text-accent-text hover:underline">Alle zeigen</Link>}
          </section>
        </aside>

        <div className="min-w-0 overflow-hidden rounded-lg border border-line-soft bg-surface" data-kalender={ansicht}>
          <KalenderInhalt ansicht={ansicht} von={zr.von} bis={zr.bis} monat={datum.slice(0, 7)} heute={heute} eintraege={sichtbar} feiertage={k.feiertage} mitarbeiter={k.mitarbeiter} />
        </div>
      </div>
    </Shell>
  );
}
