import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { BalkenListe, DashKarte, HinweisZeile, Platzhalter, Ring, RingKarte } from "@/components/app/dashboard-bausteine";
import { KpiCard } from "@/components/app/kpi-card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import type { ladeEinkauf, ladeGeschaeftsfuehrung, ladeMontage } from "@/lib/dashboard";
import { AUFTRAG_BESTELL_TEXT, AUFTRAG_BESTELL_TON, BESTELL_STATUS_TEXT, BESTELL_STATUS_TON } from "@/lib/einkauf-status";
import { AUFTRAG_PHASE_TEXT, AUFTRAG_PHASE_TON } from "@/lib/status";
import { ABWESENHEIT_TEXT } from "@/lib/team";
import { kalenderwoche, montagVon, plusTage } from "@/lib/woche";
import { NeueBestellung } from "../bestellungen/neu";
import { Zeitachse } from "./zeitachse";

/** „heute“, „morgen“, „Do 12.11.“ */
function relTag(lokal: string, heute: string) {
  const d = lokal.slice(0, 10);
  if (d === heute) return "heute";
  if (d === plusTage(heute, 1)) return "morgen";
  const wt = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(`${d}T12:00:00Z`).getUTCDay()];
  return `${wt} ${d.slice(8, 10)}.${d.slice(5, 7)}.`;
}
const kurz = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
const mehrzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;
const wochenTitel = (montag: string, werte: number[], eins: string, viele: string) => werte.map((n, i) => `KW ${kalenderwoche(plusTage(montag, 7 * i))}: ${mehrzahl(n, eins, viele)}`);

// ---------------------------------------------------------------------------------------------------------------------
export function Geschaeftsfuehrung({ d, jetzt }: { d: Awaited<ReturnType<typeof ladeGeschaeftsfuehrung>>; jetzt: string }) {
  const montag = montagVon(d.heute);
  const n = d.montagen.naechste;
  const naechsteText = !n ? "Keine Montage geplant" : n.beginn <= jetzt ? `Läuft: ${n.bezug?.kunde ?? ""}` : `Nächste ${relTag(n.beginn, d.heute)} ${n.beginn.slice(11, 16)}`;
  const herkunftTop = d.herkunft.liste.slice(0, 4);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-4 max-[1280px]:grid-cols-2 max-[640px]:grid-cols-1">
        <KpiCard
          href="/anfragen"
          label="Offene Anfragen"
          value={String(d.anfragen.offen)}
          note={<><span className="font-medium text-tone-green-fg">↗ {d.anfragen.neuDieseWoche}</span> neu diese Woche</>}
          spark={d.anfragen.jeWoche}
          sparkTitel={wochenTitel(plusTage(montag, -35), d.anfragen.jeWoche, "neue Anfrage", "neue Anfragen")}
        />
        <Platzhalter titel="Auftragsbestand, noch nicht berechnet" text={`${mehrzahl(d.auftraegeOffen, "offener Auftrag", "offene Aufträge")} · Wert folgt mit dem Beleg-Modul`} />
        <Platzhalter titel="Offene Forderungen" />
        <KpiCard href="/montageplan" label="Montagen nächste 14 Tage" value={String(d.montagen.in14)} note={naechsteText} spark={d.montagen.jeWoche} sparkAktuell={0} sparkTitel={wochenTitel(montag, d.montagen.jeWoche, "Montage", "Montagen")} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 max-[1280px]:grid-cols-2 max-[640px]:grid-cols-1">
        <DashKarte titel="Angenommene Angebote">
          <p className="mt-2 text-sm text-muted">Quote aus angenommenen und abgelehnten Angeboten.</p>
          <p className="mt-auto pt-4 text-[12.5px] text-muted-2" data-platzhalter>Folgt mit dem Beleg-Modul</p>
        </DashKarte>
        <DashKarte titel="Anfragen online" mehr={{ href: "/anfragen", text: "Anfragen" }}>
          <div className="mb-3 text-4xl font-bold tracking-[-0.02em] tabular" data-online-anteil>
            {d.herkunft.onlineProzent}
            <small className="ml-0.5 text-xl font-semibold text-muted">%</small>
          </div>
          <BalkenListe
            einheit=""
            leer="Noch keine Anfragen mit Herkunft."
            zeilen={herkunftTop.map((h) => ({ name: h.name, titel: h.name, n: h.n, zusatz: `${Math.round(h.anteil * 100)} %` }))}
          />
          <p className="mt-3 text-xs text-muted-2">Online zählt: {d.herkunft.online.join(", ")} · {mehrzahl(d.herkunft.gesamt, "Anfrage", "Anfragen")} gesamt</p>
        </DashKarte>
        <DashKarte titel="Auftragswert je Monat" className="max-[1280px]:col-span-2 max-[640px]:col-span-1">
          <p className="mt-2 text-sm text-muted">Beauftragt laut Auftragsbestätigung, je Monat der letzten 12 Monate.</p>
          <p className="mt-auto pt-4 text-[12.5px] text-muted-2" data-platzhalter>Folgt mit dem Beleg-Modul</p>
        </DashKarte>
      </div>

      <div className="flex flex-wrap gap-4">
        <RingKarte
          dunkel
          href="/abwesenheiten"
          titel="Abwesenheiten"
          text={`${d.abwesenheiten.zurGenehmigung ? `${mehrzahl(d.abwesenheiten.zurGenehmigung, "Antrag wartet", "Anträge warten")} auf Genehmigung` : "Keine offenen Anträge"} · heute ${d.abwesenheiten.anwesendProzent} % des Teams da`}
          ring={<Ring dunkel prozent={d.abwesenheiten.anwesendProzent} zahl={d.abwesenheiten.zurGenehmigung} titel={`${d.abwesenheiten.zurGenehmigung} zur Genehmigung, ${d.abwesenheiten.anwesendProzent} % anwesend`} />}
        />
        <RingKarte
          href="/montageplan"
          titel="Einsätze heute"
          text={`${d.einsaetzeHeute.n ? `Team ${d.einsaetzeHeute.team.join(", ") || "–"}` : "Heute kein Einsatz geplant"} · nächste 14 Tage zu ${d.einsaetzeHeute.freigegebenProzent} % freigegeben`}
          ring={<Ring prozent={d.einsaetzeHeute.freigegebenProzent} zahl={d.einsaetzeHeute.n} titel={`${d.einsaetzeHeute.n} Einsätze heute, ${d.einsaetzeHeute.freigegebenProzent} % der nächsten 14 Tage freigegeben`} />}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DashKarte titel={`Heute, ${Number(d.heute.slice(8, 10))}. ${["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"][Number(d.heute.slice(5, 7)) - 1]}`} mehr={{ href: "/kalender?ansicht=tag", text: "Kalender" }}>
          <Zeitachse eintraege={d.termine} jetzt={jetzt} leer="Heute keine Termine." />
        </DashKarte>
        <div className="flex min-w-0 flex-col gap-4">
          <DashKarte titel="Braucht Aufmerksamkeit">
            <div data-aufmerksamkeit>
              {d.hinweise.length ? d.hinweise.map((h) => <HinweisZeile key={h.titel} {...h} />) : <p className="py-2 text-sm text-muted">Alles erledigt.</p>}
            </div>
          </DashKarte>
          <DashKarte titel="Aufträge je Status" mehr={{ href: "/auftraege", text: "Pipeline" }}>
            <div data-phasen>
              <BalkenListe
                zeilen={d.phasen.map((p) => ({
                  name: <Badge tone={AUFTRAG_PHASE_TON[p.phase]} dot>{AUFTRAG_PHASE_TEXT[p.phase]}</Badge>,
                  titel: AUFTRAG_PHASE_TEXT[p.phase],
                  n: p.n,
                  href: `/auftraege?phase=${p.phase}`,
                }))}
              />
            </div>
            <p className="mt-3 text-xs text-muted-2">Auftragswert je Status folgt mit dem Beleg-Modul.</p>
          </DashKarte>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function Montage({ d, jetzt }: { d: Awaited<ReturnType<typeof ladeMontage>>; jetzt: string }) {
  const montag = montagVon(d.heute);
  const vp = [...d.vorgeplant].sort((a, b) => a.beginn.localeCompare(b.beginn));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-4 max-[1280px]:grid-cols-2 max-[640px]:grid-cols-1">
        <KpiCard href="/montageplan" label="Einsätze diese Woche" value={String(d.woche.n)} note={`${d.woche.freigegeben} freigegeben · ${d.woche.vorgeplant} vorgeplant`} />
        <KpiCard href="/montageplan" label="Vorgeplant, nicht freigegeben" value={String(vp.length)} note={vp.length ? `nächster ${relTag(vp[0].beginn, d.heute)}` : "alles freigegeben"} />
        <KpiCard
          href={d.konflikte.length ? `/montageplan?woche=${montagVon(d.konflikte[0].beginn.slice(0, 10))}` : "/montageplan"}
          label="Konflikte"
          value={String(d.konflikte.length)}
          note={d.konflikte.length ? d.konflikte.map((e) => e.bezug?.nummer ?? "Einsatz").slice(0, 4).join(", ") : "keine"}
          warnung={d.konflikte.length > 0}
        />
        <KpiCard href="/montageplan" label="Ungeplant" value={String(d.ungeplant.auftraege + d.ungeplant.tickets)} note={`${mehrzahl(d.ungeplant.auftraege, "Auftrag", "Aufträge")} · ${mehrzahl(d.ungeplant.tickets, "Ticket", "Tickets")}`} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DashKarte titel="Heute" mehr={{ href: "/montageplan", text: "Plantafel" }}>
          <Zeitachse eintraege={d.termine} jetzt={jetzt} leer="Heute keine Einsätze." />
          <h3 className="mt-4 mb-1 text-[15px] font-semibold">Als Nächstes</h3>
          {d.alsNaechstes.length ? (
            <ul className="flex flex-col" data-als-naechstes>
              {d.alsNaechstes.map((e) => (
                <li key={e.id}>
                  <Link href={e.bezug ? (e.bezug.art === "auftrag" ? `/auftraege/${e.bezug.id}` : `/service/${e.bezug.id}`) : "/montageplan"} className="flex items-center gap-3 rounded-md px-1.5 py-2 text-sm hover:bg-surface-sunken">
                    <span className="w-[136px] shrink-0 font-mono text-[13px] whitespace-nowrap">{relTag(e.beginn, d.heute)} {e.beginn.slice(11, 16)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {e.bezug?.kunde || "Einsatz"} <span className="text-muted-2">· {e.bezug?.nummer} · {e.bezug?.titel}</span>
                    </span>
                    {!e.fest && <Badge tone="amber">vorgeplant</Badge>}
                    <span className="shrink-0 text-xs text-muted-2">{e.monteure.map((m) => (d.namen[m] ?? "").split(" ")[0]).join(", ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nichts geplant.</p>
          )}
        </DashKarte>
        <div className="flex min-w-0 flex-col gap-4">
          {vp.length > 0 && (
            <DashKarte titel="Zur Freigabe" mehr={{ href: `/montageplan?woche=${montagVon(vp[0].beginn.slice(0, 10))}`, text: "Freigeben" }}>
              <ul data-zur-freigabe>
                {vp.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 border-t border-line-soft py-2 text-sm first:border-t-0">
                    <span className="w-[90px] shrink-0 font-mono text-[13px]">{relTag(e.beginn, d.heute)}</span>
                    <span className="min-w-0 flex-1 truncate">{e.bezug?.nummer} · {e.bezug?.kunde}</span>
                    {d.konflikte.some((k) => k.id === e.id) && <Badge tone="red">Konflikt</Badge>}
                  </li>
                ))}
              </ul>
            </DashKarte>
          )}
          <DashKarte titel="Abwesend · nächste 2 Wochen" mehr={{ href: `/kalender?ansicht=woche&datum=${montag}`, text: "Kalender" }}>
            {d.abwesenheiten.length ? (
              <ul>
                {d.abwesenheiten.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 border-t border-line-soft py-2 text-sm first:border-t-0">
                    <span>{a.name.split(" ")[0]} · {ABWESENHEIT_TEXT[a.art] ?? a.art}</span>
                    <span className="text-xs text-muted-2">{kurz(a.von)}{a.bis !== a.von ? `–${kurz(a.bis)}` : ""}{a.status === "beantragt" ? " · beantragt" : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Alle da.</p>
            )}
          </DashKarte>
          <DashKarte titel="Ware für anstehende Montagen" mehr={{ href: "/bestellungen", text: "Einkauf" }}>
            {d.ware.length ? (
              <ul data-ware>
                {d.ware.map((w) => (
                  <li key={w.auftragId}>
                    <Link href={`/auftraege/${w.auftragId}`} className="flex items-center gap-3 rounded-md px-1.5 py-2 text-sm hover:bg-surface-sunken">
                      <span className="w-[90px] shrink-0 font-mono text-[13px]">{relTag(w.beginn, d.heute)}</span>
                      <span className="min-w-0 flex-1">
                        {w.nummer} · {w.kunde}
                        <span className="block text-xs text-muted-2">{w.lieferKw ? `Lieferung ${w.lieferKw}` : "keine Liefer-KW"}</span>
                      </span>
                      <Badge tone={AUFTRAG_BESTELL_TON[w.status]} dot>{AUFTRAG_BESTELL_TEXT[w.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Für alle Montagen der nächsten 3 Wochen ist die Ware da.</p>
            )}
          </DashKarte>
          <DashKarte titel="Fahrzeuge" mehr={{ href: "/fahrzeuge", text: "Fahrzeugpool" }}>
            {d.fahrzeuge.length ? (
              <ul>
                {d.fahrzeuge.map((f) => (
                  <li key={f.id + f.pruefung} className="flex items-center justify-between gap-2 border-t border-line-soft py-2 text-sm first:border-t-0">
                    <Link href={`/fahrzeuge/${f.id}`} className="hover:underline">{f.kennzeichen} · {f.pruefung}</Link>
                    <Badge tone={f.tage < 0 ? "red" : "amber"}>{f.tage < 0 ? "überfällig" : f.tage === 0 ? "heute" : `in ${f.tage} ${f.tage === 1 ? "Tag" : "Tagen"}`}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Keine Prüftermine in den nächsten 30 Tagen.</p>
            )}
          </DashKarte>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
export function Einkauf({ d }: { d: Awaited<ReturnType<typeof ladeEinkauf>> }) {
  const knopf = "inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium hover:border-line-strong";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-4 max-[1280px]:grid-cols-2 max-[640px]:grid-cols-1">
        <KpiCard href="/bestellungen" label="Offene Bestellungen" value={String(d.offen.length)} note={mehrzahl(d.offenePositionen, "offene Position", "offene Positionen")} />
        <KpiCard href="/bestellungen" label="Lieferung diese Woche" value={String(d.dieseWoche)} note={`KW ${d.kw}`} />
        <KpiCard href="/bestellungen" label="Liefertermin überschritten" value={String(d.ueberfaellig.length)} note={d.ueberfaellig.map((b) => b.nummer).slice(0, 3).join(", ") || "keine"} warnung={d.ueberfaellig.length > 0} />
        <KpiCard href="/bestellungen" label="Noch nicht bestellt" value={String(d.fehlt.length)} note={d.fehlt.length ? d.fehlt.map((a) => a.nummer).slice(0, 3).join(", ") : "alles bestellt"} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DashKarte titel="Erwartete Lieferungen" mehr={{ href: "/bestellungen", text: "Alle" }}>
          {d.offen.length ? (
            <Table className="min-w-[560px]">
              <thead>
                <tr>
                  <Th>KW</Th>
                  <Th>Bestellung</Th>
                  <Th>Lieferant</Th>
                  <Th>Aufträge</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {d.offen.map((b) => {
                  const auftraege = [...new Set(b.zeilen.filter((z) => !z.geliefert).map((z) => z.auftrag?.nummer).filter(Boolean))];
                  const jetzt = b.liefer_kw === d.kw && b.liefer_jahr === d.jahr;
                  return (
                    <tr key={b.id} data-erwartet={b.id}>
                      <Td className={jetzt ? "font-mono font-bold" : "font-mono"}>{b.liefer_kw ?? "–"}</Td>
                      <Td><Link href={`/bestellungen/${b.id}`} className="font-mono hover:underline">{b.nummer}</Link></Td>
                      <Td>{b.lieferant?.name ?? "–"}</Td>
                      <Td className="text-sm">{auftraege.join(", ")}{auftraege.length > 1 && <Badge tone="gray" className="ml-1.5">Sammel</Badge>}</Td>
                      <Td><Badge tone={BESTELL_STATUS_TON[b.abgeleitet]} dot>{BESTELL_STATUS_TEXT[b.abgeleitet]}</Badge></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted">Keine offenen Bestellungen.</p>
          )}
          <h3 className="mt-4 mb-1 text-[15px] font-semibold">Noch nicht bestellt</h3>
          {d.fehlt.length ? (
            <ul>
              {d.fehlt.map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-t border-line-soft py-2.5 text-sm first:border-t-0">
                  <Link href={`/auftraege/${a.id}`} className="w-[92px] shrink-0 font-mono text-[13px] font-medium hover:underline">{a.nummer}</Link>
                  <span className="min-w-0 flex-1">
                    {a.kunde?.name ?? "–"}
                    <span className="block text-xs whitespace-pre-line text-muted-2">{a.noch_nicht_bestellt}</span>
                  </span>
                  <NeueBestellung auftragId={a.id} ausloeser={<button type="button" className={knopf}><ShoppingCart className="size-3.5" />Bestellen</button>} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Alles bestellt.</p>
          )}
        </DashKarte>
        <div className="flex min-w-0 flex-col gap-4">
          {d.ohneAb.length > 0 && (
            <DashKarte titel="AB vom Lieferanten fehlt">
              <ul data-ohne-ab>
                {d.ohneAb.map((b) => (
                  <li key={b.id}>
                    <Link href={`/bestellungen/${b.id}`} className="flex items-center gap-3 rounded-md px-1.5 py-2 text-sm hover:bg-surface-sunken">
                      <StatusDot tone="amber" />
                      <span className="w-[96px] shrink-0 font-mono text-[13px]">{b.nummer}</span>
                      <span className="min-w-0 flex-1">{b.lieferant?.name}<span className="block text-xs text-muted-2">bestellt {relTag(b.bestelldatum, d.heute) === "heute" ? "heute" : `am ${kurz(b.bestelldatum)}`}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </DashKarte>
          )}
          <DashKarte titel="Lieferanten" mehr={{ href: "/lieferanten", text: "Alle" }}>
            {d.lieferanten.length ? (
              <ul>
                {d.lieferanten.map((l) => {
                  const k = l.kontakte.find((x) => x.handy) ?? l.kontakte[0];
                  const nr = k?.handy || k?.telefon || l.telefon;
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 border-t border-line-soft py-2.5 first:border-t-0">
                      <Link href={`/lieferanten/${l.id}`} className="min-w-0 hover:underline">
                        <b className="font-medium">{l.name}</b>
                        {k && <span className="block text-xs text-muted-2">{k.name}{k.funktion ? ` · ${k.funktion}` : ""}</span>}
                      </Link>
                      <span className="flex shrink-0 gap-1.5">
                        {nr && <a href={`tel:${nr.replace(/\s/g, "")}`} className={knopf} aria-label={`${k?.name ?? l.name} anrufen`}>Anrufen</a>}
                        {l.konfigurator_url && <a href={l.konfigurator_url} target="_blank" rel="noopener noreferrer" className={knopf}>Konfigurator</a>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Noch keine Lieferanten.</p>
            )}
          </DashKarte>
        </div>
      </div>
    </div>
  );
}
