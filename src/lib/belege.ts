import "server-only";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import type { Kunde, Lieferadresse } from "@/lib/kunden";
import { heuteBerlin } from "@/lib/zeit";
import { htmlZuText, leerePosition, neuerSchluessel, STANDARD_TEXTE, type EditorZustand, type KopfEingabe, type PositionEingabe } from "./beleg-typen";
import { BELEGART_TEXT, ketteSortiert, type Belegart, type BelegKurz } from "./belege-status";
import type { Steuerart } from "./beleg-summen";

const KURZ = "id, art, nummer, status, datum, kette_id, vorgaenger_id, titel, summe_brutto, gueltig_bis, teil";

export type BelegZeile = BelegKurz & {
  summe_netto: number;
  kunde_id: string | null;
  adresse_name: string | null;
  tags: string[];
  kommentar_intern: string | null;
  anfrage: { id: string; nummer: string; titel: string } | null;
  auftrag: { id: string; nummer: string; titel: string } | null;
  kunde: { id: string; name: string } | null;
  updated_at: string;
  fertiggestellt_am: string | null;
  liefertermin: string | null;
  leistung_von: string | null;
  leistung_bis: string | null;
};

const ZEILE = `${KURZ}, summe_netto, kunde_id, adresse_name, tags, kommentar_intern, updated_at, fertiggestellt_am, liefertermin,
  leistung_von, leistung_bis, anfrage:anfrage_id(id, nummer, titel), auftrag:auftrag_id(id, nummer, titel), kunde:kunde_id(id, name)`;

const zahlen = <T extends { summe_brutto: unknown; summe_netto?: unknown }>(b: T): T => ({
  ...b,
  summe_brutto: Number(b.summe_brutto),
  ...(b.summe_netto !== undefined ? { summe_netto: Number(b.summe_netto) } : {}),
});

/** Belege der gewählten Arten (ohne gelöschte), Entwürfe zuerst, dann neueste */
export async function ladeBelegListe(arten: Belegart[]): Promise<BelegZeile[]> {
  const { supabase } = await pruefeSitzung();
  const { data, error } = await supabase.from("beleg").select(ZEILE).in("art", arten).order("datum", { ascending: false }).limit(2000);
  if (error) throw error;
  return ((data ?? []) as unknown as BelegZeile[]).map(zahlen).sort(
    (a, b) =>
      Number(b.status === "entwurf") - Number(a.status === "entwurf") ||
      b.datum.localeCompare(a.datum) ||
      (b.nummer ?? "").localeCompare(a.nummer ?? ""),
  );
}

/** Anzahl je Belegart (Schnellfilter in „Alle Belege“) */
export async function zaehleBelegarten(): Promise<Record<string, number>> {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("beleg").select("art");
  const z: Record<string, number> = {};
  for (const r of data ?? []) z[r.art] = (z[r.art] ?? 0) + 1;
  return z;
}

export type Position = {
  id: string;
  reihenfolge: number;
  typ: "artikel" | "text";
  titel: string;
  beschreibung_html: string | null;
  optional: boolean;
  menge: number;
  einheit: string | null;
  einzelpreis: number;
  rabatt_prozent: number;
  steuersatz: number;
};

export type Beleg = BelegZeile & {
  adresse_zusatz: string | null;
  adresse_strasse: string | null;
  adresse_plz: string | null;
  adresse_ort: string | null;
  adresse_land: string;
  kundennummer: string | null;
  bauvorhaben: string | null;
  objekt: string | null;
  einleitung: string | null;
  lieferbedingungen: string | null;
  nachbemerkung: string | null;
  zahlungsbedingung_id: string | null;
  zahlungsbedingung_text: string | null;
  zahlungsziel_tage: number | null;
  skontoziel_tage: number | null;
  skonto_prozent: number | null;
  steuerart: Steuerart;
  preise_brutto: boolean;
  gesamtrabatt_prozent: number;
  version: number;
  eingefroren_version: number | null;
  pdf_pfad: string | null;
  lexware_id: string | null;
  lexware_status: string | null;
  created_at: string;
};

export type BelegDetail = {
  beleg: Beleg;
  positionen: Position[];
  kette: BelegZeile[];
  versionen: { version: number; eingefroren_am: string; pdf_pfad: string | null }[];
  versand: { version: number | null; kanal: string; gesendet_am: string }[];
};

export const positionZahlen = (p: Position): Position => ({
  ...p,
  menge: Number(p.menge),
  einzelpreis: Number(p.einzelpreis),
  rabatt_prozent: Number(p.rabatt_prozent),
  steuersatz: Number(p.steuersatz),
});

const POSITION = "id, reihenfolge, typ, titel, beschreibung_html, optional, menge, einheit, einzelpreis, rabatt_prozent, steuersatz";

export async function ladeBeleg(id: string): Promise<BelegDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { supabase } = await pruefeSitzung();
  const { data: b } = await supabase
    .from("beleg")
    .select(`*, anfrage:anfrage_id(id, nummer, titel), auftrag:auftrag_id(id, nummer, titel), kunde:kunde_id(id, name)`)
    .eq("id", id)
    .maybeSingle();
  if (!b) return null;
  const [{ data: pos }, { data: kette }, { data: versionen }, { data: versand }] = await Promise.all([
    supabase.from("beleg_position").select(POSITION).eq("beleg_id", id).order("reihenfolge"),
    supabase.from("beleg").select(ZEILE).eq("kette_id", b.kette_id),
    supabase.from("beleg_version").select("version, eingefroren_am, pdf_pfad").eq("beleg_id", id).order("version", { ascending: false }),
    supabase.from("beleg_versand").select("version, kanal, gesendet_am").eq("beleg_id", id).order("gesendet_am", { ascending: false }),
  ]);
  const beleg = zahlen(b) as unknown as Beleg;
  beleg.gesamtrabatt_prozent = Number(beleg.gesamtrabatt_prozent);
  beleg.skonto_prozent = beleg.skonto_prozent == null ? null : Number(beleg.skonto_prozent);
  return {
    beleg,
    positionen: ((pos ?? []) as Position[]).map(positionZahlen),
    kette: ketteSortiert(((kette ?? []) as unknown as BelegZeile[]).map(zahlen)),
    versionen: versionen ?? [],
    versand: versand ?? [],
  };
}

/** Alle Belege zu einem Auftrag bzw. einer Anfrage, in Kettenfolge */
export async function ladeBelegeZu(bezug: { auftrag_id: string } | { anfrage_id: string }): Promise<BelegZeile[]> {
  const { supabase } = await pruefeSitzung();
  const [spalte, wert] = Object.entries(bezug)[0];
  const { data } = await supabase.from("beleg").select(ZEILE).eq(spalte, wert);
  return ketteSortiert(((data ?? []) as unknown as BelegZeile[]).map(zahlen));
}

export type Firma = {
  firma_name: string | null;
  firma_zusatz: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
  telefon: string | null;
  email: string | null;
  website: string | null;
  ust_id: string | null;
  steuernummer: string | null;
  handelsregister: string | null;
  geschaeftsfuehrung: string | null;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
  angebot_gueltig_tage: number;
};

export async function ladeFirma(): Promise<Firma> {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase
    .from("einstellung")
    .select("firma_name, firma_zusatz, strasse, plz, ort, land, telefon, email, website, ust_id, steuernummer, handelsregister, geschaeftsfuehrung, bank_name, iban, bic, angebot_gueltig_tage")
    .maybeSingle();
  return (data ?? { land: "Deutschland", angebot_gueltig_tage: 30 }) as Firma;
}

export type Zahlungsbedingung = {
  id: string;
  name: string;
  text: string;
  zahlungsziel_tage: number;
  skontoziel_tage: number | null;
  skonto_prozent: number | null;
  belegarten: Belegart[];
  standard_fuer: Belegart[];
};

export async function ladeZahlungsbedingungen(): Promise<Zahlungsbedingung[]> {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("zahlungsbedingung").select("id, name, text, zahlungsziel_tage, skontoziel_tage, skonto_prozent, belegarten, standard_fuer").order("name");
  return ((data ?? []) as Zahlungsbedingung[]).map((z) => ({ ...z, skonto_prozent: z.skonto_prozent == null ? null : Number(z.skonto_prozent) }));
}

/** Daten eines Kunden für den Editor: Adresse, Steuer-Vorbelegung, Objekte, offene Anfragen und Angebote */
export type KundeFuerBeleg = {
  kunde: Kunde;
  lieferadressen: Lieferadresse[];
  objekte: string[];
  anfragen: { id: string; nummer: string; titel: string }[];
  angebote: { id: string; nummer: string; titel: string | null; status: string }[];
};

export async function ladeKundeFuerBeleg(kundeId: string): Promise<KundeFuerBeleg | null> {
  if (!/^[0-9a-f-]{36}$/i.test(kundeId)) return null;
  const { supabase } = await pruefeSitzung();
  const [{ data: kunde }, { data: la }, { data: anfragen }, { data: angebote }] = await Promise.all([
    supabase
      .from("kunde")
      .select("id, nummer, name, typ, bauleister_13b, ansprechpartner, herkunft, strasse, plz, ort, land, telefon, email, notiz, lexware_kontakt_id, lexware_seit")
      .eq("id", kundeId)
      .maybeSingle(),
    supabase.from("kunde_lieferadresse").select("id, bezeichnung, strasse, plz, ort, alt_seit").eq("kunde_id", kundeId).order("reihenfolge"),
    supabase.from("anfrage").select("id, nummer, titel").eq("kunde_id", kundeId).is("archiv", null).order("eingang", { ascending: false }),
    supabase.from("beleg").select("id, nummer, titel, status, kette_id").eq("kunde_id", kundeId).eq("art", "angebot").in("status", ["offen", "angenommen"]).not("anfrage_id", "is", null),
  ]);
  if (!kunde) return null;
  const lieferadressen = (la ?? []) as Lieferadresse[];
  const objekte = lieferadressen
    .filter((a) => !a.alt_seit)
    .map((a) => [a.strasse, [a.plz, a.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "))
    .filter(Boolean);
  return {
    kunde: kunde as Kunde,
    lieferadressen,
    objekte,
    anfragen: anfragen ?? [],
    angebote: (angebote ?? []).filter((a) => a.nummer) as KundeFuerBeleg["angebote"],
  };
}

/** Empfängeradresse, Steuerart und Objekt aus dem Kunden (beim Wählen oder Wechseln des Kunden) */
export function kundeVorbelegung(k: KundeFuerBeleg): Partial<KopfEingabe> {
  const kd = k.kunde;
  return {
    kunde_id: kd.id,
    kunde_name: kd.name,
    kunde_nummer: kd.nummer,
    adresse_name: kd.name,
    adresse_zusatz: kd.typ === "firma" && kd.ansprechpartner ? `z. Hd. ${kd.ansprechpartner}` : "",
    adresse_strasse: kd.strasse ?? "",
    adresse_plz: kd.plz ?? "",
    adresse_ort: kd.ort ?? "",
    adresse_land: kd.land || "Deutschland",
    steuerart: kd.bauleister_13b ? "bauleistung_13b" : "standard",
    objekt: k.objekte[0] ?? "",
  };
}

const s = (v: unknown) => (v == null ? "" : String(v));
const dez = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));

/** Position aus der Datenbank → Eingabezeile */
export function positionZuEingabe(p: Position, mitId: boolean): PositionEingabe {
  return {
    key: mitId ? p.id : neuerSchluessel(),
    id: mitId ? p.id : null,
    typ: p.typ,
    titel: p.titel,
    beschreibung: htmlZuText(p.beschreibung_html),
    optional: p.optional,
    menge: dez(p.menge),
    einheit: p.einheit ?? "",
    einzelpreis: dez(p.einzelpreis),
    rabatt_prozent: p.rabatt_prozent ? dez(p.rabatt_prozent) : "",
    steuersatz: String(p.steuersatz),
  };
}

/** Gespeicherter Beleg → Editor-Zustand */
export function belegZuEingabe(d: BelegDetail): EditorZustand {
  const b = d.beleg;
  const vorgaenger = d.kette.find((x) => x.id === b.vorgaenger_id);
  return {
    kopf: {
      id: b.id,
      art: b.art,
      nummer: b.nummer,
      status: b.status,
      version: b.version,
      vorgaenger_id: b.vorgaenger_id,
      vorgaenger_text: vorgaenger ? `${BELEGART_TEXT[vorgaenger.art]} ${vorgaenger.nummer ?? ""}`.trim() : null,
      kunde_id: b.kunde_id ?? "",
      kunde_name: b.kunde?.name ?? b.adresse_name ?? "",
      kunde_nummer: b.kundennummer ?? "",
      bezug: b.auftrag
        ? { art: "auftrag", id: b.auftrag.id, text: `Auftrag ${b.auftrag.nummer} · ${b.auftrag.titel}` }
        : b.anfrage
          ? { art: "anfrage", id: b.anfrage.id, text: `Anfrage ${b.anfrage.nummer} · ${b.anfrage.titel}` }
          : { art: "keiner", id: null, text: "" },
      adresse_name: s(b.adresse_name),
      adresse_zusatz: s(b.adresse_zusatz),
      adresse_strasse: s(b.adresse_strasse),
      adresse_plz: s(b.adresse_plz),
      adresse_ort: s(b.adresse_ort),
      adresse_land: b.adresse_land || "Deutschland",
      datum: b.datum,
      titel: s(b.titel),
      bauvorhaben: s(b.bauvorhaben),
      objekt: s(b.objekt),
      einleitung: s(b.einleitung),
      lieferbedingungen: s(b.lieferbedingungen),
      nachbemerkung: s(b.nachbemerkung),
      zahlungsbedingung_id: s(b.zahlungsbedingung_id),
      zahlungsbedingung_text: s(b.zahlungsbedingung_text),
      zahlungsziel_tage: s(b.zahlungsziel_tage),
      skontoziel_tage: s(b.skontoziel_tage),
      skonto_prozent: b.skonto_prozent == null ? "" : dez(b.skonto_prozent),
      steuerart: b.steuerart,
      preise_brutto: b.preise_brutto,
      gesamtrabatt_prozent: b.gesamtrabatt_prozent ? dez(b.gesamtrabatt_prozent) : "",
      gueltig_bis: s(b.gueltig_bis),
      liefertermin: s(b.liefertermin),
      leistung_von: s(b.leistung_von),
      leistung_bis: s(b.leistung_bis),
      tags: b.tags ?? [],
      kommentar_intern: s(b.kommentar_intern),
    },
    positionen: d.positionen.map((p) => positionZuEingabe(p, true)),
  };
}

const plusTage = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export type NeuParameter = { art: Belegart; vorgaenger?: string; anfrage?: string; auftrag?: string; kunde?: string; kopie?: string };

/**
 * Neuer Beleg: Vorbelegung aus Vorgänger (Kette: Positionen und Texte), Anfrage, Auftrag oder Kunde,
 * Standard-Zahlungsbedingung und Standardtexte der Belegart.
 */
export async function neuerBelegZustand(p: NeuParameter): Promise<{ zustand: EditorZustand; hinweis?: string } | { fehler: string }> {
  const { supabase } = await pruefeSitzung();
  const heute = heuteBerlin();
  const [firma, bedingungen, { data: vorlagen }] = await Promise.all([
    ladeFirma(),
    ladeZahlungsbedingungen(),
    supabase.from("textvorlage").select("feld, text, belegarten").eq("standard", true),
  ]);
  const vorlage = (feld: string) => (vorlagen ?? []).find((v) => v.feld === feld && (v.belegarten as string[]).includes(p.art))?.text;
  const zb = bedingungen.find((z) => z.standard_fuer.includes(p.art));
  const kopf: KopfEingabe = {
    id: null,
    art: p.art,
    nummer: null,
    status: "entwurf",
    version: 1,
    vorgaenger_id: null,
    vorgaenger_text: null,
    kunde_id: "",
    kunde_name: "",
    kunde_nummer: "",
    bezug: { art: p.art === "angebot" ? "neu" : "keiner", id: null, text: "" },
    adresse_name: "",
    adresse_zusatz: "",
    adresse_strasse: "",
    adresse_plz: "",
    adresse_ort: "",
    adresse_land: "Deutschland",
    datum: heute,
    titel: BELEGART_TEXT[p.art],
    bauvorhaben: "",
    objekt: "",
    einleitung: vorlage("einleitung") ?? STANDARD_TEXTE[p.art]?.einleitung ?? "",
    lieferbedingungen: vorlage("lieferbedingungen") ?? "",
    nachbemerkung: vorlage("nachbemerkung") ?? STANDARD_TEXTE[p.art]?.nachbemerkung ?? "",
    zahlungsbedingung_id: zb?.id ?? "",
    zahlungsbedingung_text: zb?.text ?? "",
    zahlungsziel_tage: zb ? String(zb.zahlungsziel_tage) : "",
    skontoziel_tage: zb?.skontoziel_tage != null ? String(zb.skontoziel_tage) : "",
    skonto_prozent: zb?.skonto_prozent != null ? dez(zb.skonto_prozent) : "",
    steuerart: "standard",
    preise_brutto: false,
    gesamtrabatt_prozent: "",
    gueltig_bis: p.art === "angebot" ? plusTage(heute, firma.angebot_gueltig_tage || 30) : "",
    liefertermin: p.art === "lieferschein" ? heute : "",
    leistung_von: "",
    leistung_bis: "",
    tags: [],
    kommentar_intern: "",
  };
  let positionen: PositionEingabe[] = [];
  let hinweis: string | undefined;
  let kundeId = p.kunde;

  if (p.kopie) {
    // Duplizieren: neuer Entwurf mit allen Positionen und Texten, neue Kette; Kommentar und Tags bleiben
    const q = await ladeBeleg(p.kopie);
    if (!q) return { fehler: "Beleg nicht gefunden." };
    if (q.beleg.art === "abschlagsrechnung") return { fehler: "Abschlagsrechnungen werden nicht dupliziert." };
    const z = belegZuEingabe(q);
    const anfrageOffen = q.beleg.anfrage ? (await supabase.from("anfrage").select("archiv").eq("id", q.beleg.anfrage.id).maybeSingle()).data?.archiv == null : false;
    const kopf2: KopfEingabe = {
      ...z.kopf,
      id: null,
      nummer: null,
      status: "entwurf",
      version: 1,
      vorgaenger_id: null,
      vorgaenger_text: null,
      datum: heute,
      gueltig_bis: kopf.gueltig_bis,
      bezug:
        q.beleg.art === "angebot"
          ? anfrageOffen ? z.kopf.bezug : { art: "neu", id: null, text: "" }
          : q.beleg.art === "lieferschein" ? z.kopf.bezug : { art: "keiner", id: null, text: "" },
    };
    return { zustand: { kopf: { ...kopf2, art: q.beleg.art }, positionen: q.positionen.map((x) => positionZuEingabe(x, false)) }, hinweis: `Kopie von ${BELEGART_TEXT[q.beleg.art]} ${q.beleg.nummer ?? ""}`.trim() };
  }

  if (p.vorgaenger) {
    const v = await ladeBeleg(p.vorgaenger);
    if (!v || v.beleg.status === "entwurf") return { fehler: "Der Vorgängerbeleg ist nicht fertiggestellt." };
    const vb = v.beleg;
    const erlaubt =
      (p.art === "auftragsbestaetigung" && vb.art === "angebot" && ["offen", "angenommen"].includes(vb.status)) ||
      (p.art === "lieferschein" && vb.art === "auftragsbestaetigung");
    if (!erlaubt) return { fehler: `Aus ${BELEGART_TEXT[vb.art]} ${vb.nummer ?? ""} entsteht keine ${BELEGART_TEXT[p.art]}.` };
    if (p.art === "auftragsbestaetigung" && v.kette.some((x) => x.art === "auftragsbestaetigung"))
      return { fehler: "Zu diesem Angebot gibt es schon eine Auftragsbestätigung." };
    kundeId = vb.kunde_id ?? undefined;
    Object.assign(kopf, {
      vorgaenger_id: vb.id,
      vorgaenger_text: `${BELEGART_TEXT[vb.art]} ${vb.nummer ?? ""}`.trim(),
      bezug: vb.auftrag
        ? { art: "auftrag", id: vb.auftrag.id, text: `Auftrag ${vb.auftrag.nummer} · ${vb.auftrag.titel}` }
        : vb.anfrage
          ? { art: "anfrage", id: vb.anfrage.id, text: `Anfrage ${vb.anfrage.nummer} · ${vb.anfrage.titel}` }
          : kopf.bezug,
      adresse_name: s(vb.adresse_name),
      adresse_zusatz: s(vb.adresse_zusatz),
      adresse_strasse: s(vb.adresse_strasse),
      adresse_plz: s(vb.adresse_plz),
      adresse_ort: s(vb.adresse_ort),
      adresse_land: vb.adresse_land,
      bauvorhaben: s(vb.bauvorhaben),
      objekt: s(vb.objekt),
      steuerart: vb.steuerart,
      preise_brutto: vb.preise_brutto,
      gesamtrabatt_prozent: vb.gesamtrabatt_prozent ? dez(vb.gesamtrabatt_prozent) : "",
      titel: vb.titel && vb.titel !== BELEGART_TEXT[vb.art] ? vb.titel : BELEGART_TEXT[p.art],
      lieferbedingungen: p.art === "lieferschein" ? "" : kopf.lieferbedingungen,
    });
    if (p.art === "auftragsbestaetigung" && vb.zahlungsbedingung_text) {
      Object.assign(kopf, {
        zahlungsbedingung_id: s(vb.zahlungsbedingung_id),
        zahlungsbedingung_text: s(vb.zahlungsbedingung_text),
        zahlungsziel_tage: s(vb.zahlungsziel_tage),
        skontoziel_tage: s(vb.skontoziel_tage),
        skonto_prozent: vb.skonto_prozent == null ? "" : dez(vb.skonto_prozent),
      });
    }
    const optionale = v.positionen.filter((x) => x.optional).length;
    positionen = v.positionen.filter((x) => !x.optional).map((x) => positionZuEingabe(x, false));
    if (optionale) hinweis = `${optionale} optionale ${optionale === 1 ? "Position wurde" : "Positionen wurden"} nicht übernommen.`;
  } else if (p.anfrage) {
    const { data: q } = await supabase.from("anfrage").select("id, nummer, titel, kunde_id, objekt, archiv").eq("id", p.anfrage).maybeSingle();
    if (!q) return { fehler: "Anfrage nicht gefunden." };
    if (q.archiv) return { fehler: "Die Anfrage ist archiviert." };
    kundeId = q.kunde_id;
    kopf.bezug = { art: "anfrage", id: q.id, text: `Anfrage ${q.nummer} · ${q.titel}` };
    kopf.titel = q.titel;
    if (q.objekt) kopf.objekt = q.objekt;
  } else if (p.auftrag) {
    const { data: a } = await supabase.from("auftrag").select("id, nummer, titel, kunde_id, objekt").eq("id", p.auftrag).maybeSingle();
    if (!a) return { fehler: "Auftrag nicht gefunden." };
    kundeId = a.kunde_id;
    kopf.bezug = { art: "auftrag", id: a.id, text: `Auftrag ${a.nummer} · ${a.titel}` };
    if (a.titel) kopf.titel = a.titel;
    if (a.objekt) kopf.objekt = a.objekt;
  }

  if (kundeId) {
    const k = await ladeKundeFuerBeleg(kundeId);
    if (k) {
      const vor = kundeVorbelegung(k);
      if (p.vorgaenger) Object.assign(kopf, { kunde_id: vor.kunde_id, kunde_name: vor.kunde_name, kunde_nummer: vor.kunde_nummer });
      else Object.assign(kopf, { ...vor, objekt: kopf.objekt || vor.objekt });
    }
  }
  if (!positionen.length) positionen = [leerePosition()];
  return { zustand: { kopf, positionen }, hinweis };
}


/** Tags aller Belege (Vorschläge) */
export async function ladeBelegTags(): Promise<string[]> {
  const { supabase } = await pruefeSitzung();
  const { data } = await supabase.from("beleg").select("tags").neq("tags", "{}");
  return [...new Set((data ?? []).flatMap((r) => r.tags as string[]))].sort((a, b) => a.localeCompare(b, "de"));
}

export { heuteBerlin };
