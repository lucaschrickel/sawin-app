import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, ExternalLink, Pencil, Plus, Printer } from "lucide-react";
import { ListenSuche } from "@/components/app/listen-suche";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { belegeMitAppBuchung, heuteBerlin, istKopfbeleg, ladeBeleg, ladeBelegListe, ladeBelegTags, zaehleBelegarten, type BelegZeile } from "@/lib/belege";
import { anzeigeStatus, BELEGART_LISTE, BELEGART_TEXT, BELEGARTEN, bearbeitbar, type Belegart } from "@/lib/belege-status";
import { eur } from "@/lib/format";
import { zahlungenImHintergrund } from "@/lib/lexware/zahlungen";
import { tag, zeitpunkt } from "@/lib/zeit";
import { PdfKachel, TagsKommentar, VerwerfenKnopf } from "../beleg/ui";
import { BelegTabelle, Filterleiste, NeuMenue } from "./ui";

/*
  Belegübersichten (CLAUDE.md „Belegübersichten“): Schnellfilter nach Belegart mit Anzahl (nur „Alle Belege“),
  Statusfilter je Belegart, Tag-Filter, Suche. Liste links, rechts die Vorschau-Leiste wie in Lexware.
  Klick wählt, Doppelklick öffnet. Keine Kennzahlen-Kacheln.
*/

export type ListenDef = { key: string; titel: string; arten: Belegart[]; aktiv: string; status: [string, string][] };

const ANGEBOT_STATUS: [string, string][] = [["", "Alle"], ["entwurf", "Entwürfe"], ["offen", "Offen"], ["abgelaufen", "Abgelaufen"], ["angenommen", "Angenommen"], ["abgelehnt", "Abgelehnt"]];
const APP_STATUS: [string, string][] = [["", "Alle"], ["entwurf", "Entwürfe"], ["fertig", "Fertiggestellt"]];
const RECHNUNG_STATUS: [string, string][] = [["", "Alle"], ["entwurf", "Entwürfe"], ["offen", "Offen"], ["ueberfaellig", "Überfällig"], ["bezahlt", "Bezahlt"]];

export const LISTEN: Record<string, ListenDef> = {
  alle: { key: "alle", titel: "Alle Belege", arten: [...BELEGARTEN], aktiv: "belege", status: APP_STATUS },
  angebote: { key: "angebote", titel: "Angebote", arten: ["angebot"], aktiv: "angebote", status: ANGEBOT_STATUS },
  lieferscheine: { key: "lieferscheine", titel: "Lieferscheine", arten: ["lieferschein"], aktiv: "lieferscheine", status: APP_STATUS },
  abschlaege: { key: "abschlaege", titel: "Abschlagsrechnungen", arten: ["abschlagsrechnung"], aktiv: "abschlaege", status: RECHNUNG_STATUS },
  rechnungen: { key: "rechnungen", titel: "Rechnungen", arten: ["rechnung", "zahlungsbestaetigung"], aktiv: "rechnungen", status: RECHNUNG_STATUS },
  gutschriften: { key: "gutschriften", titel: "Gutschriften", arten: ["gutschrift"], aktiv: "gutschriften", status: RECHNUNG_STATUS },
  // Ohne eigenen Menüpunkt: Ziel der Verweise aus Dashboard und Glocke
  forderungen: { key: "forderungen", titel: "Offene Forderungen", arten: ["rechnung", "abschlagsrechnung"], aktiv: "rechnungen", status: [["", "Alle"], ["offen", "Offen"], ["ueberfaellig", "Überfällig"]] },
};

const UNTERTITEL: Record<string, string> = {
  lieferscheine: "Lieferscheine entstehen am Auftrag aus der Auftragsbestätigung.",
  abschlaege: "Abschläge entstehen am Auftrag (Prozent oder Betrag) und werden in Lexware als Rechnung angelegt.",
  rechnungen: "Rechnungen entstehen am Auftrag oder Service-Ticket und werden in Lexware angelegt.",
  gutschriften: "Gutschriften entstehen aus einer Rechnung oder einem Abschlag und werden in Lexware angelegt.",
  forderungen: "Rechnungen und Abschläge mit offenem Betrag.",
};

const eins = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function BelegListe({ liste, searchParams }: { liste: string; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const def = LISTEN[liste];
  if (!def) notFound();
  const sp = await searchParams;
  const artFilter = def.key === "alle" && (BELEGARTEN as readonly string[]).includes(eins(sp.art)) ? (eins(sp.art) as Belegart) : null;
  const status = eins(sp.status);
  const tagFilter = eins(sp.tag);
  const q = eins(sp.q).trim().toLowerCase();
  const [alle, anzahl, tagVorschlaege] = await Promise.all([ladeBelegListe(artFilter ? [artFilter] : def.arten), def.key === "alle" ? zaehleBelegarten() : Promise.resolve({} as Record<string, number>), ladeBelegTags()]);
  // Datum erst nach dem Laden der Daten (Sitzung): mit Cache Components darf die Zeit nicht vorher gelesen werden
  const heute = heuteBerlin();
  // Rechnungen und Abschläge: Zahlungsstand aus Lexware im Hintergrund, App-Buchungen „in Lexware noch buchen“
  const mitRechnungen = def.arten.some((a) => a === "rechnung" || a === "abschlagsrechnung");
  if (mitRechnungen) await zahlungenImHintergrund();
  const lexBuchen = mitRechnungen ? await belegeMitAppBuchung() : new Set<string>();
  const ketten = new Map<string, BelegZeile[]>();
  for (const b of alle) ketten.set(b.kette_id, [...(ketten.get(b.kette_id) ?? []), b]);
  const mitStatus = alle.map((b) => ({ b, s: anzeigeStatus(b, ketten.get(b.kette_id) ?? [b], heute) }));
  const zeilen = mitStatus.filter(({ b, s }) => {
    if (def.key === "forderungen" && (b.status === "entwurf" || b.status === "bezahlt" || b.status === "storniert" || (b.offen_betrag ?? b.summe_brutto) <= 0)) return false;
    if (status === "entwurf" && b.status !== "entwurf") return false;
    if (status === "fertig" && b.status === "entwurf") return false;
    if (["offen", "abgelaufen", "angenommen", "abgelehnt", "ueberfaellig", "bezahlt"].includes(status) && s.key !== status) return false;
    if (tagFilter && !(b.tags ?? []).includes(tagFilter)) return false;
    if (q) {
      const text = [b.nummer, b.kunde?.name, b.adresse_name, b.titel, b.auftrag?.nummer, b.anfrage?.titel, (b.tags ?? []).join(" "), b.kommentar_intern].join(" ").toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
  const gewaehlt = eins(sp.id) && zeilen.some((z) => z.b.id === eins(sp.id)) ? eins(sp.id) : (zeilen[0]?.b.id ?? "");
  const detail = gewaehlt ? await ladeBeleg(gewaehlt) : null;
  const tags = [...new Set(mitStatus.flatMap(({ b }) => b.tags ?? []))].sort((a, b) => a.localeCompare(b, "de"));
  const mehrereArten = !artFilter && def.arten.length > 1;

  return (
    <Shell active={def.aktiv} crumbs={[{ label: "Belege" }, { label: def.titel }]}>
      <PageHeader
        title={def.titel}
        sub={UNTERTITEL[def.key] ?? "Klick zeigt die Vorschau rechts, Doppelklick öffnet den Beleg."}
        actions={def.key === "alle" ? <NeuMenue /> : def.key === "angebote" ? <NeuKnopf art="angebot" /> : null}
      />
      <Filterleiste
        arten={def.key === "alle" ? BELEGARTEN.filter((a) => anzahl[a]).map((a) => ({ wert: a, text: BELEGART_LISTE[a], anzahl: anzahl[a] ?? 0 })) : []}
        art={artFilter ?? ""}
        gesamt={Object.values(anzahl).reduce((x, y) => x + y, 0)}
        status={def.status}
        statusWert={status}
        tags={tags}
        tagWert={tagFilter}
        suche={<ListenSuche wert={eins(sp.q)} label="Belege filtern" platzhalter="Nummer, Kunde filtern…" />}
      />

      <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <BelegTabelle
          gewaehlt={gewaehlt}
          mehrereArten={mehrereArten}
          zeilen={zeilen.map(({ b, s }) => ({
            id: b.id,
            nummer: b.nummer,
            art: BELEGART_LISTE[b.art],
            datum: tag(b.datum),
            kunde: b.kunde?.name ?? b.adresse_name ?? "–",
            titel: [b.titel && b.titel !== BELEGART_TEXT[b.art] ? b.titel : "", lexBuchen.has(b.id) ? "in Lexware noch buchen" : ""].filter(Boolean).join(" · "),
            betrag: b.art === "lieferschein" ? "–" : def.key === "forderungen" ? eur(b.offen_betrag ?? b.summe_brutto) : eur(b.summe_brutto),
            status: s,
          }))}
          leer={q || status || tagFilter || artFilter ? "Keine Belege für diese Auswahl." : "Noch keine Belege."}
        />
        {detail && <VorschauLeiste detail={detail} vorschlaege={tagVorschlaege} />}
      </div>
    </Shell>
  );
}

function NeuKnopf({ art }: { art: Belegart }) {
  return (
    <Link href={`/beleg/neu?art=${art}`} className="inline-flex h-[42px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-surface hover:opacity-90" data-neu={art}>
      <Plus className="size-4" strokeWidth={2.2} />
      {art === "angebot" ? "Neues Angebot" : `Neue ${BELEGART_TEXT[art]}`}
    </Link>
  );
}

const icon = "inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-ink";

/** Vorschau-Leiste: Symbole, verkleinertes PDF, Belegdaten, Zugehörige Belege, Tags und Kommentar */
export async function VorschauLeiste({ detail: d, vorschlaege }: { detail: NonNullable<Awaited<ReturnType<typeof ladeBeleg>>>; vorschlaege: string[] }) {
  const b = d.beleg;
  const heute = heuteBerlin();
  const status = anzeigeStatus(b, d.kette, heute);
  const andere = d.kette.filter((x) => x.id !== b.id);
  const aenderbar = b.status !== "entwurf" && bearbeitbar(b, d.kette, istKopfbeleg(d));
  return (
    <aside className="flex flex-col gap-3 rounded-lg border border-line-soft bg-surface p-4 min-[1100px]:sticky min-[1100px]:top-[84px] min-[1100px]:max-h-[calc(100vh-100px)] min-[1100px]:overflow-y-auto" aria-label="Vorschau" data-vorschau={b.id}>
      <div className="flex items-center gap-1 border-b border-line-soft pb-2">
        {b.status === "entwurf" || aenderbar ? (
          <Link href={b.status === "entwurf" ? `/beleg/${b.id}` : `/beleg/${b.id}/bearbeiten`} className={icon} aria-label="Bearbeiten" title="Bearbeiten">
            <Pencil className="size-4" />
          </Link>
        ) : null}
        <a href={`/pdf/beleg/${b.id}`} target="_blank" rel="noopener" className={icon} aria-label="Vorschau und Drucken" title="Vorschau und Drucken">
          <Printer className="size-4" />
        </a>
        {!["abschlagsrechnung", "zahlungsbestaetigung", "rechnung", "gutschrift"].includes(b.art) && (
          <Link href={`/beleg/neu?art=${b.art}&kopie=${b.id}`} className={icon} aria-label="Duplizieren" title="Duplizieren">
            <Copy className="size-4" />
          </Link>
        )}
        {b.status === "entwurf" && <VerwerfenKnopf id={b.id} nummer={b.nummer} art={b.art} kompakt />}
        <Link href={`/beleg/${b.id}`} className={`${icon} ml-auto`} aria-label="Beleg öffnen" title="Beleg öffnen" data-oeffnen>
          <ExternalLink className="size-4" />
        </Link>
      </div>
      <PdfKachel
        src={`/pdf/beleg/${b.id}`}
        titel={`${BELEGART_TEXT[b.art]} ${b.nummer ?? "Entwurf"}`}
        bearbeiten={b.status === "entwurf" ? `/beleg/${b.id}` : aenderbar ? `/beleg/${b.id}/bearbeiten` : null}
      />
      <p className="text-xs text-muted-2">{b.status === "entwurf" ? `Entwurf, zuletzt geändert ${zeitpunkt(b.updated_at)}` : `erstellt am ${tag(b.fertiggestellt_am ?? b.datum)}`}</p>
      <div className="text-[11px] font-semibold tracking-[0.08em] text-muted-2 uppercase">{BELEGART_TEXT[b.art]}</div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted">Belegnummer</dt>
        <dd className="font-mono text-[13px]">{b.nummer ?? "–"}</dd>
        <dt className="text-muted">Belegdatum</dt>
        <dd>{tag(b.datum)}</dd>
        <dt className="text-muted">Kontakt</dt>
        <dd>{b.kunde ? <Link href={`/kunden/${b.kunde.id}`} className="text-accent-text hover:underline">{b.kunde.name}</Link> : (b.adresse_name ?? "–")}</dd>
        {b.gueltig_bis && (
          <>
            <dt className="text-muted">Gültig bis</dt>
            <dd className={status.key === "abgelaufen" ? "text-tone-red-fg" : undefined}>{tag(b.gueltig_bis)}</dd>
          </>
        )}
        {b.art === "lieferschein" && b.liefertermin && (
          <>
            <dt className="text-muted">Lieferdatum</dt>
            <dd>{tag(b.liefertermin)}</dd>
          </>
        )}
        {b.faellig_am && b.status !== "entwurf" && b.art !== "gutschrift" && (
          <>
            <dt className="text-muted">Fällig</dt>
            <dd className={status.key === "ueberfaellig" ? "text-tone-red-fg" : undefined}>{tag(b.faellig_am)}</dd>
          </>
        )}
        {b.art !== "lieferschein" && (
          <>
            <dt className="text-muted">Betrag</dt>
            <dd className="tabular font-medium">{eur(b.summe_brutto)}</dd>
          </>
        )}
        <dt className="text-muted">Bezug</dt>
        <dd>
          {b.auftrag ? (
            <Link href={`/auftraege/${b.auftrag.id}`} className="text-accent-text hover:underline">Auftrag {b.auftrag.nummer}</Link>
          ) : b.ticket ? (
            <Link href={`/service/${b.ticket.id}`} className="text-accent-text hover:underline">Ticket {b.ticket.nummer}</Link>
          ) : b.anfrage ? (
            <Link href={`/anfragen/${b.anfrage.id}`} className="text-accent-text hover:underline">Anfrage {b.anfrage.nummer}</Link>
          ) : (
            "–"
          )}
        </dd>
        <dt className="text-muted">Status</dt>
        <dd><Badge tone={status.ton}>{status.text}</Badge></dd>
      </dl>
      {andere.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-2 uppercase">Zugehörige Belege</div>
          <ul className="flex flex-col text-sm" data-zugehoerig>
            {andere.map((x) => (
              <li key={x.id} className="flex justify-between gap-2 border-t border-line-soft py-1.5 first:border-t-0">
                <Link href={`/beleg/${x.id}`} className="hover:underline">{BELEGART_TEXT[x.art]}</Link>
                <span className="text-xs text-muted-2">vom {tag(x.datum)} · <span className="font-mono">{x.nummer ?? "Entwurf"}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <TagsKommentar key={b.id} id={b.id} tags={b.tags ?? []} kommentar={b.kommentar_intern ?? ""} vorschlaege={vorschlaege} />
    </aside>
  );
}
