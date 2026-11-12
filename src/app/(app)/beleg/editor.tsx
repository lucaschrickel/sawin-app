"use client";

import { verlaufVergessen } from "@/components/app/verlauf";
import { useVerlassenSchutz, VerlassenDialog } from "@/components/app/verlassen-schutz";
import { inhaltsBreiten, SpaltenGriff } from "@/components/ui/spalten-griff";
import { spaltenbreitenSetzen } from "@/lib/ansicht-aktion";
import { breitenAus, geaendertGegenStandard, passendeBreite, type SpaltenDef } from "@/lib/spalten";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Copy, Eye, FileText, GripVertical, Lock, Pencil, Plus, Save, Trash2, UserPlus, X, RotateCcw } from "lucide-react";
import { useCallback, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { RichText } from "@/components/ui/rich-text";
import { cn } from "@/lib/cn";
import { eur } from "@/lib/format";
import { belegSummen, rund, zahl, type Steuerart } from "@/lib/beleg-summen";
import { abschlagBerechnen, abschlagPositionen, schlussAbweichungen, type AbschlagErgebnis } from "@/lib/abschlag";
import {
  EINHEITEN,
  HINWEIS_13B,
  HINWEIS_STEUERFREI,
  htmlZuText,
  leerePosition,
  neuerSchluessel,
  PLATZHALTER,
  STEUERART_TEXT,
  STEUERSAETZE,
  zahlungsbedingungFuellen,
  type EditorZustand,
  type KopfEingabe,
  type PositionEingabe,
} from "@/lib/beleg-typen";
import { BELEGART_TEXT, LEXWARE_BELEGARTEN } from "@/lib/belege-status";
import type { AbrechnungKontext, Artikel, KundeFuerBeleg, Textvorlage, Zahlungsbedingung } from "@/lib/belege";
import { KundeDialog } from "../kunden/kunde-dialog";
import { kundenSuchen, type KundeTreffer } from "../anfragen/aktionen";
import { belegFertigstellen, belegSpeichern, belegVerwerfen, kundeFuerEditor } from "./aktionen";

type Props = {
  /** gezogene Spaltenbreiten der Positionstabelle (je Benutzer) */
  spaltenStart?: Record<string, number>;
  start: EditorZustand;
  hinweis?: string;
  /** neu: noch nie gespeichert; entwurf: gespeicherter Entwurf; bearbeiten: fertiggestelltes Angebot / AB */
  modus: "neu" | "entwurf" | "bearbeiten";
  zahlungsbedingungen: Zahlungsbedingung[];
  kundeStart: KundeFuerBeleg | null;
  tagVorschlaege: string[];
  herkunftListe: string[];
  zurueck: { href: string; text: string };
  /** Artikelkatalog (Stern = Schnellauswahl) */
  artikel?: Artikel[];
  /** Textvorlagen für Einleitung, Lieferbedingungen, Nachbemerkung */
  vorlagen?: Textvorlage[];
  /** Abschlag und Schlussrechnung: Werte der AB und angelegte Abschläge */
  abrechnung?: AbrechnungKontext | null;
  /** Stand der Übertragung an Lexware (Entwurf nach einem fehlgeschlagenen Versuch) */
  lexware?: { status: string | null; fehler: string | null } | null;
};

const datumDe = (iso: string) => iso.split("-").reverse().join(".");

/** Positionen der Abschlagsrechnung aus der Eingabe (Prozent bzw. Betrag), wie sie auch der Server rechnet */
function abschlagZeilen(kopf: KopfEingabe, abrechnung: AbrechnungKontext | null | undefined, alt: PositionEingabe[]): PositionEingabe[] {
  if (!abrechnung) return alt;
  const wert = zahl(kopf.abschlag_wert);
  if (!(wert > 0)) return [];
  const eingabe = { art: kopf.abschlag_art, wert };
  const e = abschlagBerechnen(eingabe, abrechnung.wert, abrechnung.abzuege.map((a) => a.steuern));
  return abschlagPositionen(e, eingabe, abrechnung.ab).map((p, i) => ({
    key: alt[i]?.key ?? neuerSchluessel(),
    id: alt[i]?.id ?? null,
    typ: "artikel",
    titel: p.titel,
    beschreibung: p.beschreibung,
    optional: false,
    menge: "1",
    einheit: p.einheit,
    einzelpreis: String(p.einzelpreis).replace(".", ","),
    rabatt_prozent: "",
    steuersatz: String(p.steuersatz),
  }));
}

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

/** Ziehbare Spalten der Positionstabelle (Breiten in px; Titel nimmt den Rest, mindestens TITEL_MIN) */
const SPALTEN: SpaltenDef[] = [
  { schluessel: "menge", titel: "Menge", standard: 64, min: 48, max: 200 },
  { schluessel: "einheit", titel: "Einheit", standard: 84, min: 56, max: 220 },
  { schluessel: "preis", titel: "Einzelpreis", standard: 96, min: 72, max: 240 },
  { schluessel: "rabatt", titel: "Rabatt", standard: 58, min: 44, max: 160 },
  { schluessel: "ust", titel: "USt", standard: 68, min: 56, max: 160 },
  { schluessel: "gesamt", titel: "Gesamt", standard: 92, min: 72, max: 240 },
];
const TITEL_MIN = 160;

export function BelegEditor({ start, hinweis, modus, zahlungsbedingungen, kundeStart, tagVorschlaege, herkunftListe, zurueck, abrechnung, lexware, artikel = [], vorlagen = [] , spaltenStart }: Props) {
  const router = useRouter();
  const [z, setZ] = useState<EditorZustand>(() =>
    start.kopf.art === "abschlagsrechnung" ? { ...start, positionen: abschlagZeilen(start.kopf, abrechnung, start.positionen) } : start,
  );
  const [geaendert, setGeaendert] = useState(false);
  const [gespeichertUm, setGespeichertUm] = useState<string | null>(modus === "neu" ? null : "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const [kunde, setKunde] = useState<KundeFuerBeleg | null>(kundeStart);
  const [vorschau, setVorschau] = useState<string | null>(null);
  const k = z.kopf;
  const art = k.art;
  const ls = art === "lieferschein";
  const frei = k.steuerart !== "standard";
  const lexArt = LEXWARE_BELEGARTEN.includes(art);
  const abschlag = art === "abschlagsrechnung";
  const gutschrift = art === "gutschrift";
  const hatAbzug = z.positionen.some((p) => p.abzug_beleg_id);
  /** Steuerart und Netto/Brutto kommen aus AB bzw. Rechnung */
  const steuerFest = abschlag || gutschrift || hatAbzug;

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
        z.positionen.map((p) => ({ typ: p.typ, optional: art === "angebot" && p.optional, menge: zahl(p.menge), einzelpreis: zahl(p.einzelpreis), rabatt_prozent: zahl(p.rabatt_prozent), steuersatz: zahl(p.steuersatz), abzug: !!p.abzug_beleg_id })),
        { steuerart: k.steuerart, preise_brutto: k.preise_brutto, gesamtrabatt_prozent: zahl(k.gesamtrabatt_prozent) },
      ),
    [z.positionen, k.steuerart, k.preise_brutto, k.gesamtrabatt_prozent, art],
  );

  // Abschlag: Ergebnis der Berechnung (Beträge je Satz, Rest, Warnung)
  const abschlagErgebnis = useMemo<AbschlagErgebnis | null>(() => {
    if (!abschlag || !abrechnung) return null;
    const wert = zahl(k.abschlag_wert);
    if (!(wert > 0)) return null;
    return abschlagBerechnen({ art: k.abschlag_art, wert }, abrechnung.wert, abrechnung.abzuege.map((a) => a.steuern));
  }, [abschlag, abrechnung, k.abschlag_art, k.abschlag_wert]);
  const setAbschlag = (aenderung: Partial<KopfEingabe>) => {
    setZ((alt) => {
      const kopf = { ...alt.kopf, ...aenderung };
      return { kopf, positionen: abschlagZeilen(kopf, abrechnung, alt.positionen) };
    });
    setGeaendert(true);
  };

  // Schlussrechnung: volle Leistung (ohne Abzüge) und Prüfung, ob Netto, Steuer und Rest centgenau stimmen
  const schluss = useMemo(() => {
    if (!hatAbzug || !abrechnung) return null;
    const voll = belegSummen(
      z.positionen.filter((p) => !p.abzug_beleg_id).map((p) => ({ typ: p.typ, menge: zahl(p.menge), einzelpreis: zahl(p.einzelpreis), rabatt_prozent: zahl(p.rabatt_prozent), steuersatz: zahl(p.steuersatz) })),
      { steuerart: k.steuerart, preise_brutto: k.preise_brutto, gesamtrabatt_prozent: zahl(k.gesamtrabatt_prozent) },
    );
    return { voll, abweichungen: schlussAbweichungen(voll.steuern, abrechnung.abzuege.map((a) => a.steuern), summen.steuern) };
  }, [hatAbzug, abrechnung, z.positionen, k.steuerart, k.preise_brutto, k.gesamtrabatt_prozent, summen.steuern]);

  // ---------- Verlassen mit ungespeicherten Änderungen: Speichern | Verwerfen | Abbrechen ----------
  const { verlassen, setVerlassen, geaendertRef } = useVerlassenSchutz(geaendert);

  // ---------- Spaltenbreiten der Positionstabelle (je Benutzer gespeichert) ----------
  const tabelleRef = useRef<HTMLTableElement>(null);
  const [breiten, setBreiten] = useState(() => breitenAus(spaltenStart, SPALTEN));
  const breitenRef = useRef(breiten);
  const breiteSetzen = (schluessel: string, b: number) =>
    setBreiten((alt) => {
      const neu = { ...alt, [schluessel]: b };
      breitenRef.current = neu;
      return neu;
    });
  const breitenMerken = () => void spaltenbreitenSetzen("beleg_positionen", breitenRef.current);
  const passend = (d: SpaltenDef) => {
    if (!tabelleRef.current) return;
    breiteSetzen(d.schluessel, passendeBreite(inhaltsBreiten(tabelleRef.current, d.schluessel), 4, d.min, d.max));
    setTimeout(breitenMerken, 0);
  };
  const spaltenZuruecksetzen = () => {
    const standard = breitenAus(undefined, SPALTEN);
    breitenRef.current = standard;
    setBreiten(standard);
    void spaltenbreitenSetzen("beleg_positionen", null);
  };

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
        if (r.id && !k.id && lexArt) {
          // Lexware-Beleg: Entwurf ist gespeichert, die Belegseite zeigt den Fehler und erlaubt das Wiederholen
          setGeaendert(false);
          geaendertRef.current = false;
          router.replace(`/beleg/${r.id}`);
        } else if (r.id && !k.id) setKopf({ id: r.id });
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
  const kundeFest = !!k.vorgaenger_id || k.bezug.art === "auftrag" || k.bezug.art === "ticket" || lexArt || modus === "bearbeiten";

  // ---------- Steuer und Brutto/Netto ----------
  const steuerartSetzen = (s: Steuerart) => {
    setKopf({ steuerart: s, preise_brutto: s === "standard" ? k.preise_brutto : false });
    // Zurück auf Standard: Positionen ohne Satz (aus § 13b bzw. steuerfrei) bekommen wieder 19 %
    if (s === "standard" && frei) setPositionen((ps) => ps.map((p) => (p.typ === "artikel" && zahl(p.steuersatz) === 0 ? { ...p, steuersatz: "19" } : p)));
  };
  const bruttoSetzen = (brutto: boolean) => {
    if (brutto === k.preise_brutto || frei || steuerFest) return;
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

  // ---------- Artikel aus dem Katalog: Titel, Beschreibung, Einheit, Preis (bei Brutto-Eingabe mit 19 %) ----------
  const artikelEinfuegen = (a: Artikel) =>
    setPositionen((ps) => {
      const preis = k.preise_brutto && !frei ? rund(a.preis_netto * 1.19) : a.preis_netto;
      const neu: PositionEingabe = { ...leerePosition(), titel: a.bezeichnung, beschreibung: a.beschreibung_html ?? "", einheit: a.einheit, einzelpreis: String(preis).replace(".", ","), steuersatz: frei ? "0" : "19" };
      const normale = ps.filter((p) => !p.abzug_beleg_id);
      const abzuege = ps.filter((p) => p.abzug_beleg_id);
      const letzte = normale[normale.length - 1];
      const leer = letzte && letzte.typ === "artikel" && !letzte.titel.trim() && !letzte.einzelpreis.trim() && !letzte.beschreibung.trim();
      return [...(leer ? normale.slice(0, -1) : normale), neu, ...abzuege];
    });
  const vorlagenFuer = (feld: Textvorlage["feld"]) => vorlagen.filter((v) => v.feld === feld && (!v.belegarten.length || v.belegarten.includes(art)));

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
          <div role="radiogroup" aria-label="Preise" className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm" title={frei ? "Bei § 13b und steuerfrei immer netto" : steuerFest ? "Wie in der Auftragsbestätigung bzw. Rechnung" : undefined}>
            {(["netto", "brutto"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={(m === "brutto") === k.preise_brutto}
                disabled={frei || steuerFest}
                onClick={() => bruttoSetzen(m === "brutto")}
                className={cn("rounded-full px-3 py-1 capitalize", (m === "brutto") === k.preise_brutto ? "bg-ink font-semibold text-surface" : "text-muted hover:text-ink", (frei || steuerFest) && "cursor-not-allowed opacity-60")}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {hinweis && <p className="rounded-md bg-tone-brand-bg px-4 py-2.5 text-sm text-tone-brand-fg">{hinweis}</p>}
      {lexware?.status === "fehler" && !fehler && (
        <p role="alert" className="rounded-md bg-tone-red-bg px-4 py-2.5 text-sm text-tone-red-fg" data-lexware-fehler>
          Die letzte Übertragung an Lexware ist fehlgeschlagen: {lexware.fehler ?? "unbekannter Fehler"}. Mit „Fertigstellen“ erneut versuchen; ein schon angelegter Beleg wird dabei erkannt und nicht doppelt angelegt.
        </p>
      )}
      {lexware?.status === "uebertragung" && (
        <p className="rounded-md bg-tone-amber-bg px-4 py-2.5 text-sm text-tone-amber-fg">Der Beleg wird gerade an Lexware übertragen. Bitte die Seite in einer Minute neu laden.</p>
      )}
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
                    <input className={eingabe} disabled value={k.nummer ?? ""} placeholder={art === "angebot" ? "beim ersten Speichern" : lexArt ? "von Lexware" : "beim Fertigstellen"} />
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
                {art === "rechnung" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Beschriftet name="Leistungsdatum">
                      <input type="date" className={eingabe} value={k.leistung_von} onChange={(e) => setKopf({ leistung_von: e.target.value })} name="leistung_von" required />
                    </Beschriftet>
                    <Beschriftet name="bis (Zeitraum, optional)">
                      <input type="date" className={eingabe} value={k.leistung_bis} onChange={(e) => setKopf({ leistung_bis: e.target.value })} name="leistung_bis" />
                    </Beschriftet>
                  </div>
                )}
                {(ls || art === "teil_ab") && (
                  <Beschriftet name={ls ? "Lieferdatum" : "Liefertermin (Pflicht, wird Liefertermin des Auftrags)"}>
                    <input type="date" className={eingabe} value={k.liefertermin} required={art === "teil_ab"} onChange={(e) => setKopf({ liefertermin: e.target.value })} name="liefertermin" />
                  </Beschriftet>
                )}
                {!ls && (
                  <Beschriftet name="Steuerart">
                    <select className={eingabe} value={k.steuerart} disabled={steuerFest} onChange={(e) => steuerartSetzen(e.target.value as Steuerart)} name="steuerart">
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
              <Beschriftet name={abschlag ? "Belegtitel (Nummer des Abschlags vergibt die App beim Fertigstellen)" : lexArt ? "Belegtitel (in Lexware höchstens 25 Zeichen)" : "Belegtitel"}>
                <input className={eingabe} value={k.titel} disabled={abschlag} maxLength={lexArt ? 25 : undefined} onChange={(e) => setKopf({ titel: e.target.value })} name="titel" />
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
              <TextMitVorlage name="Einleitung" vorlagen={vorlagenFuer("einleitung")} onVorlage={(t) => setKopf({ einleitung: t })}>
                <textarea rows={3} className={flaeche} value={k.einleitung} onChange={(e) => setKopf({ einleitung: e.target.value })} name="einleitung" aria-label="Einleitung" />
              </TextMitVorlage>
            </div>
          </Karte>

          {/* Positionen (Abschlag: aus Prozent bzw. Betrag berechnet) */}
          {abschlag ? (
            <AbschlagKarte k={k} abrechnung={abrechnung} ergebnis={abschlagErgebnis} onChange={setAbschlag} />
          ) : (
          <Karte
            titel="Positionen"
            rechts={<span className="text-xs text-muted-2">{ls ? "Lieferscheine zeigen keine Preise" : frei ? "ohne Umsatzsteuer" : k.preise_brutto ? "Preise brutto, inkl. USt" : "Preise netto, zzgl. USt"}</span>}
          >
            {artikel.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5" data-schnellauswahl>
                {artikel
                  .filter((a) => a.schnellauswahl)
                  .map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => artikelEinfuegen(a)}
                      data-artikel-knopf={a.bezeichnung}
                      title={`${a.bezeichnung} · ${eur(a.preis_netto)} netto / ${a.einheit}`}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-[13px] hover:border-line-strong"
                    >
                      <Plus className="size-3.5" /> {a.bezeichnung}
                    </button>
                  ))}
                <KatalogDialog artikel={artikel} onWahl={artikelEinfuegen} />
              </div>
            )}
            <div className="-mx-1 overflow-x-auto">
              {(() => {
                const sichtbar = SPALTEN.filter((d) => preisSpalten || d.schluessel === "menge" || d.schluessel === "einheit");
                const kopfText: Record<string, string> = { menge: "Menge", einheit: "Einheit", preis: k.preise_brutto ? "VK brutto" : "VK netto", rabatt: "Rab. %", ust: "USt", gesamt: "Gesamt" };
                const rechts = new Set(["menge", "preis", "rabatt", "gesamt"]);
                return (
              <table
                ref={tabelleRef}
                className="w-full table-fixed border-collapse text-[14px]"
                style={{ minWidth: 40 + TITEL_MIN + 36 + sichtbar.reduce((summe, d) => summe + breiten[d.schluessel], 0) }}
                data-positionen
              >
                <colgroup>
                  <col style={{ width: 40 }} />
                  <col />
                  {sichtbar.map((d) => (
                    <col key={d.schluessel} style={{ width: breiten[d.schluessel] }} />
                  ))}
                  <col style={{ width: 36 }} />
                </colgroup>
                <thead>
                  <tr className="text-left text-[11px] font-semibold tracking-[0.06em] text-muted-2 uppercase">
                    <th className="px-1 pb-2">#</th>
                    <th className="px-1 pb-2">Titel und Beschreibung</th>
                    {sichtbar.map((d) => (
                      <th key={d.schluessel} className={cn("relative px-1 pb-2", rechts.has(d.schluessel) && "text-right")} data-spalte={d.schluessel}>
                        {kopfText[d.schluessel]}
                        <SpaltenGriff
                          titel={d.titel}
                          breite={breiten[d.schluessel]}
                          min={d.min}
                          max={d.max}
                          onBreite={(b) => breiteSetzen(d.schluessel, b)}
                          onEnde={breitenMerken}
                          onPassend={() => passend(d)}
                        />
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                {(() => {
                  const nummern = z.positionen.reduce<(number | null)[]>((acc, p) => [...acc, p.typ === "artikel" ? acc.filter((x) => x !== null).length + 1 : null], []);
                  return z.positionen.map((p, i) => {
                    if (p.abzug_beleg_id) return null;
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
                              <td className="px-1 pt-1.5" data-spalte="menge">
                                <input aria-label="Menge" data-feld="menge" inputMode="decimal" className={cn(eingabe, "text-right")} value={p.menge} onChange={(e) => setPos(p.key, { menge: e.target.value })} />
                              </td>
                              <td className="px-1 pt-1.5" data-spalte="einheit">
                                <input aria-label="Einheit" list="beleg-einheiten" className={eingabe} value={p.einheit} onChange={(e) => setPos(p.key, { einheit: e.target.value })} />
                              </td>
                              {preisSpalten && (
                                <>
                                  <td className="px-1 pt-1.5" data-spalte="preis">
                                    <input aria-label="Einzelpreis" data-feld="preis" inputMode="decimal" className={cn(eingabe, "text-right")} value={p.einzelpreis} placeholder="0,00" onChange={(e) => setPos(p.key, { einzelpreis: e.target.value })} />
                                  </td>
                                  <td className="px-1 pt-1.5" data-spalte="rabatt">
                                    <input aria-label="Rabatt in Prozent" inputMode="decimal" className={cn(eingabe, "text-right")} value={p.rabatt_prozent} onChange={(e) => setPos(p.key, { rabatt_prozent: e.target.value })} />
                                  </td>
                                  <td className="px-1 pt-1.5" data-spalte="ust">
                                    <select aria-label="Steuersatz" className={cn(eingabe, "px-1.5")} disabled={frei} value={frei ? "0" : p.steuersatz} onChange={(e) => setPos(p.key, { steuersatz: e.target.value })}>
                                      {STEUERSAETZE.map((s) => (
                                        <option key={s} value={String(s)}>{s} %</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-1 pt-3 text-right tabular" data-zeilenbetrag data-spalte="gesamt">
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
                            <RichText
                              label={`Beschreibung Position ${i + 1}`}
                              placeholder="Beschreibung (optional)"
                              wert={p.beschreibung}
                              onChange={(html) => setPos(p.key, { beschreibung: html })}
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
                );
              })()}
              <datalist id="beleg-einheiten">
                {EINHEITEN.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>
            {hatAbzug && (
              <div className="mt-3 rounded-md border border-line-soft bg-surface-muted px-3 py-2.5" data-abzuege>
                <p className="mb-1.5 text-[12.5px] font-semibold text-ink-3">abzgl. bereits berechnet · nicht abwählbar</p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {z.positionen.map((p, i) =>
                    p.abzug_beleg_id ? (
                      <li key={p.key} className="flex justify-between gap-3" data-abzug>
                        <span className="min-w-0">
                          <span className="font-medium">{p.titel}</span>
                          <span className="block text-xs text-muted">{htmlZuText(p.beschreibung)}</span>
                        </span>
                        <span className="whitespace-nowrap tabular">{eur(summen.zeilen[i] ?? 0)}</span>
                      </li>
                    ) : null,
                  )}
                </ul>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" data-neue-position onClick={() => setPositionen((ps) => [...ps, leerePosition()])}>
                <Plus className="size-4" /> Position
              </Button>
              <Button size="sm" onClick={() => setPositionen((ps) => [...ps, leerePosition("text")])}>
                <Plus className="size-4" /> Freitext
              </Button>
              {geaendertGegenStandard(breiten, SPALTEN) && (
                <Button size="sm" variant="ghost" onClick={spaltenZuruecksetzen} data-spalten-zuruecksetzen>
                  <RotateCcw className="size-4" /> Spalten zurücksetzen
                </Button>
              )}
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
            {schluss && schluss.abweichungen.length > 0 && (
              <p className="mt-3 rounded-md bg-tone-amber-bg px-3 py-2 text-sm text-tone-amber-fg" data-rundung>
                Die Positionen weichen von der Auftragsbestätigung ab. Die Umsatzsteuer des Restbetrags weicht deshalb um{" "}
                {schluss.abweichungen.map((a) => `${eur(rund(a.lexware.steuer - a.erwartet.steuer))} (${a.satz} %)`).join(", ")} von „Steuer gesamt − Steuer der Abschläge“ ab.
              </p>
            )}
          </Karte>
          )}

          {/* Lieferbedingungen, Zahlungsbedingung, Nachbemerkung */}
          <Karte>
            <div className="flex flex-col gap-3">
              {(art === "auftragsbestaetigung" || art === "teil_ab") && (
                <TextMitVorlage name="Lieferbedingungen" vorlagen={vorlagenFuer("lieferbedingungen")} onVorlage={(t) => setKopf({ lieferbedingungen: t })}>
                  <textarea rows={3} className={flaeche} value={k.lieferbedingungen} onChange={(e) => setKopf({ lieferbedingungen: e.target.value })} name="lieferbedingungen" aria-label="Lieferbedingungen" />
                </TextMitVorlage>
              )}
              {!ls && !gutschrift && (
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
              <TextMitVorlage name="Nachbemerkung" vorlagen={vorlagenFuer("nachbemerkung")} onVorlage={(t) => setKopf({ nachbemerkung: t })}>
                <textarea rows={3} className={flaeche} value={k.nachbemerkung} onChange={(e) => setKopf({ nachbemerkung: e.target.value })} name="nachbemerkung" aria-label="Nachbemerkung" />
              </TextMitVorlage>
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
                  {lexArt ? (
                    <Bestaetigen
                      titel={`${BELEGART_TEXT[art]} in Lexware anlegen?`}
                      knopf="In Lexware anlegen"
                      ausfuehren={fertigstellen}
                      text={
                        <div className="flex flex-col gap-2" data-lexware-bestaetigung>
                          <p>
                            {abschlag && abschlagErgebnis ? `${(abrechnung?.abschlaege.length ?? 0) + 1}. Abschlagsrechnung` : BELEGART_TEXT[art]} über <b>{eur(summen.brutto)}</b> wird in Lexware angelegt. Lexware vergibt die Nummer und liefert das PDF.
                          </p>
                          <p>
                            Danach ist der Beleg <b>endgültig und nicht löschbar</b>. Korrekturen laufen über eine Gutschrift. Versendet wird nur das Lexware-PDF.
                          </p>
                          {abschlagErgebnis?.ueberschritten && (
                            <p className="font-medium text-tone-amber-fg" data-warnung-ueberschritten>
                              Achtung: Mit diesem Abschlag übersteigen die Abschläge den Auftragswert um {eur(-abschlagErgebnis.rest)}.
                            </p>
                          )}
                          {schluss && schluss.abweichungen.length > 0 && (
                            <p className="font-medium text-tone-amber-fg">Achtung: Die Umsatzsteuer des Restbetrags weicht wegen geänderter Positionen um einen Rundungsbetrag ab.</p>
                          )}
                        </div>
                      }
                    >
                      <Button variant="primary" disabled={laeuft || (abschlag && !abschlagErgebnis)} data-aktion="fertigstellen">
                        <Lock className="size-4" /> Fertigstellen
                      </Button>
                    </Bestaetigen>
                  ) : (
                    <Button variant="primary" disabled={laeuft} onClick={fertigstellen} data-aktion="fertigstellen">
                      <Lock className="size-4" /> Fertigstellen
                    </Button>
                  )}
                  <Button disabled={laeuft} onClick={() => speichern()} data-aktion="speichern">
                    <Save className="size-4" /> Entwurf speichern
                  </Button>
                  <Button disabled={laeuft} onClick={zeigeVorschau} data-aktion="vorschau">
                    <Eye className="size-4" /> Vorschau
                  </Button>
                  {k.id && (
                    <>
                      {!lexArt && (
                        <Button asChild variant="ghost">
                          <Link href={`/beleg/neu?art=${art}&kopie=${k.id}`}>
                            <Copy className="size-4" /> Duplizieren
                          </Link>
                        </Button>
                      )}
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
                            // verworfener Entwurf: aus dem Zurück-Verlauf nehmen, dann zur Herkunft
                            verlaufVergessen();
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
                {schluss && (
                  <>
                    <div className="flex justify-between"><dt className="text-muted">Leistung gesamt</dt><dd className="tabular">{eur(schluss.voll.brutto)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">abzgl. Abschläge</dt><dd className="tabular">{eur(rund(summen.brutto - schluss.voll.brutto))}</dd></div>
                    <div className="mb-1 border-b border-line-soft pb-1 text-xs text-muted-2">Restbetrag dieser Schlussrechnung:</div>
                  </>
                )}
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

      <VerlassenDialog
        verlassen={verlassen}
        text="Der Beleg hat ungespeicherte Änderungen. Was soll mit ihnen passieren?"
        onAbbrechen={() => setVerlassen(null)}
        onVerwerfen={(weiter) => {
          setGeaendert(false);
          geaendertRef.current = false;
          setVerlassen(null);
          setTimeout(weiter, 0);
        }}
        onSpeichern={(weiter) => {
          setVerlassen(null);
          speichern(() => setTimeout(weiter, 0));
        }}
      />
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

/** Abschlagsrechnung: Eingabe als Prozent vom Auftragswert (brutto) oder als Bruttobetrag, mit Übersicht */
function AbschlagKarte({
  k,
  abrechnung,
  ergebnis,
  onChange,
}: {
  k: KopfEingabe;
  abrechnung: AbrechnungKontext | null | undefined;
  ergebnis: AbschlagErgebnis | null;
  onChange: (a: Partial<KopfEingabe>) => void;
}) {
  if (!abrechnung)
    return (
      <Karte titel="Abschlag">
        <p className="text-sm text-tone-red-fg">Der Auftrag hat keine fertiggestellte Auftragsbestätigung.</p>
      </Karte>
    );
  const zeile = (name: ReactNode, betrag: ReactNode, fett = false, data?: string) => (
    <div className={cn("flex justify-between gap-3", fett && "font-semibold")} {...(data ? { [data]: "" } : {})}>
      <dt className={fett ? "" : "text-muted"}>{name}</dt>
      <dd className="tabular">{betrag}</dd>
    </div>
  );
  return (
    <Karte titel="Abschlag" rechts={<span className="text-xs text-muted-2">Auftragsbestätigung {abrechnung.ab.nummer} vom {datumDe(abrechnung.ab.datum)}</span>}>
      <div className="flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label="Eingabe des Abschlags" className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm">
          {(["prozent", "betrag"] as const).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={k.abschlag_art === a}
              onClick={() => a !== k.abschlag_art && onChange({ abschlag_art: a, abschlag_wert: "" })}
              className={cn("rounded-full px-3 py-1", k.abschlag_art === a ? "bg-ink font-semibold text-surface" : "text-muted hover:text-ink")}
            >
              {a === "prozent" ? "Prozent" : "Betrag brutto"}
            </button>
          ))}
        </div>
        <Beschriftet name={k.abschlag_art === "prozent" ? "Abschlag in % vom Auftragswert (brutto)" : "Abschlag in € (brutto)"}>
          <input inputMode="decimal" className={cn(eingabe, "w-44 text-right")} value={k.abschlag_wert} onChange={(e) => onChange({ abschlag_wert: e.target.value })} name="abschlag_wert" data-feld="abschlag" />
        </Beschriftet>
      </div>
      <dl className="mt-4 flex max-w-md flex-col gap-1.5 text-sm" data-abschlag-uebersicht>
        {zeile(`Auftragswert (AB ${abrechnung.ab.nummer})`, eur(abrechnung.ab.brutto))}
        {abrechnung.abzuege.map((a) => zeile(a.bezeichnung ? `${a.bezeichnung} ${a.nummer ?? ""} vom ${datumDe(a.datum)}` : `${a.nr ?? ""}. Abschlag ${a.nummer ?? ""} vom ${datumDe(a.datum)}`, eur(-a.brutto)))}
        {ergebnis && (
          <>
            {ergebnis.zeilen.length > 1 &&
              ergebnis.zeilen.map((z) => zeile(`davon ${z.satz} %: netto ${eur(z.netto)} + USt ${eur(z.steuer)}`, eur(z.brutto)))}
            {zeile("Dieser Abschlag netto", eur(ergebnis.netto))}
            {zeile("zzgl. Umsatzsteuer", eur(ergebnis.steuer))}
            {zeile("Dieser Abschlag brutto", <span data-abschlag-brutto>{eur(ergebnis.brutto)}</span>, true)}
            {zeile("Rest des Auftrags danach", eur(ergebnis.rest))}
          </>
        )}
      </dl>
      {ergebnis && ergebnis.abweichung !== 0 && (
        <p className="mt-2 text-xs text-muted" data-abschlag-angepasst>
          Auf {eur(ergebnis.brutto)} statt {eur(ergebnis.ziel)} angepasst, damit die Umsatzsteuer der Schlussrechnung centgenau aufgeht.
        </p>
      )}
      {ergebnis?.ueberschritten && (
        <p role="alert" className="mt-2 rounded-md bg-tone-amber-bg px-3 py-2 text-sm text-tone-amber-fg">
          Die Abschläge übersteigen den Auftragswert um {eur(-ergebnis.rest)}.
        </p>
      )}
      {!ergebnis && <p className="mt-2 text-sm text-muted">Bitte {k.abschlag_art === "prozent" ? "den Prozentsatz" : "den Betrag"} eingeben.</p>}
    </Karte>
  );
}

/** Textfeld mit Auswahl einer Textvorlage (Symbol neben der Beschriftung); die Vorlage wird in den Beleg kopiert */
function TextMitVorlage({ name, vorlagen, onVorlage, children }: { name: string; vorlagen: Textvorlage[]; onVorlage: (text: string) => void; children: ReactNode }) {
  const [offen, setOffen] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-ink-3">
        <span>{name}</span>
        {vorlagen.length > 0 && (
          <span className="relative">
            <button
              type="button"
              aria-expanded={offen}
              aria-label={`Vorlage für ${name} wählen`}
              data-vorlage-wahl={name}
              onClick={() => setOffen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-0.5 text-xs hover:border-line-strong"
            >
              <FileText className="size-3.5" /> Vorlage
            </button>
            {offen && (
              <ul className="absolute top-full right-0 z-20 mt-1 w-64 rounded-md border border-line bg-surface py-1 shadow-pop" onMouseLeave={() => setOffen(false)}>
                {vorlagen.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted"
                      onClick={() => {
                        onVorlage(v.text);
                        setOffen(false);
                      }}
                    >
                      {v.name}
                      {v.standard && <span className="ml-1.5 text-xs text-muted-2">Standard</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** „+ aus dem Katalog …“: alle Artikel mit Suche; ein Klick fügt die Position an */
function KatalogDialog({ artikel, onWahl }: { artikel: Artikel[]; onWahl: (a: Artikel) => void }) {
  const [offen, setOffen] = useState(false);
  const [q, setQ] = useState("");
  const treffer = artikel.filter((a) => `${a.bezeichnung} ${a.beschreibung_html ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <button type="button" onClick={() => setOffen(true)} data-katalog className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] text-accent-text hover:underline">
        <BookOpen className="size-3.5" /> aus dem Katalog …
      </button>
      <Dialog open={offen} onOpenChange={(o) => (setOffen(o), o || setQ(""))}>
        <DialogContent title="Artikel aus dem Katalog">
          <input autoFocus className={eingabe} placeholder="Artikel suchen …" aria-label="Artikel suchen" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-3 flex max-h-[50vh] flex-col overflow-auto" data-katalog-liste>
            {treffer.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 border-t border-line-soft px-1 py-2 text-left text-sm first:border-t-0 hover:bg-surface-muted"
                  onClick={() => {
                    onWahl(a);
                    setOffen(false);
                    setQ("");
                  }}
                >
                  <span className="min-w-0">
                    <span className="font-medium">{a.bezeichnung}</span>
                    {a.beschreibung_html && <span className="block truncate text-xs text-muted">{htmlZuText(a.beschreibung_html).split("\n")[0]}</span>}
                  </span>
                  <span className="whitespace-nowrap tabular text-muted">{eur(a.preis_netto)} / {a.einheit}</span>
                </button>
              </li>
            ))}
            {!treffer.length && <li className="py-2 text-sm text-muted">Kein Artikel gefunden.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
