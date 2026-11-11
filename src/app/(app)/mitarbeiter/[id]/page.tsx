import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Angabe, Karte } from "@/components/app/info-karte";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { ladeMitarbeiter } from "@/lib/mitarbeiter";
import { stundenText, ZEIT_ART_TEXT, ABWESENHEIT_STATUS_TEXT, ABWESENHEIT_STATUS_TON, ABWESENHEIT_TEXT, ABWESENHEIT_TON, arbeitstageImJahr, arbeitstageText, arbeitstageZwischen } from "@/lib/team";
import { kalenderwoche, lokalKurz, montagVon, plusTage } from "@/lib/woche";
import { heuteBerlin, tag } from "@/lib/zeit";
import { ladeBuchungen, ladeZeitDialogDaten } from "@/lib/zeiten";
import { ZeitDialog } from "../../zeiten/zeit-dialog";
import { AbwesenheitDialog } from "../../abwesenheiten/ui";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { MitarbeiterAktionen, MitarbeiterDialog } from "../ui";

export const metadata: Metadata = { title: "Mitarbeiter" };

export default async function MitarbeiterSeite({ params }: PageProps<"/mitarbeiter/[id]">) {
  const { id } = await params;
  const daten = await ladeMitarbeiter(id);
  if (!daten) notFound();
  const { mitarbeiter: m, einsaetze, abwesenheiten, benutzer, anspruchStandard, jahr, montag } = daten;
  const [zeiten, zeitDialog, { benutzer: ich }] = await Promise.all([ladeBuchungen({ von: montag, bis: plusTage(montag, 6), mitarbeiter: m.id }), ladeZeitDialogDaten(), pruefeSitzung()]);
  const anspruch = m.urlaubsanspruch_tage ?? anspruchStandard;
  const urlaub = abwesenheiten.filter((a) => a.art === "urlaub");
  const genehmigt = urlaub.filter((a) => a.status === "genehmigt").reduce((s, a) => s + arbeitstageImJahr(a.von, a.bis, jahr), 0);
  const beantragt = urlaub.filter((a) => a.status === "beantragt").reduce((s, a) => s + arbeitstageImJahr(a.von, a.bis, jahr), 0);

  return (
    <Shell active="mitarbeiter" crumbs={[{ label: "Team und Ressourcen" }, { label: "Mitarbeiter", href: "/mitarbeiter" }, { label: m.name }]}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 min-w-12 place-items-center rounded-full bg-surface-sunken px-2 text-sm font-semibold">{m.kuerzel}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-4xl font-bold tracking-[-0.02em]">{m.name}</h1>
              {m.ist_monteur && <Badge tone="brand">Monteur</Badge>}
              {!m.aktiv && <Badge tone="gray">Inaktiv</Badge>}
            </div>
            <p className="mt-1 text-[14.5px] text-muted">
              {[m.rolle, m.ist_monteur ? (m.aktiv ? "erscheint in der Plantafel" : "nicht in der Plantafel (inaktiv)") : null].filter(Boolean).join(" · ") || "–"}
              {m.telefon && (
                <>
                  {" · "}
                  <a className="text-accent-text hover:underline" href={`tel:${m.telefon.replace(/\s/g, "")}`}>{m.telefon}</a>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <MitarbeiterDialog mitarbeiter={m} anspruchStandard={anspruchStandard} />
          <MitarbeiterAktionen id={m.id} name={m.name} aktiv={m.aktiv} />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Karte
            titel="Einsätze"
            rechts={
              m.ist_monteur ? (
                <a
                  href={`/pdf/wochenplan?woche=${montag}&monteur=${m.id}`}
                  target="_blank"
                  rel="noopener"
                  data-wochenplan-monteur
                  className="rounded-full border border-line px-3 py-1 text-sm font-medium hover:border-line-strong"
                >
                  Wochenplan drucken
                </a>
              ) : (
                <span className="text-xs text-muted-2">diese und nächste Woche</span>
              )
            }
          >
            {einsaetze.length ? (
              <ul className="flex flex-col">
                {einsaetze.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line-soft py-2.5 text-sm first:border-t-0">
                    <Link href={`/montageplan?woche=${montagVon(e.beginnLokal.slice(0, 10))}`} className="font-semibold hover:underline">
                      {lokalKurz(e.beginnLokal)} – {e.beginnLokal.slice(0, 10) === e.endeLokal.slice(0, 10) ? e.endeLokal.slice(11, 16) : lokalKurz(e.endeLokal)}
                    </Link>
                    {e.auftrag && (
                      <Link href={`/auftraege/${e.auftrag.id}`} className="text-ink-3 hover:underline">
                        <span className="font-mono text-[13px]">{e.auftrag.nummer}</span> · {e.auftrag.kunde?.name}
                      </Link>
                    )}
                    {!e.fest && <Badge tone="amber">vorgeplant</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{m.ist_monteur ? "Keine Einsätze in diesen zwei Wochen." : "Nur Monteure werden eingeplant."}</p>
            )}
          </Karte>

          <Karte
            titel={`Zeiten KW ${kalenderwoche(montag)}`}
            rechts={
              <span className="flex items-center gap-3">
                <b className="font-mono text-sm" data-stunden-woche>{stundenText(zeiten.reduce((x, z) => x + z.stunden, 0))}</b>
                {m.aktiv && (
                  <ZeitDialog
                    daten={{ ...zeitDialog, heute: heuteBerlin() }}
                    vorlage={{ mitarbeiter_id: m.id }}
                    ausloeser={<button type="button" className="rounded-full border border-line px-3 py-1 text-sm font-medium hover:border-line-strong">Zeit eintragen</button>}
                  />
                )}
              </span>
            }
          >
            {zeiten.length ? (
              <ul className="flex flex-col">
                {zeiten.map((z) => (
                  <li key={z.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line-soft py-2 text-sm first:border-t-0">
                    <span className="w-[86px] tabular">{tag(z.datum)}</span>
                    <span className="font-mono text-[13px]">{z.beginn}–{z.ende}</span>
                    <span className="text-muted">{ZEIT_ART_TEXT[z.art]}{z.auftrag ? ` · ${z.auftrag.nummer} ${z.auftrag.kunde}` : ""}</span>
                    <span className="ml-auto font-mono text-[13px]">{stundenText(z.stunden)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Keine Zeiten in dieser Woche.</p>
            )}
            <Link href={`/zeiten?mitarbeiter=${m.id}`} className="mt-2 inline-block text-sm text-accent-text hover:underline">In der Zeiterfassung öffnen</Link>
          </Karte>

          <Karte
            titel={`Abwesenheiten ${jahr}`}
            rechts={
              m.aktiv ? (
                <AbwesenheitDialog
                  mitarbeiter={[{ id: m.id, name: m.name }]}
                  admin={ich.admin}
                  heute={heuteBerlin()}
                  vorlage={{ mitarbeiter_id: m.id }}
                  ausloeser={<button type="button" className="rounded-full border border-line px-3 py-1 text-sm font-medium hover:border-line-strong">Abwesenheit eintragen</button>}
                />
              ) : undefined
            }
          >
            {abwesenheiten.length ? (
              <ul className="flex flex-col">
                {abwesenheiten.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft py-2.5 text-sm first:border-t-0">
                    <Badge tone={ABWESENHEIT_TON[a.art]}>{ABWESENHEIT_TEXT[a.art]}</Badge>
                    <span className="whitespace-nowrap">{tag(a.von)}{a.bis !== a.von ? ` – ${tag(a.bis)}` : ""}</span>
                    <span className="text-muted">{arbeitstageText(arbeitstageZwischen(a.von, a.bis))}</span>
                    <Badge tone={ABWESENHEIT_STATUS_TON[a.status]} className="ml-auto">{ABWESENHEIT_STATUS_TEXT[a.status]}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Keine Abwesenheiten in diesem Jahr.</p>
            )}
          </Karte>
        </div>

        <div className="flex flex-col gap-4">
          <Karte titel={`Urlaubskonto ${jahr}`}>
            <dl className="grid grid-cols-2 gap-3 text-[14.5px]">
              <Angabe name="Anspruch">{anspruch} Tage{m.urlaubsanspruch_tage == null && <span className="text-xs text-muted-2"> (Standard)</span>}</Angabe>
              <Angabe name="Rest"><b className="font-semibold">{anspruch - genehmigt - beantragt}</b> Tage</Angabe>
              <Angabe name="Genehmigt">{genehmigt} Tage</Angabe>
              <Angabe name="Beantragt">{beantragt} Tage</Angabe>
            </dl>
          </Karte>
          <Karte titel="Stammdaten">
            <dl className="flex flex-col gap-3 text-[14.5px]">
              <div className="grid grid-cols-2 gap-3">
                <Angabe name="Kürzel"><span className="font-mono">{m.kuerzel}</span></Angabe>
                <Angabe name="Monteur">{m.ist_monteur ? "Ja" : "Nein"}</Angabe>
              </div>
              <Angabe name="Rolle">{m.rolle ?? "–"}</Angabe>
              <Angabe name="Benutzerkonto">{benutzer ? `${benutzer.name} · ${benutzer.email}` : "keins (Version 1: nur das Büro hat Zugang)"}</Angabe>
            </dl>
          </Karte>
        </div>
      </div>
    </Shell>
  );
}
