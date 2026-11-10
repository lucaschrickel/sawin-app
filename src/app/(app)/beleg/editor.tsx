"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Eye, GripVertical, Lock, Pencil, Plus, Save, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { eur } from "@/lib/format";
import { belegSummen, rund, zahl, type Steuerart } from "@/lib/beleg-summen";
import {
  EINHEITEN,
  HINWEIS_13B,
  HINWEIS_STEUERFREI,
  leerePosition,
  PLATZHALTER,
  STEUERART_TEXT,
  STEUERSAETZE,
  zahlungsbedingungFuellen,
  type EditorZustand,
  type KopfEingabe,
  type PositionEingabe,
} from "@/lib/beleg-typen";
import { BELEGART_TEXT } from "@/lib/belege-status";
import type { KundeFuerBeleg, Zahlungsbedingung } from "@/lib/belege";
import { KundeDialog } from "../kunden/kunde-dialog";
import { kundenSuchen, type KundeTreffer } from "../anfragen/aktionen";
import { belegFertigstellen, belegSpeichern, belegVerwerfen, kundeFuerEditor } from "./aktionen";

type Props = {
  start: EditorZustand;
  hinweis?: string;
  /** neu: noch nie gespeichert; entwurf: gespeicherter Entwurf; bearbeiten: fertiggestelltes Angebot / AB */
  modus: "neu" | "entwurf" | "bearbeiten";
  zahlungsbedingungen: Zahlungsbedingung[];
  kundeStart: KundeFuerBeleg | null;
  tagVorschlaege: string[];
  herkunftListe: string[];
  zurueck: { href: string; text: string };
};

const feld =
  "w-full rounded-sm border border-line bg-surface px-2.5 text-[14px] text-ink outline-none placeholder:text-muted-2 focus:border-(--focus-ring) focus:shadow-[0_0_0_1px_var(--focus-ring)] disabled:bg-surface-muted disabled:text-muted";
const eingabe = cn(feld, "h-9");
const flaeche = cn(feld, "py-2 leading-relaxed");

function Beschriftet({ name, children, className }: { name: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-[12.5px] font-medium text-ink-3", className)}>
      {name}
      {children}
    </label>
  );
}

function Karte({ titel, rechts, children }: { titel?: string; rechts?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line-soft bg-surface px-5 py-4">
      {(titel || rechts) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titel && <h2 className="text-[15px] font-semibold">{titel}</h2>}
          {rechts}
        </div>
      )}
      {children}
    </section>
  );
}

export function BelegEditor({ start, hinweis, modus, zahlungsbedingungen, kundeStart, tagVorschlaege, herkunftListe, zurueck }: Props) {
  const router = useRouter();
  const [z, setZ] = useState<EditorZustand>(start);
  const [geaendert, setGeaendert] = useState(false);
  const [gespeichertUm, setGespeichertUm] = useState<string | null>(modus === "neu" ? null : "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const [kunde, setKunde] = useState<KundeFuerBeleg | null>(kundeStart);
  const [vorschau, setVorschau] = useState<string | null>(null);
  const [verlassen, setVerlassen] = useState<null | { weiter: () => void }>(null);
  const k = z.kopf;
  const art = k.art;
  const ls = art === "lieferschein";
  const frei = k.steuerart !== "standard";

  const setKopf = useCallback((aenderung: Partial<KopfEingabe>) => {
    setZ((alt) => ({ ...alt, kopf: { ...alt.kopf, ...aenderung } }));
    setGeaendert(true);
  }, []);
  const setPositionen = useCallback((f: (p: PositionEingabe[]) => PositionEingabe[]) => {
    setZ((alt) => ({ ...alt, positionen: f(alt.positionen) }));
    setGeaendert(true);
  }, []);
  const setPos = (key: string, aenderung: Partial<PositionEingabe>) => setPositionen((ps) => ps.map((p) => (p.key === key ? { ...p, ...aenderung } : p)));

  const summen = useMemo(
    () =>
      belegSummen(
        z.positionen.map((p) => ({ typ: p.typ, optional: art === "angebot" && p.optional, menge: zahl(p.menge), einzelpreis: zahl(p.einzelpreis), rabatt_prozent: zahl(p.rabatt_prozent), steuersatz: zahl(p.steuersatz) })),
        { steuerart: k.steuerart, preise_brutto: k.preise_brutto, gesamtrabatt_prozent: zahl(k.gesamtrabatt_prozent) },
      ),
    [z.positionen, k.steuerart, k.preise_brutto, k.gesamtrabatt_prozent, art],
  );

  // ---------- Verlassen mit ungespeicherten Änderungen: Speichern | Verwerfen | Abbrechen ----------
  const geaendertRef = useRef(geaendert);
  useEffect(() => {
    geaendertRef.current = geaendert;
  }, [geaendert]);
  useEffect(() => {
    if (!geaendert) return;
    const vorEntladen = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const klick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || a.hasAttribute("download")) return;
      const ziel = new URL(a.href, location.href);
      if (ziel.origin !== location.origin || (ziel.pathname === location.pathname && ziel.search === location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      setVerlassen({ weiter: () => router.push(ziel.pathname + ziel.search) });
    };
    // Browser-Zurück: Wächter-Eintrag im Verlauf (gleicher Zustand wie die aktuelle Seite)
    history.pushState(history.state, "", location.href);
    const zurueckTaste = () => {
      if (!geaendertRef.current) return;
      history.pushState(history.state, "", location.href);
      setVerlassen({ weiter: () => history.go(-2) });
    };
    window.addEventListener("beforeunload", vorEntladen);
    document.addEventListener("click", klick, true);
    window.addEventListener("popstate", zurueckTaste);
    return () => {
      window.removeEventListener("beforeunload", vorEntladen);
      document.removeEventListener("click", klick, true);
      window.removeEventListener("popstate", zurueckTaste);
    };
  }, [geaendert, router]);

  const nachSpeichern = (id: string, wohin?: string) => {
    setGeaendert(false);
    geaendertRef.current = false;
    setGespeichertUm(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
    // Entwurf → gespeicherter Beleg bzw. Bearbeiten → Ansicht: ersetzt den Eintrag im Verlauf
    router.replace(wohin ?? `/beleg/${id}`);
  };

  const speichern = (danach?: () => void) =>
    starte(async () => {
      setFehler(null);
      const r = await belegSpeichern(z);
      if (r.fehler || !r.id) return setFehler(r.fehler ?? "Der Beleg konnte nicht gespeichert werden.");
      if (danach) {
        setGeaendert(false);
        geaendertRef.current = false;
        return danach();
      }
      if (modus === "bearbeiten") return nachSpeichern(r.id);
      if (modus === "neu") return nachSpeichern(r.id);
      setGeaendert(false);
      setGespeichertUm(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
      if (r.hinweis) setFehler(r.hinweis);
      router.refresh();
    });

  const fertigstellen = () =>
    starte(async () => {
      setFehler(null);
      const r = await belegFertigstellen(z);
      if (r.fehler || !r.id) {
        if (r.id && !k.id) setKopf({ id: r.id });
        return setFehler(r.fehler ?? "Der Beleg konnte nicht fertiggestellt werden.");
      }
      nachSpeichern(r.id);
    });

  const zeigeVorschau = () =>
    starte(async () => {
      setFehler(null);
      const antwort = await fetch("/pdf/vorschau", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(z) });
      if (!antwort.ok) return setFehler((await antwort.text()) || "Die Vorschau konnte nicht erzeugt werden.");
      setVorschau(URL.createObjectURL(await antwort.blob()));
    });

  // ---------- Kunde ----------
  const kundeUebernehmen = (d: Awaited<ReturnType<typeof kundeFuerEditor>>, wechsel: boolean) => {
    if (!d) return;
    setKunde(d);
    const v = d.vorbelegung;
    const bezugPasst = k.bezug.art === "neu" || k.bezug.art === "keiner" || (k.bezug.art === "anfrage" && d.anfragen.some((q) => q.id === k.bezug.id));
    setKopf({
      ...v,
      objekt: wechsel || !k.objekt ? (v.objekt ?? "") : k.objekt,
      preise_brutto: v.steuerart === "standard" ? k.preise_brutto : false,
      bezug: wechsel && !bezugPasst ? { art: art === "angebot" ? "neu" : "keiner", id: null, text: "" } : k.bezug,
    });
  };
  const kundeWaehlen = (id: string) => starte(async () => kundeUebernehmen(await kundeFuerEditor(id), id !== k.kunde_id));
  const kundeFest = !!k.vorgaenger_id || k.bezug.art === "auftrag" || modus === "bearbeiten";

  // ---------- Steuer und Brutto/Netto ----------
  const steuerartSetzen = (s: Steuerart) => setKopf({ steuerart: s, preise_brutto: s === "standard" ? k.preise_brutto : false });
  const bruttoSetzen = (brutto: boolean) => {
    if (brutto === k.preise_brutto || frei) return;
    setZ((alt) => ({
      kopf: { ...alt.kopf, preise_brutto: brutto },
      positionen: alt.positionen.map((p) => {
        if (p.typ === "text" || !p.einzelpreis.trim()) return p;
        const f = 1 + zahl(p.steuersatz) / 100;
        return { ...p, einzelpreis: String(rund(brutto ? zahl(p.einzelpreis) * f : zahl(p.einzelpreis) / f)).replace(".", ",") };
      }),
    }));
    setGeaendert(true);
  };

  // ---------- Positionen: Ziehen am Griff, Pfeiltasten am Griff ----------
  const gezogen = useRef<string | null>(null);
  const verschieben = (key: string, nach: number) =>
    setPositionen((ps) => {
      const von = ps.findIndex((p) => p.key === key);
      if (von < 0 || nach < 0 || nach >= ps.length || von === nach) return ps;
      const neu = [...ps];
      const [p] = neu.splice(von, 1);
      neu.splice(nach, 0, p);
      return neu;
    });

  const bedingungen = zahlungsbedingungen.filter((b) => !b.belegarten.length || b.belegarten.includes(art));
  const zahlungText = k.zahlungsbedingung_text
    ? zahlungsbedingungFuellen(k.zahlungsbedingung_text, {
        datum: k.datum,
        brutto: summen.brutto,
        zahlungsziel: k.zahlungsziel_tage ? zahl(k.zahlungsziel_tage) : null,
        skontoziel: k.skontoziel_tage ? zahl(k.skontoziel_tage) : null,
        skonto: k.skonto_prozent ? zahl(k.skonto_prozent) : null,
      })
    : "";
  const zbFeld = useRef<HTMLTextAreaElement>(null);
  const platzhalterEinfuegen = (ph: string) => {
    const el = zbFeld.current;
    const t = k.zahlungsbedingung_text;
    const a = el?.selectionStart ?? t.length;
    const e = el?.selectionEnd ?? t.length;
    setKopf({ zahlungsbedingung_text: t.slice(0, a) + ph + t.slice(e), zahlungsbedingung_id: k.zahlungsbedingung_id });
  };

  const titelAktion = modus === "bearbeiten" ? "bearbeiten" : modus === "neu" ? "erstellen" : "bearbeiten";
  const status = geaendert ? "ungespeicherte Änderungen" : gespeichertUm === null ? "noch nicht gespeichert" : gespeichertUm ? `gespeichert ${gespeichertUm}` : "gespeichert";
  const gueltigTage = k.gueltig_bis && k.datum ? Math.round((Date.parse(k.gueltig_bis) - Date.parse(k.datum)) / 864e5) : "";
  const preisSpalten = !ls;

  return (
    <div className="flex flex-col gap-4" data-beleg-editor={art}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={zurueck.href} aria-label={`Zurück zu ${zurueck.text}`} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface hover:border-line-strong">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-[-0.02em]">
              {BELEGART_TEXT[art]} {k.nummer && <span className="font-mono text-xl">{k.nummer}</span>} {titelAktion}
            </h1>
            <p className="text-sm text-muted">
              {[k.bezug.text || (art === "angebot" && k.bezug.art === "neu" ? "Anfrage wird beim Speichern angelegt" : "noch ohne Bezug"), k.vorgaenger_text ? `aus ${k.vorgaenger_text}` : null, modus === "bearbeiten" ? "Die Nummer bleibt gleich" : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {!ls && (
          <div role="radiogroup" aria-label="Preise" className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm" title={frei ? "Bei § 13b und steuerfrei immer netto" : undefined}>
            {(["netto", "brutto"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={(m === "brutto") === k.preise_brutto}
                disabled={frei}
                onClick={() => bruttoSetzen(m === "brutto")}
                className={cn("rounded-full px-3 py-1 capitalize", (m === "brutto") === k.preise_brutto ? "bg-ink font-semibold text-surface" : "text-muted hover:text-ink", frei && "cursor-not-allowed opacity-60")}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {hinweis && <p className="rounded-md bg-tone-brand-bg px-4 py-2.5 text-sm text-tone-brand-fg">{hinweis}</p>}
      {fehler && (
        <p role="alert" className="rounded-md bg-tone-red-bg px-4 py-2.5 text-sm text-tone-red-fg">
          {fehler}
        </p>
      )}

      <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_264px] min-[1440px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Kopf: Adresse links, Belegdaten rechts */}
          <Karte>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <div className="flex items-end gap-2">
                  <KundeSuche name={k.kunde_name} nummer={k.kunde_nummer} gesperrt={kundeFest} onWahl={kundeWaehlen} />
                  {kunde && (
                    <KundeDialog
                      kunde={kunde.kunde}
                      lieferadressen={kunde.lieferadressen}
                      herkunftListe={herkunftListe}
                      onGespeichert={() => starte(async () => kundeUebernehmen(await kundeFuerEditor(k.kunde_id), false))}
                      ausloeser={
                        <button type="button" aria-label="Kunde bearbeiten" title="Kunde bearbeiten" className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-line hover:border-line-strong">
                          <Pencil className="size-4" />
                        </button>
                      }
                    />
                  )}
                  {!kundeFest && (
                    <KundeDialog
                      herkunftListe={herkunftListe}
                      onAngelegt={(neu) => kundeWaehlen(neu.id)}
                      ausloeser={
                        <button type="button" aria-label="Neuer Kunde" title="Neuer Kunde" className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-line hover:border-line-strong">
                          <UserPlus className="size-4" />
                        </button>
                      }
                    />
                  )}
                </div>
                <Beschriftet name="Name / Firma">
                  <input className={eingabe} value={k.adresse_name} onChange={(e) => setKopf({ adresse_name: e.target.value })} name="adresse_name" />
                </Beschriftet>
                <Beschriftet name="Adresszusatz">
                  <input className={eingabe} value={k.adresse_zusatz} onChange={(e) => setKopf({ adresse_zusatz: e.target.value })} name="adresse_zusatz" />
                </Beschriftet>
                <Beschriftet name="Straße">
                  <input className={eingabe} value={k.adresse_strasse} onChange={(e) => setKopf({ adresse_strasse: e.target.value })} name="adresse_strasse" />
                </Beschriftet>
                <div className="grid grid-cols-[110px_1fr] gap-2">
                  <Beschriftet name="PLZ">
                    <input className={eingabe} value={k.adresse_plz} onChange={(e) => setKopf({ adresse_plz: e.target.value })} name="adresse_plz" />
                  </Beschriftet>
                  <Beschriftet name="Ort">
                    <input className={eingabe} value={k.adresse_ort} onChange={(e) => setKopf({ adresse_ort: e.target.value })} name="adresse_ort" />
                  </Beschriftet>
                </div>
                <Beschriftet name="Land">
                  <input className={eingabe} value={k.adresse_land} onChange={(e) => setKopf({ adresse_land: e.target.value })} name="adresse_land" />
                </Beschriftet>
                <p className="text-xs text-muted-2">Empfänger dieses Belegs. Änderungen hier gelten nur für den Beleg.</p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <Beschriftet name={`${BELEGART_TEXT[art]}-Nr.`}>
                    <input className={eingabe} disabled value={k.nummer ?? ""} placeholder={art === "angebot" ? "beim ersten Speichern" : "beim Fertigstellen"} />
                  </Beschriftet>
                  <Beschriftet name="Kunden-Nr.">
                    <input className={eingabe} disabled value={k.kunde_nummer} />
                  </Beschriftet>
                </div>
                <BezugAuswahl kopf={k} kunde={kunde} modus={modus} onAnfrage={(b) => setKopf({ bezug: b })} onVorgaenger={(id) => (geaendert ? setVerlassen({ weiter: () => router.push(`/beleg/neu?art=auftragsbestaetigung&vorgaenger=${id}`) }) : router.push(`/beleg/neu?art=auftragsbestaetigung&vorgaenger=${id}`))} />
                <Beschriftet name="Datum">
                  <input type="date" className={eingabe} value={k.datum} disabled={modus === "bearbeiten"} onChange={(e) => setKopf({ datum: e.target.value })} name="datum" />
                </Beschriftet>
                {art === "angebot" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Beschriftet name="Gültig bis">
                      <input type="date" className={eingabe} value={k.gueltig_bis} onChange={(e) => setKopf({ gueltig_bis: e.target.value })} name="gueltig_bis" />
                    </Beschriftet>
                    <Beschriftet name="Gültigkeit (Tage)">
                      <input
                        inputMode="numeric"
                        className={eingabe}
                        value={gueltigTage}
                        onChange={(e) => {
                          const t = Math.max(0, Math.round(zahl(e.target.value)));
                          setKopf({ gueltig_bis: new Date(Date.parse(`${k.datum}T12:00:00Z`) + t * 864e5).toISOString().slice(0, 10) });
                        }}
                        name="gueltig_tage"
                      />
                    </Beschriftet>
                  </div>
                )}
                {art === "auftragsbestaetigung" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Beschriftet name="Liefer-/Montagezeit von">
                      <input type="date" className={eingabe} value={k.leistung_von} onChange={(e) => setKopf({ leistung_von: e.target.value })} name="leistung_von" />
                    </Beschriftet>
                    <Beschriftet name="bis">
                      <input type="date" className={eingabe} value={k.leistung_bis} onChange={(e) => setKopf({ leistung_bis: e.target.value })} name="leistung_bis" />
                    </Beschriftet>
                  </div>
                )}
                {ls && (
                  <Beschriftet name="Lieferdatum">
                    <input type="date" className={eingabe} value={k.liefertermin} onChange={(e) => setKopf({ liefertermin: e.target.value })} name="liefertermin" />
                  </Beschriftet>
                )}
                {!ls && (
                  <Beschriftet name="Steuerart">
                    <select className={eingabe} value={k.steuerart} onChange={(e) => steuerartSetzen(e.target.value as Steuerart)} name="steuerart">
                      {(Object.keys(STEUERART_TEXT) as Steuerart[]).map((s) => (
                        <option key={s} value={s}>{STEUERART_TEXT[s]}</option>
                      ))}
                    </select>
                  </Beschriftet>
                )}
                {k.steuerart !== "standard" && !ls && <p className="text-xs text-muted">{k.steuerart === "bauleistung_13b" ? HINWEIS_13B : HINWEIS_STEUERFREI} Der Hinweis wird gedruckt.</p>}
              </div>
            </div>
          </Karte>

          {/* Titel, Bauvorhaben, Objekt, Einleitung */}
          <Karte>
            <div className="flex flex-col gap-3">
              <Beschriftet name="Belegtitel">
                <input className={eingabe} value={k.titel} onChange={(e) => setKopf({ titel: e.target.value })} name="titel" />
              </Beschriftet>
              <div className="grid gap-2 md:grid-cols-2">
                <Beschriftet name="Bauvorhaben">
                  <input className={eingabe} value={k.bauvorhaben} onChange={(e) => setKopf({ bauvorhaben: e.target.value })} name="bauvorhaben" />
                </Beschriftet>
                <Beschriftet name={ls ? "Lieferanschrift" : "Objekt / Lieferanschrift"}>
                  <input className={eingabe} list="beleg-objekte" value={k.objekt} onChange={(e) => setKopf({ objekt: e.target.value })} name="objekt" />
                  <datalist id="beleg-objekte">
                    {(kunde?.objekte ?? []).map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </Beschriftet>
              </div>
              <Beschriftet name="Einleitung">
                <textarea rows={3} className={flaeche} value={k.einleitung} onChange={(e) => setKopf({ einleitung: e.target.value })} name="einleitung" />
              </Beschriftet>
            </div>
          </Karte>

          {/* Positionen */}
          <Karte
            titel="Positionen"
            rechts={<span className="text-xs text-muted-2">{ls ? "Lieferscheine zeigen keine Preise" : frei ? "ohne Umsatzsteuer" : k.preise_brutto ? "Preise brutto, inkl. USt" : "Preise netto, zzgl. USt"}</span>}
          >
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[640px] table-fixed border-collapse text-[14px]" data-positionen>
                <colgroup>
                  <col style={{ width: 40 }} />
                  <col />
                  <col style={{ width: 64 }} />
                  <col style={{ width: 84 }} />
                  {preisSpalten && (
                    <>
                      <col style={{ width: 96 }} />
                      <col style={{ width: 58 }} />
                      <col style={{ width: 68 }} />
                      <col style={{ width: 92 }} />
                    </>
                  )}
                  <col style={{ width: 36 }} />
                </colgroup>
                <thead>
                  <tr className="text-left text-[11px] font-semibold tracking-[0.06em] text-muted-2 uppercase">
                    <th className="px-1 pb-2">#</th>
                    <th className="px-1 pb-2">Titel und Beschreibung</th>
                    <th className="px-1 pb-2 text-right">Menge</th>
                    <th className="px-1 pb-2">Einheit</th>
                    {preisSpalten && (
                      <>
                        <th className="px-1 pb-2 text-right">{k.preise_brutto ? "VK brutto" : "VK netto"}</th>
                        <th className="px-1 pb-2 text-right">Rab. %</th>
                        <th className="px-1 pb-2">USt</th>
                        <th className="px-1 pb-2 text-right">Gesamt</th>
                      </>
                    )}
                    <th />
                  </tr>
                </thead>
                {(() => {
                  const nummern = z.positionen.reduce<(number | null)[]>((acc, p) => [...acc, p.typ === "artikel" ? acc.filter((x) => x !== null).length + 1 : null], []);
                  return z.positionen.map((p, i) => {
                    const nr = nummern[i];
                    const betrag = summen.zeilen[i];
                    const optional = art === "angebot" && p.optional;
                    return (
                      <tbody
                        key={p.key}
                        data-position={i}
                        onDragOver={(e) => {
                          if (gezogen.current) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (gezogen.current) verschieben(gezogen.current, i);
                          gezogen.current = null;
                        }}
                        className="border-t border-line-soft"
                      >
                        <tr className="align-top">
                          <td className="px-1 pt-2">
                            <span
                              draggable
                              tabIndex={0}
                              role="button"
                              aria-label={`Position ${i + 1} verschieben (Pfeiltasten)`}
                              onDragStart={(e) => {
                                gezogen.current = p.key;
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                                  e.preventDefault();
                                  verschieben(p.key, i + (e.key === "ArrowUp" ? -1 : 1));
                                }
                              }}
                              className="inline-flex cursor-grab items-center text-[12.5px] text-muted-2 hover:text-ink"
                            >
                              <GripVertical className="size-4" />
                              {nr ?? ""}
                            </span>
                          </td>
                          <td className="px-1 pt-1.5" colSpan={p.typ === "text" ? (preisSpalten ? 7 : 3) : 1}>
                            {p.typ === "text" && <span className="mb-1 inline-block rounded-full bg-tone-gray-bg px-2 py-0.5 text-[11px] text-tone-gray-fg">Freitext</span>}
                            <input
                              aria-label={`Titel Position ${i + 1}`}
                              data-feld="titel"
                              className={cn(eingabe, "font-semibold")}
                              value={p.titel}
                              placeholder={p.typ === "text" ? "Überschrift (optional)" : "Titel der Position"}
                              onChange={(e) => setPos(p.key, { titel: e.target.value })}
                            />
                          </td>
                          {p.typ === "artikel" && (
                            <>
                              <td className="px-1 pt-1.5">
                                <input aria-label="Menge" data-feld="menge" inputMode="decimal" className={cn(eingabe, "text-right")} value={p.menge} onChange={(e) => setPos(p.key, { menge: e.target.value })} />
                              </td>
                              <td className="px-1 pt-1.5">
                                <input aria-label="Einheit" list="beleg-einheiten" className={eingabe} value={p.einheit} onChange={(e) => setPos(p.key, { einheit: e.target.value })} />
                              </td>
                              {preisSpalten && (
                                <>
                                  <td className="px-1 pt-1.5">
                                    <input aria-label="Einzelpreis" data-feld="preis" inputMode="decimal" className={cn(eingabe, "text-right")} value={p.einzelpreis} placeholder="0,00" onChange={(e) => setPos(p.key, { einzelpreis: e.target.value })} />
                                  </td>
                                  <td className="px-1 pt-1.5">
                                    <input aria-label="Rabatt in Prozent" inputMode="decimal" className={cn(eingabe, "text-right")} value={p.rabatt_prozent} onChange={(e) => setPos(p.key, { rabatt_prozent: e.target.value })} />
                                  </td>
                                  <td className="px-1 pt-1.5">
                                    <select aria-label="Steuersatz" className={cn(eingabe, "px-1.5")} disabled={frei} value={frei ? "0" : p.steuersatz} onChange={(e) => setPos(p.key, { steuersatz: e.target.value })}>
                                      {STEUERSAETZE.map((s) => (
                                        <option key={s} value={String(s)}>{s} %</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-1 pt-3 text-right tabular" data-zeilenbetrag>
                                    {betrag == null ? "" : optional ? `(${eur(betrag)})` : eur(betrag)}
                                  </td>
                                </>
                              )}
                            </>
                          )}
                          <td className="px-1 pt-2 text-right">
                            <button type="button" aria-label={`Position ${i + 1} löschen`} onClick={() => setPositionen((ps) => ps.filter((x) => x.key !== p.key))} className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-tone-red-fg">
                              <Trash2 className="size-4" />
                            </button>
                          </td>
                        </tr>
                        <tr>
                          <td />
                          <td className="px-1 pt-1 pb-2.5" colSpan={preisSpalten ? 7 : 3}>
                            <textarea
                              aria-label={`Beschreibung Position ${i + 1}`}
                              rows={Math.min(8, Math.max(1, p.beschreibung.split("\n").length))}
                              className={cn(flaeche, "py-1.5 text-[13.5px]")}
                              placeholder="Beschreibung (optional)"
                              value={p.beschreibung}
                              onChange={(e) => setPos(p.key, { beschreibung: e.target.value })}
                            />
                            {art === "angebot" && p.typ === "artikel" && (
                              <label className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                                <input type="checkbox" checked={p.optional} onChange={(e) => setPos(p.key, { optional: e.target.checked })} />
                                optional (zählt nicht zur Summe)
                              </label>
                            )}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    );
                  });
                })()}
              </table>
              <datalist id="beleg-einheiten">
                {EINHEITEN.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" data-neue-position onClick={() => setPositionen((ps) => [...ps, leerePosition()])}>
                <Plus className="size-4" /> Position
              </Button>
              <Button size="sm" onClick={() => setPositionen((ps) => [...ps, leerePosition("text")])}>
                <Plus className="size-4" /> Freitext
              </Button>
              {!ls && (
                <label className="ml-auto inline-flex items-center gap-2 text-sm text-muted">
                  % Gesamtrabatt
                  <input inputMode="decimal" className={cn(eingabe, "w-20 text-right")} value={k.gesamtrabatt_prozent} onChange={(e) => setKopf({ gesamtrabatt_prozent: e.target.value })} name="gesamtrabatt" />
                </label>
              )}
            </div>
            {!ls && (
              <div className="mt-4 flex flex-wrap items-stretch overflow-hidden rounded-md bg-frame-2 text-sm text-frame-ink" data-summenleiste>
                <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5">
                  {summen.ohne_steuer ? (
                    <span>ohne USt · {k.steuerart === "bauleistung_13b" ? "§ 13b UStG" : "steuerfrei"}</span>
                  ) : (
                    summen.steuern.map((s) => (
                      <span key={s.satz}>
                        USt {s.satz} %: <b className="tabular">{eur(s.steuer)}</b>
                      </span>
                    ))
                  )}
                  {summen.rabatt !== 0 && (
                    <span>
                      Rabatt: <b className="tabular">{eur(-summen.rabatt)}</b>
                    </span>
                  )}
                  <span>
                    Summe (Netto): <b className="tabular">{eur(summen.netto)}</b>
                  </span>
                </div>
                <div className="flex items-center gap-3 bg-frame px-5 py-2.5">
                  <span className="text-frame-muted">Gesamtbetrag</span>
                  <b className="text-lg tabular" data-gesamtbetrag>{eur(summen.brutto)}</b>
                </div>
              </div>
            )}
          </Karte>

          {/* Lieferbedingungen, Zahlungsbedingung, Nachbemerkung */}
          <Karte>
            <div className="flex flex-col gap-3">
              {art === "auftragsbestaetigung" && (
                <Beschriftet name="Lieferbedingungen">
                  <textarea rows={3} className={flaeche} value={k.lieferbedingungen} onChange={(e) => setKopf({ lieferbedingungen: e.target.value })} name="lieferbedingungen" />
                </Beschriftet>
              )}
              {!ls && (
                <>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_88px_100px_88px]">
                    <Beschriftet name="Zahlungsbedingung">
                      <select
                        className={eingabe}
                        value={k.zahlungsbedingung_id}
                        name="zahlungsbedingung"
                        onChange={(e) => {
                          const b = bedingungen.find((x) => x.id === e.target.value);
                          setKopf(
                            b
                              ? { zahlungsbedingung_id: b.id, zahlungsbedingung_text: b.text, zahlungsziel_tage: String(b.zahlungsziel_tage), skontoziel_tage: b.skontoziel_tage != null ? String(b.skontoziel_tage) : "", skonto_prozent: b.skonto_prozent != null ? String(b.skonto_prozent).replace(".", ",") : "" }
                              : { zahlungsbedingung_id: "" },
                          );
                        }}
                      >
                        <option value="">– frei formuliert –</option>
                        {bedingungen.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </Beschriftet>
                    <Beschriftet name="Ziel (Tage)">
                      <input inputMode="numeric" className={eingabe} value={k.zahlungsziel_tage} onChange={(e) => setKopf({ zahlungsziel_tage: e.target.value })} name="zahlungsziel" />
                    </Beschriftet>
                    <Beschriftet name="Skontoziel (Tage)">
                      <input inputMode="numeric" className={eingabe} value={k.skontoziel_tage} onChange={(e) => setKopf({ skontoziel_tage: e.target.value })} name="skontoziel" />
                    </Beschriftet>
                    <Beschriftet name="Skonto %">
                      <input inputMode="decimal" className={eingabe} value={k.skonto_prozent} onChange={(e) => setKopf({ skonto_prozent: e.target.value })} name="skonto" />
                    </Beschriftet>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-ink-3">
                      <span>Text der Zahlungsbedingung</span>
                      <PlatzhalterMenue onWahl={platzhalterEinfuegen} />
                    </div>
                    <textarea ref={zbFeld} rows={3} aria-label="Text der Zahlungsbedingung" className={flaeche} value={k.zahlungsbedingung_text} onChange={(e) => setKopf({ zahlungsbedingung_text: e.target.value })} name="zahlungsbedingung_text" />
                    {zahlungText && zahlungText !== k.zahlungsbedingung_text && (
                      <p className="text-xs whitespace-pre-line text-muted" data-zahlung-vorschau>
                        Auf dem Beleg: {zahlungText}
                      </p>
                    )}
                  </div>
                </>
              )}
              <Beschriftet name="Nachbemerkung">
                <textarea rows={3} className={flaeche} value={k.nachbemerkung} onChange={(e) => setKopf({ nachbemerkung: e.target.value })} name="nachbemerkung" />
              </Beschriftet>
            </div>
          </Karte>
        </div>

        {/* Feste Seitenleiste rechts */}
        <aside className="flex flex-col gap-4 min-[1100px]:sticky min-[1100px]:top-[84px]" aria-label="Aktionen">
          <Karte>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Badge tone={k.status === "entwurf" ? "gray" : "blue"}>{k.status === "entwurf" ? "Entwurf" : `${BELEGART_TEXT[art]} · Version ${k.version}`}</Badge>
              <span className={cn("text-xs", geaendert ? "font-medium text-tone-amber-fg" : "text-muted-2")} data-speicherstand>
                {status}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {modus === "bearbeiten" ? (
                <>
                  <Button variant="primary" disabled={laeuft} onClick={() => speichern()} data-aktion="aenderungen-speichern">
                    <Save className="size-4" /> Änderungen speichern
                  </Button>
                  <Button disabled={laeuft} onClick={zeigeVorschau}>
                    <Eye className="size-4" /> Vorschau
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href={`/beleg/${k.id}`} replace>Abbrechen</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="primary" disabled={laeuft} onClick={fertigstellen} data-aktion="fertigstellen">
                    <Lock className="size-4" /> Fertigstellen
                  </Button>
                  <Button disabled={laeuft} onClick={() => speichern()} data-aktion="speichern">
                    <Save className="size-4" /> Entwurf speichern
                  </Button>
                  <Button disabled={laeuft} onClick={zeigeVorschau} data-aktion="vorschau">
                    <Eye className="size-4" /> Vorschau
                  </Button>
                  {k.id && (
                    <>
                      <Button asChild variant="ghost">
                        <Link href={`/beleg/neu?art=${art}&kopie=${k.id}`}>
                          <Copy className="size-4" /> Duplizieren
                        </Link>
                      </Button>
                      <Bestaetigen
                        titel="Entwurf verwerfen?"
                        text={art === "angebot" ? `Der Entwurf wird verworfen. Seine Nummer ${k.nummer ?? ""} wird nicht wiederverwendet.` : "Der Entwurf wird verworfen. Er hat noch keine Nummer."}
                        knopf="Verwerfen"
                        gefahr
                        ausfuehren={() =>
                          starte(async () => {
                            const r = await belegVerwerfen(k.id!);
                            if (r.fehler) return setFehler(r.fehler);
                            setGeaendert(false);
                            geaendertRef.current = false;
                            router.replace(zurueck.href);
                          })
                        }
                      >
                        <Button variant="danger" disabled={laeuft} data-aktion="verwerfen">
                          <Trash2 className="size-4" /> Verwerfen
                        </Button>
                      </Bestaetigen>
                    </>
                  )}
                </>
              )}
            </div>
          </Karte>

          <Karte titel="Summe">
            {ls ? (
              <p className="text-sm text-muted">{z.positionen.filter((p) => p.typ === "artikel").length} Positionen · ohne Preise</p>
            ) : (
              <dl className="flex flex-col gap-1 text-sm">
                {summen.rabatt !== 0 && (
                  <>
                    <div className="flex justify-between"><dt className="text-muted">Zwischensumme</dt><dd className="tabular">{eur(summen.zwischensumme)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Gesamtrabatt</dt><dd className="tabular">{eur(-summen.rabatt)}</dd></div>
                  </>
                )}
                <div className="flex justify-between"><dt className="text-muted">Netto</dt><dd className="tabular">{eur(summen.netto)}</dd></div>
                {summen.ohne_steuer ? (
                  <div className="flex justify-between"><dt className="text-muted">USt</dt><dd className="tabular">{eur(0)}</dd></div>
                ) : (
                  summen.steuern.map((s) => (
                    <div key={s.satz} className="flex justify-between"><dt className="text-muted">USt {s.satz} %</dt><dd className="tabular">{eur(s.steuer)}</dd></div>
                  ))
                )}
                <div className="mt-1 flex justify-between border-t border-line pt-1.5 text-base font-semibold"><dt>Gesamt</dt><dd className="tabular" data-summe>{eur(summen.brutto)}</dd></div>
              </dl>
            )}
          </Karte>

          <Karte titel="Tags · nur intern">
            <TagEingabe tags={k.tags} vorschlaege={tagVorschlaege} onChange={(tags) => setKopf({ tags })} />
          </Karte>
          <Karte titel="Interner Kommentar">
            <textarea rows={3} className={flaeche} value={k.kommentar_intern} onChange={(e) => setKopf({ kommentar_intern: e.target.value })} aria-label="Interner Kommentar" name="kommentar_intern" />
            <p className="mt-1.5 text-xs text-muted-2">Nicht auf dem PDF, geht nicht an Lexware.</p>
          </Karte>
        </aside>
      </div>

      <Dialog open={!!vorschau} onOpenChange={(o) => !o && (URL.revokeObjectURL(vorschau!), setVorschau(null))}>
        <DialogContent title="Vorschau" wide className="max-w-[920px]">
          {vorschau && <iframe title="Vorschau des Belegs" src={vorschau} className="h-[75vh] w-full rounded-md border border-line bg-surface" />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!verlassen} onOpenChange={(o) => !o && setVerlassen(null)}>
        <DialogContent title="Ungespeicherte Änderungen">
          <p className="text-base text-ink-3">Der Beleg hat ungespeicherte Änderungen. Was soll mit ihnen passieren?</p>
          <div className="flex flex-wrap justify-end gap-2.5 pt-5">
            <Button onClick={() => setVerlassen(null)}>Abbrechen</Button>
            <Button
              variant="danger"
              onClick={() => {
                const w = verlassen!.weiter;
                setGeaendert(false);
                geaendertRef.current = false;
                setVerlassen(null);
                setTimeout(w, 0);
              }}
            >
              Verwerfen
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const w = verlassen!.weiter;
                setVerlassen(null);
                speichern(() => setTimeout(w, 0));
              }}
            >
              Speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Kundenauswahl mit Suche (ab zwei Zeichen) */
function KundeSuche({ name, nummer, gesperrt, onWahl }: { name: string; nummer: string; gesperrt: boolean; onWahl: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [offen, setOffen] = useState(false);
  const [treffer, setTreffer] = useState<KundeTreffer[]>([]);
  const timer = useRef<number | undefined>(undefined);
  if (gesperrt)
    return (
      <Beschriftet name="Kunde" className="flex-1">
        <input className={eingabe} disabled value={name ? `${name}${nummer ? ` · ${nummer}` : ""}` : ""} />
      </Beschriftet>
    );
  return (
    <div className="relative flex-1">
      <Beschriftet name="Kunde">
        <input
          className={eingabe}
          data-kunde-suche
          role="combobox"
          aria-expanded={offen && treffer.length > 0}
          aria-controls="beleg-kunden"
          value={offen ? q : name ? `${name}${nummer ? ` · ${nummer}` : ""}` : q}
          placeholder="Kunde suchen …"
          onFocus={() => {
            setOffen(true);
            setQ("");
          }}
          onBlur={() => setTimeout(() => setOffen(false), 150)}
          onChange={(e) => {
            const wert = e.target.value;
            setQ(wert);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(async () => setTreffer(wert.trim().length >= 2 ? await kundenSuchen(wert) : []), 250);
          }}
        />
      </Beschriftet>
      {offen && treffer.length > 0 && (
        <ul id="beleg-kunden" role="listbox" className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-auto rounded-md border border-line bg-surface py-1 shadow-pop">
          {treffer.map((t) => (
            <li key={t.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOffen(false);
                  setQ("");
                  onWahl(t.id);
                }}
              >
                <span>{t.name}</span>
                <span className="text-xs text-muted-2">{[t.nummer, t.ort].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Bezug je nach Belegart: Angebot → Anfrage (oder neue), AB → Angebot (nur vor dem ersten Speichern) */
function BezugAuswahl({
  kopf: k,
  kunde,
  modus,
  onAnfrage,
  onVorgaenger,
}: {
  kopf: KopfEingabe;
  kunde: KundeFuerBeleg | null;
  modus: Props["modus"];
  onAnfrage: (b: KopfEingabe["bezug"]) => void;
  onVorgaenger: (id: string) => void;
}) {
  if (k.art === "angebot" && modus !== "bearbeiten") {
    const anfragen = kunde?.anfragen ?? [];
    const wert = k.bezug.art === "anfrage" ? k.bezug.id! : "neu";
    return (
      <Beschriftet name="Bezug">
        <select
          className={eingabe}
          value={wert}
          name="bezug"
          disabled={!k.kunde_id}
          onChange={(e) => {
            const q = anfragen.find((x) => x.id === e.target.value);
            onAnfrage(q ? { art: "anfrage", id: q.id, text: `Anfrage ${q.nummer} · ${q.titel}` } : { art: "neu", id: null, text: "" });
          }}
        >
          <option value="neu">Neue Anfrage (wird beim Speichern angelegt)</option>
          {k.bezug.art === "anfrage" && !anfragen.some((q) => q.id === k.bezug.id) && <option value={k.bezug.id!}>{k.bezug.text}</option>}
          {anfragen.map((q) => (
            <option key={q.id} value={q.id}>{`Anfrage ${q.nummer} · ${q.titel}`}</option>
          ))}
        </select>
      </Beschriftet>
    );
  }
  if (k.art === "auftragsbestaetigung" && modus === "neu" && !k.vorgaenger_id && k.bezug.art !== "auftrag") {
    const angebote = kunde?.angebote ?? [];
    return (
      <Beschriftet name="Bezug">
        <select className={eingabe} value="" name="bezug" disabled={!k.kunde_id} onChange={(e) => e.target.value && onVorgaenger(e.target.value)}>
          <option value="">Ohne Angebot · Auftrag entsteht mit der AB</option>
          {angebote.map((a) => (
            <option key={a.id} value={a.id}>{`Angebot ${a.nummer}${a.titel ? ` · ${a.titel}` : ""} (${a.status === "angenommen" ? "angenommen" : "offen"})`}</option>
          ))}
        </select>
      </Beschriftet>
    );
  }
  return (
    <Beschriftet name="Bezug">
      <input className={eingabe} disabled value={k.bezug.text || (k.art === "auftragsbestaetigung" ? "Ohne Angebot · Auftrag entsteht mit der AB" : "–")} />
    </Beschriftet>
  );
}

function PlatzhalterMenue({ onWahl }: { onWahl: (ph: string) => void }) {
  const [offen, setOffen] = useState(false);
  return (
    <span className="relative">
      <button type="button" aria-label="Platzhalter einfügen" aria-expanded={offen} onClick={() => setOffen((o) => !o)} className="rounded-sm border border-line px-2 py-0.5 font-mono text-xs hover:border-line-strong">
        {"{ }"}
      </button>
      {offen && (
        <ul className="absolute top-full right-0 z-20 mt-1 w-52 rounded-md border border-line bg-surface py-1 shadow-pop">
          {PLATZHALTER.map((ph) => (
            <li key={ph}>
              <button
                type="button"
                className="w-full px-3 py-1 text-left font-mono text-xs hover:bg-surface-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onWahl(ph);
                  setOffen(false);
                }}
              >
                {ph}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/** Freie Tags mit Vorschlägen; Enter oder Komma fügt hinzu */
export function TagEingabe({ tags, vorschlaege, onChange }: { tags: string[]; vorschlaege: string[]; onChange: (t: string[]) => void }) {
  const [neu, setNeu] = useState("");
  const hinzu = () => {
    const t = neu.trim().replace(/,$/, "");
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setNeu("");
  };
  return (
    <div className="flex flex-col gap-2" data-tags>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-tone-blue-bg px-2.5 py-0.5 text-xs text-tone-blue-fg">
              {t}
              <button type="button" aria-label={`Tag ${t} entfernen`} onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:text-ink">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className={eingabe}
        list="beleg-tags"
        placeholder="+ Tag"
        aria-label="Tag hinzufügen"
        value={neu}
        onChange={(e) => setNeu(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            hinzu();
          }
        }}
        onBlur={hinzu}
      />
      <datalist id="beleg-tags">
        {vorschlaege.filter((v) => !tags.includes(v)).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  );
}
