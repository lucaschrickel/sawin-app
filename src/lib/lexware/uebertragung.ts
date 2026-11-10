import "server-only";
import { createHash } from "node:crypto";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { BUCKET } from "@/lib/beleg-ablage";
import { belegSummen, rund } from "@/lib/beleg-summen";
import { htmlZuText, zahlungsbedingungFuellen } from "@/lib/beleg-typen";
import { ladeBeleg, type BelegDetail } from "@/lib/belege";
import { BELEGART_TEXT } from "@/lib/belege-status";
import { pdfDateiname } from "@/lib/pdf/beleg-pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import { lexware, LexwareFehler } from "./client";

/*
  Übertragung von Rechnung, Abschlagsrechnung und Gutschrift an Lexware (CLAUDE.md „Lexware-Regeln“).

  Ablauf beim Fertigstellen:
    1. lexware_start (Datenbank): Regeln prüfen, gegen doppelte Übertragung sperren, Abschlagsnummer vergeben
    2. Kontakt sichern: beim ersten Lexware-Beleg des Kunden anlegen, danach Änderungen nur App → Lexware
    3. Beleg mit finalize=true anlegen. Gab es schon einen Versuch (oder kam keine Antwort), sucht die App vorher in
       Lexware nach einem passenden Beleg (Kontakt, Datum, Betrag), damit nichts doppelt angelegt wird
    4. Nummer, Beträge je Steuersatz und Original-PDF von Lexware übernehmen (lexware_fertig)
  Ergebnisse schreibt der Server über die Funktionen lexware_* (nur Service-Rolle); der handelnde Benutzer steht im
  Audit-Log. Im Testkonto geprüfte Grenzen (10.11.2026): Titel 25 Zeichen, Positionstitel 255, Beschreibung,
  Einleitung und Nachbemerkung je 2000, Einzelpreis 4 Nachkommastellen, Einheit Pflicht, Gesamtbetrag nicht negativ.
*/

const LAENDER: Record<string, string> = {
  deutschland: "DE", germany: "DE", österreich: "AT", oesterreich: "AT", austria: "AT", schweiz: "CH", niederlande: "NL",
  belgien: "BE", luxemburg: "LU", frankreich: "FR", dänemark: "DK", daenemark: "DK", polen: "PL", tschechien: "CZ",
  italien: "IT", spanien: "ES",
};
export function landCode(land: string | null | undefined): string {
  const l = (land ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(l)) return l.toUpperCase();
  return LAENDER[l.toLowerCase()] ?? "DE";
}

/** Datum für Lexware: Tagesbeginn in Berlin mit Zeitzone (z. B. 2026-11-10T00:00:00.000+01:00) */
export function lexDatum(iso: string): string {
  const teil = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" })
    .formatToParts(new Date(`${iso}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = teil?.replace("GMT", "") || "+01:00";
  return `${iso}T00:00:00.000${offset === "" ? "+00:00" : offset}`;
}

const plusTage = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const pfadArt = (art: string) => (art === "gutschrift" ? "credit-notes" : "invoices");
const voucherTyp = (art: string) => (art === "gutschrift" ? "creditnote" : "invoice");

// ---------------------------------------------------------------------------------------------------------------------
// Kontakt
// ---------------------------------------------------------------------------------------------------------------------

type KundeLex = {
  id: string;
  nummer: string;
  name: string;
  typ: "privat" | "firma";
  bauleister_13b: boolean;
  ansprechpartner: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
  telefon: string | null;
  email: string | null;
  lexware_kontakt_id: string | null;
  lexware_hash: string | null;
};

function kontaktDaten(k: KundeLex) {
  return {
    roles: { customer: {} },
    ...(k.typ === "firma"
      ? {
          company: {
            name: k.name,
            // § 13b: Lexware nimmt Bauleistungs-Rechnungen nur für Firmenkontakte mit dieser Freigabe an
            allowTaxFreeInvoices: k.bauleister_13b,
            contactPersons: k.ansprechpartner?.trim() ? [{ lastName: k.ansprechpartner.trim().slice(0, 255), primary: true }] : [],
          },
        }
      : { person: { lastName: k.name.slice(0, 255) } }),
    addresses: { billing: [{ street: k.strasse ?? "", zip: k.plz ?? "", city: k.ort ?? "", countryCode: landCode(k.land) }] },
    ...(k.email?.trim() ? { emailAddresses: { business: [k.email.trim()] } } : {}),
    ...(k.telefon?.trim() ? { phoneNumbers: { business: [k.telefon.trim()] } } : {}),
    note: `Kunde ${k.nummer} aus der Sawin-App`,
  };
}

type Kontakt = { id: string; version: number; roles?: unknown; company?: Record<string, unknown>; person?: Record<string, unknown> } & Record<string, unknown>;

/**
 * Kontakt in Lexware sichern: beim ersten Lexware-Beleg anlegen, danach nur bei Änderungen aktualisieren
 * (App → Lexware, nie zurück). Gibt die Lexware-Kontakt-ID zurück.
 */
export async function kontaktSichern(kundeId: string, benutzerId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: k, error } = await admin
    .from("kunde")
    .select("id, nummer, name, typ, bauleister_13b, ansprechpartner, strasse, plz, ort, land, telefon, email, lexware_kontakt_id, lexware_hash")
    .eq("id", kundeId)
    .maybeSingle<KundeLex>();
  if (error || !k) throw new LexwareFehler("Der Kunde wurde nicht gefunden.", 0);
  const daten = kontaktDaten(k);
  const hash = createHash("sha256").update(JSON.stringify(daten)).digest("hex");
  let id = k.lexware_kontakt_id;
  if (!id) {
    const r = await lexware<{ id: string }>("POST", "/v1/contacts", { body: { version: 0, ...daten } });
    id = r.id;
  } else if (k.lexware_hash !== hash) {
    const alt = await lexware<Kontakt>("GET", `/v1/contacts/${id}`);
    const neu: Record<string, unknown> = { ...alt, ...daten, roles: alt.roles ?? daten.roles, version: alt.version };
    if (!daten.emailAddresses) delete neu.emailAddresses;
    if (!daten.phoneNumbers) delete neu.phoneNumbers;
    if ("company" in daten) neu.company = { ...(alt.company ?? {}), ...daten.company };
    await lexware("PUT", `/v1/contacts/${id}`, { body: neu });
  } else {
    return id;
  }
  const { error: e2 } = await admin.rpc("lexware_kunde", { p_kunde: k.id, p_benutzer: benutzerId, p_kontakt_id: id, p_hash: hash });
  if (e2) throw new LexwareFehler("Die Lexware-Kontakt-ID konnte nicht gespeichert werden.", 0);
  return id;
}

/** Nach dem Speichern eines Kunden: bestehenden Lexware-Kontakt aktualisieren (Fehler nur als Hinweis) */
export async function kontaktAktualisieren(kundeId: string): Promise<string | null> {
  const { supabase, benutzer } = await pruefeSitzung();
  const { data } = await supabase.from("kunde").select("lexware_kontakt_id").eq("id", kundeId).maybeSingle();
  if (!data?.lexware_kontakt_id || !process.env.LEXWARE_API_KEY) return null;
  try {
    await kontaktSichern(kundeId, benutzer.id);
    return null;
  } catch (e) {
    return `Der Kunde ist gespeichert, aber Lexware konnte nicht aktualisiert werden (${e instanceof Error ? e.message : "unbekannter Fehler"}). Das wird beim nächsten Lexware-Beleg nachgeholt.`;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Beleg
// ---------------------------------------------------------------------------------------------------------------------

const GRENZEN = { titel: 25, name: 255, beschreibung: 2000, einleitung: 2000, nachbemerkung: 2000 };

/** Einleitung für Lexware: Bauvorhaben und Objekt / Lieferanschrift stehen davor (Lexware hat dafür kein Feld) */
function einleitung(b: BelegDetail["beleg"]): string {
  return [
    b.bauvorhaben ? `Bauvorhaben: ${b.bauvorhaben}` : null,
    b.objekt ? `Objekt / Lieferanschrift: ${b.objekt}` : null,
    b.bauvorhaben || b.objekt ? "" : null,
    b.einleitung ?? null,
  ]
    .filter((x) => x !== null)
    .join("\n")
    .trim();
}

/** Prüft die Grenzen von Lexware vor der Übertragung; gibt eine Meldung zurück oder null */
export function lexwarePruefen(d: BelegDetail): string | null {
  const b = d.beleg;
  const titel = (b.titel ?? BELEGART_TEXT[b.art]).trim();
  if (b.art !== "abschlagsrechnung" && titel.length > GRENZEN.titel) return `Der Belegtitel darf in Lexware höchstens ${GRENZEN.titel} Zeichen haben („${titel}“).`;
  if (einleitung(b).length > GRENZEN.einleitung) return `Einleitung mit Bauvorhaben und Objekt: höchstens ${GRENZEN.einleitung} Zeichen.`;
  if ((b.nachbemerkung ?? "").length > GRENZEN.nachbemerkung) return `Nachbemerkung: höchstens ${GRENZEN.nachbemerkung} Zeichen.`;
  for (const [i, p] of d.positionen.entries()) {
    if (p.titel.length > GRENZEN.name) return `Position ${i + 1}: Der Titel darf höchstens ${GRENZEN.name} Zeichen haben.`;
    if (htmlZuText(p.beschreibung_html).length > GRENZEN.beschreibung) return `Position ${i + 1}: Die Beschreibung darf höchstens ${GRENZEN.beschreibung} Zeichen haben.`;
  }
  if (b.art === "rechnung" && !b.leistung_von) return "Bitte das Leistungsdatum angeben.";
  if (b.summe_brutto < 0) return "Der Gesamtbetrag darf nicht negativ sein. Korrekturen laufen über eine Gutschrift.";
  if (!d.positionen.some((p) => p.typ === "artikel")) return "Der Beleg braucht mindestens eine Position.";
  return null;
}

/** Beleg → Lexware-Rechnung bzw. -Gutschrift */
export function lexwareBeleg(d: BelegDetail, kontaktId: string) {
  const b = d.beleg;
  const frei = b.steuerart !== "standard";
  const brutto = b.preise_brutto && !frei;
  const preisFeld = brutto ? "grossAmount" : "netAmount";
  const taxType = b.steuerart === "bauleistung_13b" ? "constructionService13b" : b.steuerart === "steuerfrei" ? "vatfree" : brutto ? "gross" : "net";
  const hatAbzug = d.positionen.some((p) => p.abzug_beleg_id);
  const gr = b.gesamtrabatt_prozent || 0;

  const zeile = (p: BelegDetail["positionen"][number]) => {
    const text = htmlZuText(p.beschreibung_html);
    if (p.typ === "text") return { type: "text", name: (p.titel.trim() || text.split("\n")[0] || "–").slice(0, 255), description: p.titel.trim() ? text || undefined : text.split("\n").slice(1).join("\n") || undefined };
    return {
      type: "custom",
      name: p.titel.trim(),
      description: text || undefined,
      quantity: p.menge,
      unitName: p.einheit?.trim() || "Stück",
      unitPrice: { currency: "EUR", [preisFeld]: p.einzelpreis, taxRatePercentage: frei ? 0 : p.steuersatz },
      discountPercentage: p.rabatt_prozent || 0,
    };
  };
  const normale = d.positionen.filter((p) => !p.abzug_beleg_id && !p.optional);
  const abzuege = d.positionen.filter((p) => p.abzug_beleg_id);
  const lineItems: Record<string, unknown>[] = normale.map(zeile);

  // Gesamtrabatt: ohne Abzugspositionen als Rabatt des Belegs; mit Abzügen als Minusposition je Satz, damit der
  // Rabatt nicht auch auf die Abzüge wirkt (gleiches Ergebnis wie beleg-summen.ts)
  let totalDiscountPercentage: number | undefined;
  if (gr > 0 && !hatAbzug) totalDiscountPercentage = gr;
  if (gr > 0 && hatAbzug) {
    const s = belegSummen(normale.map((p) => ({ ...p, steuersatz: frei ? 0 : p.steuersatz })), { steuerart: b.steuerart, preise_brutto: b.preise_brutto, gesamtrabatt_prozent: 0 });
    for (const z of s.steuern) {
      const basis = brutto ? z.brutto : z.netto;
      const rabatt = rund(basis - rund(basis * (1 - gr / 100)));
      if (rabatt) lineItems.push({ type: "custom", name: `Gesamtrabatt ${String(gr).replace(".", ",")} %`, quantity: 1, unitName: "pauschal", unitPrice: { currency: "EUR", [preisFeld]: -rabatt, taxRatePercentage: z.satz }, discountPercentage: 0 });
    }
  }
  lineItems.push(...abzuege.map(zeile));

  const leistung =
    b.leistung_von
      ? b.leistung_bis && b.leistung_bis !== b.leistung_von
        ? { shippingDate: lexDatum(b.leistung_von), shippingEndDate: lexDatum(b.leistung_bis), shippingType: "serviceperiod" }
        : { shippingDate: lexDatum(b.leistung_von), shippingType: "service" }
      : null;
  const zb = b.zahlungsbedingung_text
    ? {
        paymentTermLabel: zahlungsbedingungFuellen(b.zahlungsbedingung_text, {
          datum: b.datum,
          brutto: b.summe_brutto,
          zahlungsziel: b.zahlungsziel_tage,
          skontoziel: b.skontoziel_tage,
          skonto: b.skonto_prozent,
        }),
        paymentTermDuration: b.zahlungsziel_tage ?? 0,
        ...(b.skonto_prozent && b.skontoziel_tage != null ? { paymentDiscountConditions: { discountPercentage: b.skonto_prozent, discountRange: b.skontoziel_tage } } : {}),
      }
    : null;

  return {
    voucherDate: lexDatum(b.datum),
    address: {
      contactId: kontaktId,
      name: b.adresse_name ?? b.kunde?.name ?? "",
      ...(b.adresse_zusatz ? { supplement: b.adresse_zusatz } : {}),
      ...(b.adresse_strasse ? { street: b.adresse_strasse } : {}),
      ...(b.adresse_plz ? { zip: b.adresse_plz } : {}),
      ...(b.adresse_ort ? { city: b.adresse_ort } : {}),
      countryCode: landCode(b.adresse_land),
    },
    lineItems,
    totalPrice: { currency: "EUR", ...(totalDiscountPercentage ? { totalDiscountPercentage } : {}) },
    taxConditions: { taxType },
    ...(b.art !== "gutschrift" && zb ? { paymentConditions: zb } : {}),
    ...(leistung ? { shippingConditions: leistung } : b.art !== "gutschrift" ? { shippingConditions: { shippingDate: lexDatum(b.datum), shippingType: "service" } } : {}),
    title: (b.titel ?? BELEGART_TEXT[b.art]).trim().slice(0, 25),
    introduction: einleitung(b) || undefined,
    remark: b.nachbemerkung?.trim() || undefined,
  };
}

type LexBeleg = {
  id: string;
  voucherNumber: string;
  voucherStatus: string;
  voucherDate: string;
  totalPrice: { totalNetAmount: number; totalGrossAmount: number; totalTaxAmount: number };
  taxAmounts?: { taxRatePercentage: number; taxAmount: number; netAmount: number }[];
};

/** Schon angelegten Beleg in Lexware suchen (gleicher Kontakt, gleiches Datum, gleicher Betrag, noch keinem Beleg zugeordnet) */
async function vorhandenSuchen(d: BelegDetail, kontaktId: string, seit: string): Promise<string | null> {
  const b = d.beleg;
  const liste = await lexware<{ content: { id: string; voucherDate: string; totalAmount: number; voucherStatus: string }[] }>(
    "GET",
    `/v1/voucherlist?voucherType=${voucherTyp(b.art)}&voucherStatus=any&contactId=${kontaktId}&createdDateFrom=${seit}&size=50&sort=createdDate,DESC`,
  );
  const kandidaten = liste.content.filter((v) => v.voucherStatus !== "draft" && v.voucherDate.slice(0, 10) === b.datum && rund(v.totalAmount) === rund(b.summe_brutto));
  if (!kandidaten.length) return null;
  const admin = createAdminClient();
  const { data: belegt } = await admin.from("beleg").select("lexware_id").in("lexware_id", kandidaten.map((v) => v.id));
  const frei = kandidaten.filter((v) => !(belegt ?? []).some((x) => x.lexware_id === v.id));
  return frei[0]?.id ?? null;
}

/** Original-PDF von Lexware holen und im Speicher „belege“ ablegen; gibt den Pfad zurück */
async function pdfHolen(b: { id: string; art: BelegDetail["beleg"]["art"]; lexware_id: string; nummer: string }): Promise<string> {
  const { supabase } = await pruefeSitzung();
  const pdf = await lexware<Buffer>("GET", `/v1/${pfadArt(b.art)}/${b.lexware_id}/file`, { accept: "application/pdf" });
  const pfad = `${b.id}/${pdfDateiname({ art: b.art, nummer: b.nummer, version: 1 })}`;
  const { error } = await supabase.storage.from(BUCKET).upload(pfad, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error("Das PDF konnte nicht abgelegt werden.");
  return pfad;
}

/** Fehlendes Original-PDF nachladen (Belegseite, PDF-Ansicht) */
export async function lexwarePdfNachladen(d: BelegDetail): Promise<string | null> {
  const b = d.beleg;
  if (!b.lexware_id || !b.nummer || b.status === "entwurf") return null;
  const { benutzer } = await pruefeSitzung();
  const pfad = await pdfHolen({ id: b.id, art: b.art, lexware_id: b.lexware_id, nummer: b.nummer });
  await createAdminClient().rpc("lexware_pdf", { p_id: b.id, p_benutzer: benutzer.id, p_pfad: pfad });
  return pfad;
}

export type Uebertragung = { ok: true; nummer: string; hinweis?: string } | { ok: false; fehler: string };

/** Beleg an Lexware übertragen (nach dem Bestätigungsdialog). Fehler werden am Beleg gespeichert und angezeigt. */
export async function anLexwareUebertragen(id: string): Promise<Uebertragung> {
  const { benutzer } = await pruefeSitzung();
  let d = await ladeBeleg(id);
  if (!d) return { ok: false, fehler: "Beleg nicht gefunden." };
  const pruefung = lexwarePruefen(d);
  if (pruefung) return { ok: false, fehler: pruefung };
  if (!process.env.LEXWARE_API_KEY?.trim()) return { ok: false, fehler: "Die Lexware-Anbindung ist nicht eingerichtet." };

  const admin = createAdminClient();
  const versuchVorher = d.beleg.lexware_versuch_am;
  const { data: start, error } = await admin.rpc("lexware_start", { p_id: id, p_benutzer: benutzer.id });
  if (error) return { ok: false, fehler: error.message || "Die Übertragung konnte nicht beginnen." };
  const frueher = (start as { frueher_versucht: boolean }).frueher_versucht;

  try {
    d = (await ladeBeleg(id))!;
    const b = d.beleg;
    const kontaktId = await kontaktSichern(b.kunde_id!, benutzer.id);
    const vorgaenger = d.kette.find((x) => x.id === b.vorgaenger_id);
    let vorgaengerLex: string | null = null;
    if (b.art === "gutschrift") {
      const { data } = await admin.from("beleg").select("lexware_id").eq("id", b.vorgaenger_id!).maybeSingle();
      vorgaengerLex = data?.lexware_id ?? null;
      if (!vorgaengerLex) throw new LexwareFehler(`${vorgaenger ? BELEGART_TEXT[vorgaenger.art] : "Der Vorgänger"} liegt nicht in Lexware.`, 0);
    }
    const seit = (versuchVorher ?? new Date().toISOString()).slice(0, 10);
    let lexId = frueher ? await vorhandenSuchen(d, kontaktId, seit) : null;
    if (!lexId) {
      const pfad = `/v1/${pfadArt(b.art)}?finalize=true${vorgaengerLex ? `&precedingSalesVoucherId=${vorgaengerLex}` : ""}`;
      try {
        lexId = (await lexware<{ id: string }>("POST", pfad, { body: lexwareBeleg(d, kontaktId) })).id;
      } catch (e) {
        if (e instanceof LexwareFehler && e.vielleichtAngelegt) lexId = await vorhandenSuchen(d, kontaktId, seit);
        if (!lexId) throw e;
      }
    }
    const v = await lexware<LexBeleg>("GET", `/v1/${pfadArt(b.art)}/${lexId}`);
    let pdfPfad: string | null = null;
    try {
      pdfPfad = await pdfHolen({ id: b.id, art: b.art, lexware_id: lexId, nummer: v.voucherNumber });
    } catch {
      // PDF wird beim Öffnen nachgeladen
    }
    const steuern = (v.taxAmounts ?? []).map((t) => ({ satz: t.taxRatePercentage, netto: t.netAmount, steuer: t.taxAmount, brutto: rund(t.netAmount + t.taxAmount) }));
    const daten = {
      lexware_id: lexId,
      nummer: v.voucherNumber,
      summe_netto: v.totalPrice.totalNetAmount,
      summe_brutto: v.totalPrice.totalGrossAmount,
      steuern,
      faellig_am: b.art === "gutschrift" ? null : plusTage(b.datum, b.zahlungsziel_tage ?? 0),
      pdf_pfad: pdfPfad,
    };
    let fertig = await admin.rpc("lexware_fertig", { p_id: id, p_benutzer: benutzer.id, p_daten: daten });
    if (fertig.error) fertig = await admin.rpc("lexware_fertig", { p_id: id, p_benutzer: benutzer.id, p_daten: daten });
    if (fertig.error)
      return { ok: false, fehler: `In Lexware als ${v.voucherNumber} angelegt, aber die App konnte das Ergebnis nicht speichern. Bitte „Fertigstellen“ erneut klicken; die App übernimmt dann den vorhandenen Beleg.` };
    const hinweise: string[] = [];
    if (rund(v.totalPrice.totalGrossAmount) !== rund(b.summe_brutto))
      hinweise.push(`Lexware rechnet ${v.totalPrice.totalGrossAmount.toFixed(2).replace(".", ",")} €, die App hatte ${b.summe_brutto.toFixed(2).replace(".", ",")} €. Maßgeblich ist der Lexware-Beleg.`);
    if (!pdfPfad) hinweise.push("Das Original-PDF wird nachgeladen, sobald Lexware es bereitstellt.");
    return { ok: true, nummer: v.voucherNumber, hinweis: hinweise.join(" ") || undefined };
  } catch (e) {
    const meldung = e instanceof Error ? e.message : "Unbekannter Fehler bei der Übertragung an Lexware.";
    await admin.rpc("lexware_fehler", { p_id: id, p_benutzer: benutzer.id, p_fehler: meldung });
    return { ok: false, fehler: `Lexware: ${meldung}` };
  }
}
