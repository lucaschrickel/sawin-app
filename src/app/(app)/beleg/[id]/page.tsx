import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, Download, ExternalLink, Pencil } from "lucide-react";
import { Angabe, Karte } from "@/components/app/info-karte";
import { Shell } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCustomer } from "@/customers";
import { STEUERART_TEXT } from "@/lib/beleg-typen";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { belegZuEingabe, heuteBerlin, istKopfbeleg, ladeAbrechnung, ladeArtikel, ladeBeleg, ladeBelegTags, ladeFirma, ladeKundeFuerBeleg, ladeTextvorlagen, ladeZahlungsbedingungen } from "@/lib/belege";
import { versandDateiname, versandVorlage } from "@/lib/versand";
import { anzeigeStatus, bearbeitbar, BELEGART_TEXT, belegSchritte, LEXWARE_BELEGARTEN } from "@/lib/belege-status";
import { eur } from "@/lib/format";
import { tag, zeitpunkt } from "@/lib/zeit";
import { BelegEditor } from "../editor";
import { zahlungenImHintergrund } from "@/lib/lexware/zahlungen";
import { ZAHLUNGSART_TEXT } from "@/lib/belege";
import { AKTIV, LISTE } from "../navigation";
import { ZahlungenKarte } from "../zahlungen";
import { AngebotZuruecksetzen, KettenLeiste, LexwarePdfKnopf, SchrittKnoepfe, TagsKommentar, UebergebenKnopf } from "../ui";
import { VersendenDialog } from "../versand";

export const metadata: Metadata = { title: "Beleg" };

/** Entwurf: Editor. Fertiggestellt: Belegseite mit Kette, PDF, „Nächster Schritt“, Aktionen, Daten, Versionen. */
export default async function BelegPage({ params }: PageProps<"/beleg/[id]">) {
  const { id } = await params;
  const d = await ladeBeleg(id);
  if (!d) notFound();
  const b = d.beleg;
  const liste = LISTE[b.art];
  const titel = `${BELEGART_TEXT[b.art]} ${b.nummer ?? "Entwurf"}`;
  const crumbs = [{ label: "Belege" }, { label: liste.text, href: liste.href }, { label: titel }];

  if (b.status === "entwurf") {
    const [zahlungsbedingungen, tags, kunde, abrechnung, artikel, vorlagen] = await Promise.all([
      ladeZahlungsbedingungen(),
      ladeBelegTags(),
      b.kunde_id ? ladeKundeFuerBeleg(b.kunde_id) : null,
      (b.art === "abschlagsrechnung" || b.art === "rechnung") && b.auftrag ? ladeAbrechnung(b.auftrag.id) : null,
      ladeArtikel(),
      ladeTextvorlagen(),
    ]);
    return (
      <Shell active={AKTIV[b.art]} crumbs={crumbs}>
        <BelegEditor
          key={`${b.id}-${b.updated_at}`}
          start={belegZuEingabe(d)}
          modus="entwurf"
          zahlungsbedingungen={zahlungsbedingungen}
          artikel={artikel}
          vorlagen={vorlagen}
          kundeStart={kunde}
          tagVorschlaege={tags}
          herkunftListe={getCustomer().herkunft}
          zurueck={b.auftrag ? { href: `/auftraege/${b.auftrag.id}`, text: "Auftrag" } : b.ticket ? { href: `/service/${b.ticket.id}`, text: "Service-Ticket" } : b.anfrage ? { href: `/anfragen/${b.anfrage.id}`, text: "Anfrage" } : liste}
          abrechnung={abrechnung}
          lexware={b.lexware_status ? { status: b.lexware_status, fehler: b.lexware_fehler } : null}
        />
      </Shell>
    );
  }

  const heute = heuteBerlin();
  const status = anzeigeStatus(b, d.kette, heute);
  const schritte = belegSchritte(b, d.kette, d.zahlungen);
  const aenderbar = bearbeitbar(b, d.kette, istKopfbeleg(d));
  const { supabase } = await pruefeSitzung();
  const [tags, firma, { data: kundeMail }, { data: kopie }] = await Promise.all([
    ladeBelegTags(),
    ladeFirma(),
    b.kunde ? supabase.from("kunde").select("email").eq("id", b.kunde.id).maybeSingle<{ email: string | null }>() : Promise.resolve({ data: null }),
    supabase.from("belegart_einstellung").select("bcc_email").eq("belegart", b.art).maybeSingle<{ bcc_email: string | null }>(),
  ]);
  const pdf = `/pdf/beleg/${b.id}`;
  // OneDrive-Ablage des PDFs (neueste Version)
  const { data: ablage } = await supabase.from("ablage_datei").select("status, web_url, unterordner, version, fehler").eq("beleg_id", b.id).order("version", { ascending: false }).limit(1).maybeSingle<{ status: string; web_url: string | null; unterordner: string | null; version: number; fehler: string | null }>();
  const ablageText = ablage ? (ablage.status === "abgelegt" ? `Im OneDrive-Ordner${ablage.unterordner ? ` unter „${ablage.unterordner}“` : ""} abgelegt (Version ${ablage.version}).` : `Wartet auf die Übertragung nach OneDrive${ablage.fehler ? `: ${ablage.fehler}` : "."}`) : "Noch nicht im OneDrive-Ordner.";
  const versionierbar = b.art === "angebot" || b.art === "auftragsbestaetigung";
  const abgelaufen = b.art === "angebot" && b.status === "offen" && b.gueltig_bis && b.gueltig_bis < heute;
  const lexArt = LEXWARE_BELEGARTEN.includes(b.art);
  const mitZahlungen = b.art === "rechnung" || b.art === "abschlagsrechnung";
  // Zahlungsstand aus Lexware im Hintergrund abgleichen (höchstens alle 5 Minuten)
  if (lexArt) await zahlungenImHintergrund();
  // Vorläufiger Versand: Rechnung, Abschlag, Gutschrift nur mit dem Original von Lexware
  const versandGesperrt = lexArt && !b.pdf_pfad ? "Das Original-PDF von Lexware liegt noch nicht vor." : null;
  const dateiname = versandDateiname({ nummer: b.nummer, version: b.version, artText: BELEGART_TEXT[b.art], kunde: b.kunde?.name ?? b.adresse_name });
  const rechnungZurZb = b.art === "zahlungsbestaetigung" ? d.kette.find((x) => x.id === b.vorgaenger_id) : undefined;
  const ueberfaellig = lexArt && b.art !== "gutschrift" && b.status === "offen" && (b.offen_betrag ?? 0) > 0 && !!b.faellig_am && b.faellig_am < heute;

  return (
    <Shell active={AKTIV[b.art]} crumbs={crumbs}>
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          {b.nummer && <span className="rounded-full bg-surface-sunken px-2.5 py-1 font-mono text-[13px]">{b.nummer}</span>}
          <h1 className="text-4xl font-bold tracking-[-0.02em]">{BELEGART_TEXT[b.art]}</h1>
          <Badge tone={ueberfaellig ? "red" : status.ton} data-status={ueberfaellig ? "ueberfaellig" : status.key}>{ueberfaellig ? "Überfällig" : status.text}</Badge>
          {b.version > 1 && <Badge tone="gray">Version {b.version}</Badge>}
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-[14.5px] text-muted">
          {b.kunde ? <Link href={`/kunden/${b.kunde.id}`} className="text-accent-text hover:underline">{b.kunde.name}</Link> : (b.adresse_name ?? "–")}
          {b.auftrag && (
            <>
              ·<Link href={`/auftraege/${b.auftrag.id}`} className="text-accent-text hover:underline" data-sprung="auftrag">Auftrag {b.auftrag.nummer}</Link>
            </>
          )}
          {b.anfrage && (
            <>
              ·<Link href={`/anfragen/${b.anfrage.id}`} className="text-accent-text hover:underline" data-sprung="anfrage">Anfrage {b.anfrage.nummer}</Link>
            </>
          )}
          {b.ticket && (
            <>
              ·<Link href={`/service/${b.ticket.id}`} className="text-accent-text hover:underline" data-sprung="ticket">Ticket {b.ticket.nummer}</Link>
            </>
          )}
          · <span>{tag(b.datum)}</span>
          {b.titel && b.titel !== BELEGART_TEXT[b.art] && <>· <span>{b.titel}</span></>}
        </p>
        <KettenLeiste kette={d.kette} aktuell={b.id} />
      </div>

      {schritte.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-tone-brand-bg px-4 py-3" data-naechster-schritt>
          <span className="text-sm font-semibold text-tone-brand-fg">Nächster Schritt</span>
          <SchrittKnoepfe schritte={schritte} belegId={b.id} />
        </div>
      )}

      <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-lg border border-line-soft bg-surface-sunken p-3">
          <iframe title={`PDF ${titel}`} src={`${pdf}#view=FitH`} className="aspect-[1/1.414] w-full rounded-md border border-line bg-surface" data-pdf-ansicht />
        </section>

        <aside className="flex flex-col gap-4" aria-label="Aktionen und Daten">
          <Karte titel="Aktionen">
            <div className="flex flex-col gap-2">
              {aenderbar && (
                <Button asChild variant="primary">
                  <Link href={`/beleg/${b.id}/bearbeiten`} data-aktion="bearbeiten">
                    <Pencil className="size-4" /> Bearbeiten
                  </Link>
                </Button>
              )}
              <Button asChild>
                <a href={pdf} target="_blank" rel="noopener">
                  <ExternalLink className="size-4" /> {lexArt ? "Lexware-PDF öffnen" : "Vorschau / Drucken"}
                </a>
              </Button>
              {versandGesperrt ? (
                <>
                  <Button disabled title={versandGesperrt} data-aktion="herunterladen">
                    <Download className="size-4" /> PDF herunterladen
                  </Button>
                  <Button disabled title={versandGesperrt} data-aktion="versenden">
                    Versenden
                  </Button>
                  <p className="text-xs text-muted-2">{versandGesperrt} Versendet wird nur das Lexware-PDF.</p>
                </>
              ) : (
                <>
                  <VersendenDialog
                    belegId={b.id}
                    pdf={pdf}
                    dateiname={dateiname}
                    version={versionierbar ? b.version : null}
                    vorlage={{
                      an: kundeMail?.email ?? "",
                      bcc: kopie?.bcc_email ?? "",
                      ...versandVorlage({ art: b.art, artText: BELEGART_TEXT[b.art], nummer: b.nummer, datum: b.datum, bauvorhaben: b.bauvorhaben, firma: firma.firma_name, version: b.version }),
                    }}
                    zusatz={rechnungZurZb ? { text: `${BELEGART_TEXT[rechnungZurZb.art]} ${rechnungZurZb.nummer ?? ""} herunterladen`, href: `/pdf/beleg/${rechnungZurZb.id}?download=1` } : null}
                  />
                  <Button asChild>
                    <a href={`${pdf}?download=1`} download data-aktion="herunterladen">
                      <Download className="size-4" /> PDF herunterladen
                    </a>
                  </Button>
                </>
              )}
              {!lexArt && b.art !== "zahlungsbestaetigung" && (
                <Button asChild variant="ghost">
                  <Link href={`/beleg/neu?art=${b.art}&kopie=${b.id}`}>
                    <Copy className="size-4" /> Duplizieren
                  </Link>
                </Button>
              )}
              {b.art === "angebot" && ["angenommen", "abgelehnt"].includes(b.status) && aenderbar && <AngebotZuruecksetzen id={b.id} />}
            </div>
          </Karte>

          <Karte titel="Daten">
            <dl className="flex flex-col gap-3 text-[14.5px]">
              {b.art === "lieferschein" ? (
                <Angabe name="Positionen">{d.positionen.filter((p) => p.typ === "artikel").length}</Angabe>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Angabe name="Netto"><span className="tabular">{eur(b.summe_netto)}</span></Angabe>
                  <Angabe name="Brutto"><span className="tabular font-semibold" data-brutto>{eur(b.summe_brutto)}</span></Angabe>
                </div>
              )}
              {lexArt && b.steuern.length > 0 && b.steuerart === "standard" && (
                <Angabe name="Umsatzsteuer">
                  {b.steuern.map((z) => (
                    <span key={z.satz} className="block tabular">{z.satz} %: {eur(z.steuer)} auf {eur(z.netto)}</span>
                  ))}
                </Angabe>
              )}
              {b.art !== "lieferschein" && <Angabe name="Steuerart">{STEUERART_TEXT[b.steuerart]}</Angabe>}
              {lexArt && (b.leistung_von || b.leistung_bis) && (
                <Angabe name="Leistungsdatum">{[b.leistung_von, b.leistung_bis].filter(Boolean).map((x) => tag(x!)).join(" – ")}</Angabe>
              )}
              {lexArt && b.art !== "gutschrift" && b.faellig_am && (
                <div className="grid grid-cols-2 gap-3">
                  <Angabe name="Fällig am">
                    {tag(b.faellig_am)}
                    {ueberfaellig && <span className="font-medium text-tone-red-fg"> · überfällig</span>}
                  </Angabe>
                  <Angabe name="Offen"><span className="tabular" data-offen>{eur(b.offen_betrag ?? 0)}</span></Angabe>
                </div>
              )}
              {b.gueltig_bis && (
                <Angabe name="Gültig bis">
                  {tag(b.gueltig_bis)}
                  {abgelaufen && <span className="font-medium text-tone-red-fg"> · abgelaufen</span>}
                </Angabe>
              )}
              {b.art === "lieferschein" && b.liefertermin && <Angabe name="Lieferdatum">{tag(b.liefertermin)}</Angabe>}
              {b.art === "auftragsbestaetigung" && (b.leistung_von || b.leistung_bis) && (
                <Angabe name="Liefer-/Montagezeit">{[b.leistung_von, b.leistung_bis].filter(Boolean).map((x) => tag(x!)).join(" – ")}</Angabe>
              )}
              {d.bestaetigt && (
                <>
                  <Angabe name="Bestätigte Zahlung">
                    <span className="tabular">{eur(d.bestaetigt.betrag)}</span> am {tag(d.bestaetigt.datum)} · {ZAHLUNGSART_TEXT[d.bestaetigt.zahlungsart as keyof typeof ZAHLUNGSART_TEXT]}
                  </Angabe>
                  <Angabe name="Restbetrag danach"><span className="tabular">{eur(b.offen_betrag ?? 0)}</span></Angabe>
                </>
              )}
              {b.fertiggestellt_am && <Angabe name="Fertiggestellt">{zeitpunkt(b.fertiggestellt_am)}</Angabe>}
            </dl>
          </Karte>

          {versionierbar && (
            <Karte titel="Versionen" rechts={<span className="text-xs text-muted-2">aktuell V{b.version}</span>}>
              <ul className="mb-3 flex flex-col text-sm" data-versionen>
                {(b.eingefroren_version ?? 0) < b.version && (
                  <li className="flex justify-between gap-2 border-t border-line-soft py-1.5 first:border-t-0">
                    <span>Version {b.version}</span>
                    <span className="text-muted-2">noch nicht übergeben</span>
                  </li>
                )}
                {d.versionen.map((v) => {
                  const versand = d.versand.filter((x) => x.version === v.version);
                  return (
                    <li key={v.version} className="flex items-center justify-between gap-2 border-t border-line-soft py-1.5 first:border-t-0">
                      <span>
                        Version {v.version}
                        <span className="block text-xs text-muted-2">{versand.map((x) => `${x.kanal === "email" ? "E-Mail" : "übergeben"} ${tag(x.gesendet_am)}`).join(", ") || tag(v.eingefroren_am)}</span>
                      </span>
                      {v.pdf_pfad && (
                        <a href={v.version === b.version ? pdf : `${pdf}?version=${v.version}`} target="_blank" rel="noopener" className="text-sm text-accent-text hover:underline">
                          Ansehen
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
              <UebergebenKnopf id={b.id} version={b.version} />
            </Karte>
          )}

          {mitZahlungen && (
            <Karte titel="Zahlungen" rechts={<span className="text-xs text-muted-2">offen {eur(b.offen_betrag ?? 0)}</span>}>
              <ZahlungenKarte belegId={b.id} offen={b.offen_betrag ?? 0} heute={heute} zahlungen={d.zahlungen} markierbar={b.status === "offen"} />
            </Karte>
          )}

          {lexArt ? (
            <Karte titel="Lexware" rechts={<Badge tone={b.pdf_pfad ? "green" : "amber"} data-lexware-pdf={b.pdf_pfad ? "da" : "fehlt"}>{b.pdf_pfad ? "Original-PDF" : "PDF folgt"}</Badge>}>
              <p className="mb-3 text-sm text-muted">
                In Lexware als <b className="text-ink">{b.nummer}</b> angelegt. Das PDF von Lexware ist das Original; nur dieses PDF wird versendet.
                {!b.pdf_pfad && " Bis Lexware es liefert, zeigt die App eine Vorschau mit dem Wasserzeichen „Entwurf“."}
              </p>
              {!b.pdf_pfad && <LexwarePdfKnopf id={b.id} />}
              <p className="mt-3 text-xs text-muted-2" data-beleg-ablage={ablage?.status ?? "keine"}>
                {ablage?.web_url ? <a href={ablage.web_url} target="_blank" rel="noopener" className="text-accent-text hover:underline">{ablageText}</a> : ablageText}
              </p>
            </Karte>
          ) : (
            <Karte titel="Ablage" rechts={<Badge tone={ablage?.status === "abgelegt" ? "green" : ablage ? "amber" : "gray"}>{ablage?.status === "abgelegt" ? "OneDrive" : ablage ? "wartet" : "nur App"}</Badge>}>
              <p className="text-sm text-muted" data-beleg-ablage={ablage?.status ?? "keine"}>
                Das App-PDF ist das Original.{" "}
                {ablage?.web_url ? <a href={ablage.web_url} target="_blank" rel="noopener" className="text-accent-text hover:underline">{ablageText}</a> : ablageText}
              </p>
            </Karte>
          )}

          <Karte titel="Intern">
            <TagsKommentar id={b.id} tags={b.tags ?? []} kommentar={b.kommentar_intern ?? ""} vorschlaege={tags} />
          </Karte>
        </aside>
      </div>
    </Shell>
  );
}
