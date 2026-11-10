import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Karte } from "@/components/app/info-karte";
import { ListenAuswahl } from "@/components/app/listen-suche";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { ladeAbwesenheiten } from "@/lib/abwesenheiten";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ABWESENHEIT_STATUS_TEXT, ABWESENHEIT_STATUS_TON, ABWESENHEIT_TEXT, ABWESENHEIT_TON, arbeitstageText, arbeitstageZwischen } from "@/lib/team";
import { heuteBerlin, tag } from "@/lib/zeit";
import { AbwesenheitDialog, AbwesenheitLoeschen, Entscheiden } from "./ui";

export const metadata: Metadata = { title: "Abwesenheiten" };

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zeitraum = (von: string, bis: string) => (von === bis ? tag(von) : `${tag(von)} – ${tag(bis)}`);

export default async function AbwesenheitenPage({ searchParams }: PageProps<"/abwesenheiten">) {
  const sp = await searchParams;
  const heute = heuteBerlin();
  const jahr = /^\d{4}$/.test(eins(sp.jahr)) ? Number(eins(sp.jahr)) : Number(heute.slice(0, 4));
  const mitarbeiter = UUID.test(eins(sp.mitarbeiter)) ? eins(sp.mitarbeiter) : "";
  const [{ benutzer: ich }, d] = await Promise.all([pruefeSitzung(), ladeAbwesenheiten(jahr, mitarbeiter)]);
  const href = (aenderung: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ jahr: String(jahr) === heute.slice(0, 4) ? "" : String(jahr), mitarbeiter, ...aenderung })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/abwesenheiten?${qs}` : "/abwesenheiten";
  };
  const knopf = "inline-flex h-9 items-center justify-center rounded-full border border-line bg-surface px-3 text-sm hover:border-line-strong";
  const darfLoeschen = (a: { status: string; art: string }) => ich.admin || a.status === "beantragt" || a.art === "krank";

  return (
    <Shell active="abwesenheiten" crumbs={[{ label: "Team und Ressourcen" }, { label: "Abwesenheiten" }]}>
      <PageHeader
        title="Abwesenheiten"
        sub="Urlaub, Krankheit und Schulungen · das Büro trägt ein, ein Admin genehmigt · sichtbar in der Plantafel"
        actions={<AbwesenheitDialog mitarbeiter={d.mitarbeiter} admin={ich.admin} heute={heute} />}
      />

      <div className="flex flex-col gap-4">
        {d.offene.length > 0 && (
          <Karte titel="Zur Genehmigung" rechts={<span className="text-sm text-muted-2 tabular">{d.offene.length}</span>}>
            <ul className="flex flex-col">
              {d.offene.map((a) => (
                <li key={a.id} data-antrag={a.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft py-3 first:border-t-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 min-w-10 place-items-center rounded-full bg-surface-sunken px-1.5 text-xs font-semibold">{a.mitarbeiter.kuerzel}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/mitarbeiter/${a.mitarbeiter.id}`} className="font-semibold hover:underline">{a.mitarbeiter.name}</Link>
                        <Badge tone={ABWESENHEIT_TON[a.art]}>{ABWESENHEIT_TEXT[a.art]}</Badge>
                      </div>
                      <div className="text-sm text-muted">
                        {zeitraum(a.von, a.bis)} · {arbeitstageText(arbeitstageZwischen(a.von, a.bis))}
                        {a.restDanach !== null && ` · Resturlaub danach ${a.restDanach} Tage`}
                        {a.notiz && ` · ${a.notiz}`}
                      </div>
                      {a.eingeplant.length > 0 && (
                        <div className="mt-1 flex items-center gap-1.5 text-sm text-tone-red-fg" data-eingeplant>
                          <AlertTriangle className="size-3.5" />
                          Eingeplant bei{" "}
                          {a.eingeplant.map((e, i) => (
                            <span key={e.id}>
                              {i > 0 && ", "}
                              {e.auftrag ? <Link href={`/auftraege/${e.auftrag.id}`} className="underline">{e.auftrag.nummer} {e.auftrag.kunde?.name}</Link> : "einem Einsatz"}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="flex items-center gap-2">
                    <Entscheiden id={a.id} admin={ich.admin} />
                    <AbwesenheitLoeschen id={a.id} text={`${ABWESENHEIT_TEXT[a.art]} ${a.mitarbeiter.name} ${zeitraum(a.von, a.bis)}`} />
                  </span>
                </li>
              ))}
            </ul>
          </Karte>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Karte
            titel={`Alle Abwesenheiten ${jahr}`}
            rechts={
              <span className="flex flex-wrap items-center gap-2">
                <ListenAuswahl name="mitarbeiter" wert={mitarbeiter} label="Mitarbeiter filtern" alle="Alle Mitarbeiter" optionen={d.mitarbeiter.map((m) => ({ wert: m.id, text: m.name }))} />
                <Link replace scroll={false} href={href({ jahr: String(jahr - 1) })} aria-label="Voriges Jahr" className={knopf}><ChevronLeft className="size-4" /></Link>
                <Link replace scroll={false} href={href({ jahr: String(jahr + 1) })} aria-label="Nächstes Jahr" className={knopf}><ChevronRight className="size-4" /></Link>
              </span>
            }
          >
            {d.liste.length ? (
              <Table className="min-w-[640px]">
                <thead>
                  <tr>
                    <Th>Mitarbeiter</Th>
                    <Th>Art</Th>
                    <Th>Zeitraum</Th>
                    <Th className="text-right">Tage</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {d.liste.map((a) => (
                    <tr key={a.id} data-abwesenheit-zeile={a.id}>
                      <Td className="whitespace-nowrap"><Link href={`/mitarbeiter/${a.mitarbeiter.id}`} className="hover:underline">{a.mitarbeiter.name}</Link></Td>
                      <Td><Badge tone={ABWESENHEIT_TON[a.art]}>{ABWESENHEIT_TEXT[a.art]}</Badge></Td>
                      <Td className="text-sm whitespace-nowrap">{zeitraum(a.von, a.bis)}</Td>
                      <Td className="text-right tabular">{arbeitstageZwischen(a.von, a.bis)}</Td>
                      <Td><Badge tone={ABWESENHEIT_STATUS_TON[a.status]}>{ABWESENHEIT_STATUS_TEXT[a.status]}</Badge></Td>
                      <Td className="text-right">{darfLoeschen(a) && <AbwesenheitLoeschen id={a.id} text={`${ABWESENHEIT_TEXT[a.art]} ${a.mitarbeiter.name} ${zeitraum(a.von, a.bis)}`} />}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted">Keine Abwesenheiten {mitarbeiter ? "für diese Auswahl " : ""}in {jahr}.</p>
            )}
          </Karte>

          <Karte titel={`Urlaubskonto ${jahr}`}>
            <ul className="flex flex-col">
              {d.konten.map(({ mitarbeiter: m, konto: k }) => {
                const g = k.anspruch ? Math.min(100, (k.genehmigt / k.anspruch) * 100) : 0;
                const b = k.anspruch ? Math.min(100 - g, (k.beantragt / k.anspruch) * 100) : 0;
                return (
                  <li key={m.id} data-konto={m.id} className="border-t border-line-soft py-2.5 first:border-t-0">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <Link href={`/mitarbeiter/${m.id}`} className="hover:underline">{m.name}</Link>
                      <span className="text-muted"><b className="font-semibold text-ink">{k.rest}</b> von {k.anspruch} übrig</span>
                    </div>
                    <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                      <i className="bg-accent" style={{ width: `${g}%` }} />
                      <i className="bg-accent-soft-2" style={{ width: `${b}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-muted-2">{k.genehmigt} genehmigt · {k.beantragt} beantragt</div>
                  </li>
                );
              })}
            </ul>
            {!d.konten.length && <p className="text-sm text-muted">Noch keine Mitarbeiter.</p>}
            <p className="mt-2 text-xs text-muted-2">Arbeitstage Montag bis Freitag; Standard-Anspruch {d.standard} Tage (Einstellungen › Montageplan).</p>
          </Karte>
        </div>
      </div>
    </Shell>
  );
}
