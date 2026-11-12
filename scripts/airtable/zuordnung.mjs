// Zuordnung Airtable → App (docs/airtable-uebernahme.md). Reine Rechenlogik ohne Netz und Datenbank, damit sie
// prüfbar ist (tests/unit/airtable-zuordnung.test.ts). Ergebnis ist ein „Plan“: Zeilen je App-Tabelle mit airtable_id
// und Verweisen (_kunde, _auftrag …) auf andere airtable_ids; die Datenbank-IDs setzt erst das Import-Skript.

import { kontaktHash } from "../../src/lib/lexware/kontakt-daten.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------------------------------

/** Einzeiliger Text (Airtable speichert viele Felder mehrzeilig) */
export const einzeilig = (v) =>
  String(v ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** Mehrzeiliger Text, Markdown-Reste aus Rich-Text-Feldern („\-“, „**“) entfernt; nur „-“ gilt als leer */
export const mehrzeilig = (v) => {
  const s = String(v ?? "")
    .replace(/\r/g, "")
    .replace(/\\([-*_#>`[\]().!])/g, "$1")
    .replace(/\*\*/g, "")
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z && z !== "-")
    .join("\n")
    .trim();
  return s || null;
};

const erstes = (v) => (Array.isArray(v) ? v[0] : v) ?? null;
const rund = (n) => Math.round(Number(n) * 100) / 100;

/** PLZ: Airtable speichert sie als Zahl, führende Null geht verloren */
export const plz = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  return /^\d{4}$/.test(s) ? `0${s}` : s;
};

const LAND = { DE: "Deutschland", AT: "Österreich", CH: "Schweiz", NL: "Niederlande" };
const land = (v) => LAND[einzeilig(v).toUpperCase()] ?? (einzeilig(v) || "Deutschland");

const ANREDE = { herr: "Herr", "hr.": "Herr", hr: "Herr", frau: "Frau", fam: "Familie", "fam.": "Familie", familie: "Familie", eheleute: "Eheleute", "ehel.": "Eheleute", ehel: "Eheleute", "dr.": "Dr." };
export const anrede = (v) => ANREDE[einzeilig(v).toLowerCase()] ?? null;

const PRODUKT = { "Haustür": "Haustür", Fenster: "Fenster", Garagentor: "Garagentor", "Rolläden - Beschattung": "Rollläden", Insektenschutz: "Insektenschutz" };
const produkte = (f) => Object.entries(PRODUKT).filter(([feld]) => f[feld]).map(([, p]) => p);

const PHASE = { Bestellung: "bestellung", Montage: "montage", Abnahme: "abnahme", "Baustelle fertig": "baustelle_fertig", Reklamation: "reklamation", Abgeschlossen: "abgeschlossen" };
const MONTAGE = { Offen: "nicht_begonnen", "Nicht begonnen": "nicht_begonnen", Bereit: "bereit", "In Arbeit": "in_arbeit", "Teilweise abgeschlossen": "teilweise_abgeschlossen", Abgeschlossen: "abgeschlossen" };
const ART = { Angebot: "angebot", "Auftragsbestätigung": "auftragsbestaetigung", Lieferschein: "lieferschein", Abschlagsrechnung: "abschlagsrechnung", Rechnung: "rechnung", Rechnungskorrektur: "gutschrift" };
const LEXWARE_ARTEN = ["rechnung", "abschlagsrechnung", "gutschrift"];
const AUFGABE_STATUS = { Offen: "offen", "In Arbeit": "in_arbeit", "Wartet auf Zulieferer": "wartet_zulieferer", "Wartet auf Kunde": "wartet_kunde", Erledigt: "erledigt" };
const PRIO = { Hoch: "hoch", Normal: "normal", Niedrig: "niedrig" };
/** Kürzel ohne Rücksicht auf Groß-/Kleinschreibung zählen (BE, Ino, INO …) */
const kuerzelName = (k) => (k.length <= 2 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1).toLowerCase());
const BESTELLT = ["Bestellt", "Teilweise bestellt", "Teilweise geliefert", "Abgeschlossen"];

const plusTage = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const tag = (ts) => (ts ? String(ts).slice(0, 10) : null);
const datumDe = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
/** ISO-Kalenderwoche */
export function kw(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  const t = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - t + 3);
  const erste = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - erste) / 864e5 - 3 + ((erste.getUTCDay() + 6) % 7)) / 7);
}

/** Steuersatz und Steuerart aus netto/brutto (Airtable kennt nur die Summen) */
export function steuer(netto, brutto) {
  const n = rund(netto ?? 0);
  const b = rund(brutto ?? n);
  if (!n) return { steuerart: "standard", steuern: [], satz: null };
  if (b === n) return { steuerart: "bauleistung_13b", steuern: [{ satz: 0, netto: n, steuer: 0, brutto: b }], satz: 0 };
  const quote = b / n - 1;
  const satz = [19, 7, 16, 5].find((s) => Math.abs(quote * 100 - s) < 0.05) ?? null;
  return { steuerart: "standard", steuern: [{ satz: satz ?? 19, netto: n, steuer: rund(b - n), brutto: b }], satz };
}

/**
 * „Lieferung KW“ zerlegen: „BE KW 38, Ino KW 42, BE(Fensterbank) KW 41“ → [{ kuerzel: "BE", zusatz: null, kw: 38 }, …].
 * Teile ohne erkennbare KW kommen als { rest }.
 */
export function lieferungZerlegen(text) {
  const teile = [];
  for (const roh of String(text ?? "").split(/[,;\n]/)) {
    const s = roh.trim();
    if (!s) continue;
    const m = /^(.*?)\s*KW\s*(\d{1,2})\s*$/i.exec(s);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 53) {
      teile.push({ rest: s });
      continue;
    }
    const k = m[1].trim();
    const zusatz = /\(([^)]*)\)/.exec(k)?.[1]?.trim() || null;
    teile.push({ kuerzel: k.replace(/\(.*\)/, "").replace(/[!?.:]+$/, "").trim(), zusatz, kw: Number(m[2]) });
  }
  return teile;
}

/** Jahr der Liefer-KW: das Jahr der Erfassung, bei einer deutlich früheren KW das Folgejahr */
export const lieferJahr = (woche, erfasst) => {
  const jahr = Number(erfasst.slice(0, 4));
  return woche < kw(erfasst) - 8 ? jahr + 1 : jahr;
};

// ---------------------------------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------------------------------

/**
 * @param {object} p
 * @param {Record<string, {id: string, fields: Record<string, any>, createdTime?: string}[]>} p.daten Airtable-Tabellen
 * @param {Map<string, string>} p.benutzer E-Mail (klein) → Benutzer-ID der App
 * @param {Map<string, string>} p.lieferanten Lieferantenkürzel (klein) → Lieferanten-ID der App
 * @param {{ drive_id: string | null, angebot_gueltig_tage: number }} p.einstellung
 * @param {string} p.heute ISO-Datum
 */
export function planen({ daten, benutzer, lieferanten, einstellung, heute }) {
  const probleme = [];
  const problem = (tabelle, id, nummer, text) => probleme.push({ tabelle, id, nummer, text });
  const hinweise = { benutzerFehlt: new Map(), kuerzel: new Map(), steuer0: [], stornoListe: [] };
  const benutzerVon = (wer) => {
    const c = erstes(wer);
    if (!c) return null;
    const id = benutzer.get(String(c.email ?? "").toLowerCase());
    if (!id) hinweise.benutzerFehlt.set(c.name ?? c.email, (hinweise.benutzerFehlt.get(c.name ?? c.email) ?? 0) + 1);
    return id ?? null;
  };

  // ---------- Kunden ----------
  const kunden = [];
  const lieferadressen = [];
  const kundeNachId = new Map();
  const kundeNachLex = new Map();
  for (const r of daten.Kunden ?? []) {
    const f = r.fields;
    const firma = einzeilig(f.Firmenname);
    const typ = firma ? "firma" : "privat";
    const person = einzeilig(`${f.Vorname ?? ""} ${f.Nachname ?? ""}`);
    const name = firma || person || einzeilig(f.Kontakt) || `Kunde ${f.Kundennummer}`;
    const ap = [];
    if (firma && person) ap.push(einzeilig(`${["Herr", "Frau"].includes(anrede(f.Anrede)) ? anrede(f.Anrede) : ""} ${person}`));
    for (const n of [1, 2]) {
      const apName = einzeilig(f[`Ansprechpartner ${n}`]) || einzeilig(`${f[`Ansprechpartner ${n} Vorname`] ?? ""} ${f[`Ansprechpartner ${n} Nachname`] ?? ""}`);
      if (!apName) continue;
      const a = anrede(f[`Ansprechpartner ${n} Anrede`]);
      ap.push([einzeilig(`${a === "Herr" || a === "Frau" ? a : ""} ${apName}`), einzeilig(f[`Ansprechpartner ${n} Telefon`]), einzeilig(f[`Ansprechpartner ${n} E-Mail`])].filter(Boolean).join(" · "));
    }
    const notiz = [
      einzeilig(f["Adresszusatz 1"]) && `Adresszusatz: ${einzeilig(f["Adresszusatz 1"])}`,
      einzeilig(f["Telefon 2"]) && `Telefon 2: ${einzeilig(f["Telefon 2"])}`,
      einzeilig(f["E-Mail 2"]) && `E-Mail 2: ${einzeilig(f["E-Mail 2"])}`,
    ].filter(Boolean);
    const k = {
      airtable_id: r.id,
      nummer: String(f.Kundennummer),
      name,
      typ,
      anrede: typ === "privat" ? anrede(f.Anrede) : null,
      bauleister_13b: false,
      ansprechpartner: ap.join("; ") || null,
      herkunft: null,
      strasse: einzeilig(f["Straße 1"]) || null,
      plz: plz(f["PLZ 1"]),
      ort: einzeilig(f["Ort 1"]) || null,
      land: land(f["Land 1"]),
      telefon: einzeilig(f["Telefon 1"]) || null,
      email: einzeilig(f["E-Mail 1"]).toLowerCase() || null,
      notiz: notiz.join("\n") || null,
      lexware_kontakt_id: einzeilig(f["Lexware Contact ID"]) || null,
      lexware_seit: f.Erstellt ?? r.createdTime ?? null,
      altbestand: true,
      created_at: f.Erstellt ?? r.createdTime ?? null,
    };
    k.lexware_hash = k.lexware_kontakt_id ? kontaktHash(k) : null;
    if (!k.lexware_kontakt_id) k.altbestand = false;
    kunden.push(k);
    kundeNachId.set(r.id, k);
    if (k.lexware_kontakt_id) kundeNachLex.set(k.lexware_kontakt_id, k);
    const s2 = einzeilig(f["Straße 2"]);
    const o2 = einzeilig(f["Ort 2"]);
    if ((s2 || o2) && !(s2 === k.strasse && o2 === k.ort))
      lieferadressen.push({ airtable_id: `${r.id}:lieferadresse`, _kunde: r.id, bezeichnung: einzeilig(f["Adresszusatz 2"]) || "Lieferadresse", strasse: s2 || null, plz: plz(f["PLZ 2"]), ort: o2 || null, reihenfolge: 1 });
  }

  // ---------- Belege und Ketten ----------
  const belegeRoh = (daten.Belege ?? []).filter((r) => {
    if (r.fields["Gelöscht in Lexware"]) {
      problem("Belege", r.id, r.fields.Belegnummer, "In Lexware gelöscht – nicht übernommen");
      return false;
    }
    if (!ART[r.fields.Belegart]) {
      problem("Belege", r.id, r.fields.Belegnummer, `Unbekannte Belegart „${r.fields.Belegart}“`);
      return false;
    }
    return true;
  });
  const nachLex = new Map(belegeRoh.map((r) => [einzeilig(r.fields["Lexware-Beleg-ID"]), r]));
  const vorgaengerVon = (r) =>
    String(r.fields["Vorgänger-IDs"] ?? "")
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map((id) => nachLex.get(id))
      .filter((x) => x && x.id !== r.id);
  const eltern = new Map(belegeRoh.map((r) => [r.id, r.id]));
  const wurzel = (x) => (eltern.get(x) === x ? x : (eltern.set(x, wurzel(eltern.get(x))), eltern.get(x)));
  for (const r of belegeRoh) for (const v of vorgaengerVon(r)) eltern.set(wurzel(r.id), wurzel(v.id));
  const ketten = new Map();
  for (const r of belegeRoh) {
    const k = wurzel(r.id);
    if (!ketten.has(k)) ketten.set(k, []);
    ketten.get(k).push(r);
  }

  const kundeVonBeleg = (r) => kundeNachId.get(erstes(r.fields.Kunde)) ?? kundeNachLex.get(einzeilig(r.fields["Lexware-Kontakt-ID"])) ?? null;
  const art = (r) => ART[r.fields.Belegart];
  const fertig = (r) => r.fields.Status !== "Entwurf";

  // ---------- Vorgänge: Airtable-Aufträge ----------
  const auftraege = [];
  const anfragen = [];
  /** Airtable-Auftrag → { typ: "auftrag" | "anfrage", key } */
  const vorgang = new Map();
  const abNummern = new Set();
  const auftragsDaten = new Map((daten["Aufträge"] ?? []).map((a) => [a.id, a]));
  const belegeVonAuftrag = new Map();
  for (const kette of ketten.values()) {
    const links = [...new Set(kette.flatMap((r) => r.fields.Auftrag ?? []))].filter((id) => auftragsDaten.has(id));
    if (links.length > 1) problem("Belege", kette[0].id, kette[0].fields.Belegnummer, `Kette hängt an ${links.length} Aufträgen – der erste gilt`);
    if (links[0]) belegeVonAuftrag.set(links[0], [...(belegeVonAuftrag.get(links[0]) ?? []), ...kette]);
  }

  for (const a of daten["Aufträge"] ?? []) {
    const f = a.fields;
    const kundeKey = erstes(f.Kunden);
    if (!kundeNachId.has(kundeKey)) {
      problem("Aufträge", a.id, f["AB-Nr."] ?? f["Laufende Nr."], "Kein Kunde – nicht übernommen");
      continue;
    }
    const erfasst = tag(f.Erstellt ?? a.createdTime) ?? heute;
    const bs = belegeVonAuftrag.get(a.id) ?? [];
    const abNr = einzeilig(f["AB-Nr."]);
    const prod = produkte(f);
    const montage = f.Montagebeginn ? `Montage laut Airtable: ${datumDe(tag(f.Montagebeginn))}${f.Montageende ? `–${datumDe(tag(f.Montageende))}` : ""}, bitte im Montageplan einplanen.` : null;
    const istAuftrag = !!abNr || !f.Status || !!PHASE[f.Status];
    if (istAuftrag) {
      if (abNr && abNummern.has(abNr)) {
        problem("Aufträge", a.id, abNr, "AB-Nummer doppelt – nicht übernommen");
        continue;
      }
      if (abNr) abNummern.add(abNr);
      const hinweis = [
        !abNr && "Aus Airtable ohne Auftragsbestätigung übernommen: Die AB bitte am Auftrag erstellen (die Nummer steht fest).",
        montage,
      ].filter(Boolean);
      auftraege.push({
        airtable_id: a.id,
        nummer: abNr || null,
        _kunde: kundeKey,
        titel: prod.join(", ") || null,
        phase: PHASE[f.Status] ?? "bestellung",
        montagestatus: MONTAGE[f.Montagestatus] ?? "nicht_begonnen",
        zustaendig_id: benutzerVon(f.Mitarbeiter),
        produkte: prod,
        bemerkung: mehrzeilig(f.Bemerkung),
        noch_nicht_bestellt: mehrzeilig(f["Noch nicht bestellte Artikel"]),
        pruefhinweis: hinweis.join(" ") || null,
        warten_auf_kunde: false,
        created_at: f.Erstellt ?? a.createdTime ?? null,
        _erfasst: erfasst,
        _bestellstatus: f.Bestellstatus ?? null,
        _lieferung: einzeilig(f["Lieferung KW"]) || null,
        _bestellt: mehrzeilig(f["Bestelle Artikel"]),
      });
      vorgang.set(a.id, { typ: "auftrag", key: a.id });
    } else {
      const angebote = bs.filter((r) => art(r) === "angebot");
      anfragen.push({
        airtable_id: a.id,
        titel: anfrageTitel(angebote, prod, f["Laufende Nr."]),
        _kunde: kundeKey,
        produkte: prod,
        zustaendig_id: benutzerVon(f.Mitarbeiter),
        notiz: [mehrzeilig(f.Bemerkung), montage].filter(Boolean).join("\n") || null,
        eingang: erfasst,
        ...anfrageStand(angebote),
        created_at: f.Erstellt ?? a.createdTime ?? null,
      });
      vorgang.set(a.id, { typ: "anfrage", key: a.id });
    }
  }

  // ---------- Vorgänge: Ketten ohne Airtable-Auftrag (vor Airtable) ----------
  /** Kette (Wurzel) → { typ, key } bzw. null = nur am Kunden */
  const ketteVorgang = new Map();
  for (const [w, kette] of ketten) {
    const link = [...new Set(kette.flatMap((r) => r.fields.Auftrag ?? []))].find((id) => vorgang.has(id));
    if (link) {
      ketteVorgang.set(w, vorgang.get(link));
      continue;
    }
    const kunde = kundeVonBeleg(kette.find((r) => kundeVonBeleg(r)) ?? kette[0]);
    if (!kunde) {
      ketteVorgang.set(w, null);
      continue;
    }
    const ab = kette.find((r) => art(r) === "auftragsbestaetigung" && fertig(r));
    const rechnungen = kette.filter((r) => LEXWARE_ARTEN.includes(art(r)));
    if (ab) {
      const nr = einzeilig(ab.fields.Belegnummer);
      if (abNummern.has(nr)) {
        problem("Belege", ab.id, nr, "AB-Nummer schon an einem Airtable-Auftrag – Kette nur am Kunden");
        ketteVorgang.set(w, null);
        continue;
      }
      abNummern.add(nr);
      const gueltig = rechnungen.filter((r) => r.fields.Status !== "Storniert" && fertig(r));
      const fertigAbgerechnet = gueltig.some((r) => art(r) === "rechnung") && gueltig.every((r) => r.fields.Status === "Bezahlt");
      auftraege.push({
        airtable_id: `kette:${ab.id}`,
        nummer: nr,
        _kunde: kunde.airtable_id,
        titel: einzeilig(ab.fields.Titel) && einzeilig(ab.fields.Titel) !== "Auftragsbestätigung" ? einzeilig(ab.fields.Titel) : null,
        phase: fertigAbgerechnet ? "abgeschlossen" : "bestellung",
        montagestatus: fertigAbgerechnet ? "abgeschlossen" : "nicht_begonnen",
        zustaendig_id: null,
        produkte: [],
        bemerkung: null,
        noch_nicht_bestellt: null,
        pruefhinweis: fertigAbgerechnet ? null : "Aus Lexware übernommen (ohne Airtable-Auftrag): Phase und Stand bitte prüfen.",
        warten_auf_kunde: false,
        created_at: `${ab.fields.Belegdatum}T12:00:00Z`,
        _erfasst: ab.fields.Belegdatum,
      });
      ketteVorgang.set(w, { typ: "auftrag", key: `kette:${ab.id}` });
    } else if (!rechnungen.length && kette.some((r) => art(r) === "angebot")) {
      const angebote = kette.filter((r) => art(r) === "angebot");
      const erstes_ = [...angebote].sort((x, y) => x.fields.Belegdatum.localeCompare(y.fields.Belegdatum))[0];
      anfragen.push({
        airtable_id: `kette:${erstes_.id}`,
        titel: anfrageTitel(angebote, [], null),
        _kunde: kunde.airtable_id,
        produkte: [],
        zustaendig_id: null,
        notiz: "Aus Lexware übernommen (Angebot ohne Airtable-Auftrag).",
        eingang: erstes_.fields.Belegdatum,
        ...anfrageStand(angebote),
        created_at: `${erstes_.fields.Belegdatum}T12:00:00Z`,
      });
      ketteVorgang.set(w, { typ: "anfrage", key: `kette:${erstes_.id}` });
    } else {
      ketteVorgang.set(w, null);
    }
  }

  // ---------- Belege ----------
  const belege = [];
  // Vorgänge, an denen eine AB hängt (auch als Entwurf): dort ist das Angebot der AB-Kette angenommen
  const vorgangMitAb = new Set();
  for (const [w, kette] of ketten) if (ketteVorgang.get(w) && kette.some((r) => art(r) === "auftragsbestaetigung")) vorgangMitAb.add(ketteVorgang.get(w).key);
  for (const [w, kette] of ketten) {
    const v = ketteVorgang.get(w) ?? null;
    // Reihenfolge: Vorgänger vor Nachfolger, sonst nach Datum
    const sortiert = [...kette].sort((x, y) => x.fields.Belegdatum.localeCompare(y.fields.Belegdatum) || String(x.fields.Belegnummer).localeCompare(String(y.fields.Belegnummer)));
    const abschlaege = sortiert.filter((r) => art(r) === "abschlagsrechnung");
    const rechnungenGueltig = sortiert.filter((r) => art(r) === "rechnung" && fertig(r) && r.fields.Status !== "Storniert");
    const schluss = v?.typ === "auftrag" ? (rechnungenGueltig.filter((r) => r.fields.Schlussrechnung).at(-1) ?? rechnungenGueltig.at(-1) ?? null) : null;
    const ordnung = [];
    const gesehen = new Set();
    const besuchen = (r) => {
      if (gesehen.has(r.id)) return;
      gesehen.add(r.id);
      for (const x of vorgaengerVon(r)) if (kette.includes(x)) besuchen(x);
      ordnung.push(r);
    };
    for (const r of sortiert) besuchen(r);
    const wurzelBeleg = ordnung[0];
    for (const r of ordnung) {
      const f = r.fields;
      const a = art(r);
      const kunde = kundeVonBeleg(r) ?? kundeVonBeleg(kette.find((x) => kundeVonBeleg(x)) ?? r);
      if (!kunde) {
        problem("Belege", r.id, f.Belegnummer, "Kein Kunde (weder verknüpft noch über die Lexware-Kontakt-ID) – nicht übernommen");
        continue;
      }
      const st = steuer(f["Betrag netto"], f["Betrag brutto"]);
      if (st.satz === 0) hinweise.steuer0.push(`${f.Belegnummer} (${f.Belegart})`);
      if (st.satz === null && st.steuern.length) problem("Belege", r.id, f.Belegnummer, "Steuersatz nicht erkennbar – 19 % angenommen");
      let status;
      if (a === "angebot") {
        status = { Entwurf: "entwurf", Offen: "offen", Angenommen: "angenommen", Abgelehnt: "abgelehnt" }[f.Status] ?? "offen";
        // Am Auftrag: das Angebot der AB-Kette (bzw. ohne AB das einzige) ist angenommen, weitere Varianten nicht beauftragt
        if (status === "offen" && v?.typ === "auftrag") status = kette.some((x) => art(x) === "auftragsbestaetigung") || !vorgangMitAb.has(v.key) ? "angenommen" : "nicht_beauftragt";
      } else if (LEXWARE_ARTEN.includes(a)) {
        status = { Entwurf: "entwurf", Offen: "offen", "Überfällig": "offen", Bezahlt: "bezahlt", Ausgeglichen: "bezahlt", Storniert: "storniert" }[f.Status] ?? "offen";
        if (status === "storniert") hinweise.stornoListe.push(f.Belegnummer);
      } else {
        status = f.Status === "Entwurf" ? "entwurf" : "fertiggestellt";
      }
      const vg = vorgaengerVon(r).find((x) => kette.includes(x) && x.id !== r.id);
      const offen = LEXWARE_ARTEN.includes(a) && status !== "entwurf" ? (status === "offen" ? rund(f["Offener Betrag"] ?? f["Betrag brutto"] ?? 0) : 0) : null;
      const nummer = status === "entwurf" && a !== "angebot" ? null : einzeilig(f.Belegnummer) || null;
      belege.push({
        airtable_id: r.id,
        art: a,
        nummer,
        status,
        _wurzel: r.id === wurzelBeleg.id ? null : wurzelBeleg.id,
        _vorgaenger: vg?.id ?? null,
        _anfrage: v?.typ === "anfrage" ? v.key : null,
        _auftrag: v?.typ === "auftrag" ? v.key : null,
        _kunde: kunde.airtable_id,
        adresse_name: kunde.name,
        adresse_strasse: kunde.strasse,
        adresse_plz: kunde.plz,
        adresse_ort: kunde.ort,
        adresse_land: kunde.land,
        kundennummer: kunde.nummer,
        datum: f.Belegdatum,
        titel: einzeilig(f.Titel) || null,
        steuerart: st.steuerart,
        preise_brutto: st.steuerart === "standard" && kunde.typ === "privat",
        gesamtrabatt_prozent: 0,
        gueltig_bis: a === "angebot" ? plusTage(f.Belegdatum, einstellung.angebot_gueltig_tage) : null,
        summe_netto: rund(f["Betrag netto"] ?? 0),
        summe_brutto: rund(f["Betrag brutto"] ?? f["Betrag netto"] ?? 0),
        steuern: st.steuern,
        offen_betrag: offen,
        lexware_offen: offen,
        abschlag_nr: a === "abschlagsrechnung" ? abschlaege.indexOf(r) + 1 : null,
        teil: a === "rechnung" && v?.typ === "auftrag" && rechnungenGueltig.includes(r) && r !== schluss,
        lexware_id: einzeilig(f["Lexware-Beleg-ID"]) || null,
        lexware_status: LEXWARE_ARTEN.includes(a) && status !== "entwurf" ? "fertig" : null,
        lexware_link: f.Deeplink ?? null,
        altbestand: true,
        version: 1,
        fertiggestellt_am: status === "entwurf" ? null : `${f.Belegdatum}T12:00:00Z`,
        created_at: `${f.Belegdatum}T12:00:00Z`,
      });
    }
  }

  // ---------- OneDrive-Ordner ----------
  const ordner = [];
  for (const a of daten["Aufträge"] ?? []) {
    const v = vorgang.get(a.id);
    const url = a.fields["Link zum OneDrive-Ordner (URL)"];
    if (!v || !url) continue;
    let name;
    try {
      name = decodeURIComponent(new URL(url).pathname).split("/").filter(Boolean).at(-1);
    } catch {
      problem("Aufträge", a.id, a.fields["AB-Nr."], "OneDrive-Link ungültig – nicht übernommen");
      continue;
    }
    const item = einzeilig(a.fields["OneDrive Ordner-ID"]) || null;
    ordner.push({
      airtable_id: `${a.id}:ordner`,
      _anfrage: v.typ === "anfrage" ? v.key : null,
      _auftrag: v.typ === "auftrag" ? v.key : null,
      name: name || "Ordner",
      drive_id: item ? einstellung.drive_id : null,
      item_id: item,
      web_url: url,
      unterordner: {},
      status: item && einstellung.drive_id ? "angelegt" : "wartet",
      altbestand: true,
    });
  }

  // ---------- Bestellungen aus „Lieferung KW“ ----------
  const bestellungen = [];
  const bestellzeilen = [];
  for (const au of auftraege) {
    if (!au._lieferung && !au._bestellt) continue;
    const zusatzText = [];
    if (au._bestellt) zusatzText.push(`Bestellte Artikel laut Airtable: ${au._bestellt.replace(/\n/g, ", ")}`);
    let allesZugeordnet = !!au._lieferung;
    if (au._lieferung && BESTELLT.includes(au._bestellstatus)) {
      for (const t of lieferungZerlegen(au._lieferung)) {
        if (t.rest || !t.kuerzel) {
          allesZugeordnet = false;
          continue;
        }
        hinweise.kuerzel.set(kuerzelName(t.kuerzel), (hinweise.kuerzel.get(kuerzelName(t.kuerzel)) ?? 0) + 1);
        const lieferant = lieferanten.get(t.kuerzel.toLowerCase());
        if (!lieferant) {
          allesZugeordnet = false;
          continue;
        }
        const key = `${au.airtable_id}:${t.kuerzel.toLowerCase()}:${t.kw}`;
        if (!bestellungen.some((b) => b.airtable_id === key))
          bestellungen.push({ airtable_id: key, lieferant_id: lieferant, liefer_kw: t.kw, liefer_jahr: lieferJahr(t.kw, au._erfasst), status: "bestellt", notiz: "Aus Airtable übernommen" });
        const n = bestellzeilen.filter((z) => z._bestellung === key).length;
        bestellzeilen.push({ airtable_id: `${key}:${n + 1}`, _bestellung: key, _auftrag: au.airtable_id, artikeltext: t.zusatz || `Lieferung ${t.kuerzel}`, menge: 1, geliefert: au._bestellstatus === "Abgeschlossen", reihenfolge: n + 1 });
      }
    } else if (au._lieferung) {
      allesZugeordnet = false;
      for (const t of lieferungZerlegen(au._lieferung)) if (t.kuerzel) hinweise.kuerzel.set(kuerzelName(t.kuerzel), (hinweise.kuerzel.get(kuerzelName(t.kuerzel)) ?? 0) + 1);
    }
    if (au._lieferung && !allesZugeordnet) zusatzText.push(`Lieferung laut Airtable: ${au._lieferung}`);
    if (zusatzText.length) au.bemerkung = [au.bemerkung, ...zusatzText].filter(Boolean).join("\n");
  }

  // ---------- Aufgaben ----------
  const aufgaben = [];
  for (const r of daten.Aufgaben ?? []) {
    const f = r.fields;
    const v = vorgang.get(erstes(f.Auftrag));
    const titel = einzeilig(f.Aufgabe) || einzeilig(f.Beschreibung).slice(0, 80) || "Aufgabe";
    aufgaben.push({
      airtable_id: r.id,
      titel,
      zustaendig_id: benutzerVon(f["Zuständig"]),
      faellig: f["Fällig am"] ?? null,
      prioritaet: PRIO[f["Priorität"]] ?? "normal",
      status: AUFGABE_STATUS[f.Status] ?? "offen",
      notiz: [mehrzeilig(f.Beschreibung), mehrzeilig(f.Notiz)].filter(Boolean).join("\n\n") || null,
      _auftrag: v?.typ === "auftrag" ? v.key : null,
      _anfrage: v?.typ === "anfrage" ? v.key : null,
    });
  }

  // ---------- Nicht übernommen ----------
  for (const r of daten.Anfragen ?? []) problem("Anfragen", r.id, r.fields["Laufende Nr."], "Airtable-Anfrage (ohne Auftrag, archiviert) – nicht übernommen");
  for (const r of daten.Zeiterfassung ?? []) problem("Zeiterfassung", r.id, r.fields["Buchung ID"], "Zeiterfassung (Testeinträge ohne Auftrag) – nicht übernommen");

  // ---------- Nummernkreise ----------
  const jj = heute.slice(2, 4);
  const hoechste = (re) => belege.reduce((m, b) => {
    const x = re.exec(b.nummer ?? "");
    return x && x[1] === jj ? Math.max(m, Number(x[2])) : m;
  }, 0);
  const nummernkreise = {
    angebot: hoechste(/^AG1(\d{2})(\d{4,})$/),
    auftragsbestaetigung: Math.max(hoechste(/^AB2(\d{2})(\d{4,})$/), ...auftraege.map((a) => { const x = /^AB2(\d{2})(\d{4,})$/.exec(a.nummer ?? ""); return x && x[1] === jj ? Number(x[2]) : 0; })),
    kunde: kunden.reduce((m, k) => (/^\d+$/.test(k.nummer) ? Math.max(m, Number(k.nummer)) : m), 0),
  };

  return { kunden, lieferadressen, anfragen, auftraege, ordner, belege, bestellungen, bestellzeilen, aufgaben, nummernkreise, probleme, hinweise };
}

function anfrageTitel(angebote, prod, laufendeNr) {
  const mitTitel = angebote.map((r) => einzeilig(r.fields.Titel)).find((t) => t && t !== "Angebot");
  if (mitTitel) return mitTitel;
  if (prod.length) return prod.join(", ");
  const nr = angebote.map((r) => einzeilig(r.fields.Belegnummer)).find(Boolean);
  if (nr) return `Angebot ${nr}`;
  return laufendeNr ? `Anfrage aus Airtable Nr. ${laufendeNr}` : "Anfrage aus Airtable";
}

/** Status der Anfrage aus ihren Angeboten */
function anfrageStand(angebote) {
  const st = angebote.map((r) => r.fields.Status);
  const fertige = st.filter((s) => s !== "Entwurf");
  if (fertige.length && fertige.every((s) => s === "Abgelehnt")) return { status: "angebot_versendet", archiv: "verloren", verlust_grund: "Angebot abgelehnt" };
  if (fertige.length) return { status: "angebot_versendet", archiv: null, verlust_grund: null };
  return { status: "angebot_erstellen", archiv: null, verlust_grund: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Positionen aus Lexware (nur Produktion, nur lesend: GET /v1/quotations/{id} bzw. /v1/order-confirmations/{id})
// ---------------------------------------------------------------------------------------------------------------------

const html = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Reiner Text aus Lexware → bereinigtes HTML der App (Absätze, Zeilenumbrüche) */
export const textZuHtml = (t) =>
  t?.trim()
    ? String(t)
        .replace(/\r/g, "")
        .split(/\n{2,}/)
        .map((absatz) => `<p>${absatz.split("\n").map(html).join("<br>")}</p>`)
        .join("")
    : null;

const STEUERART = { gross: ["standard", true], net: ["standard", false], constructionService13b: ["bauleistung_13b", false] };

/** Lexware-Beleg (Angebot, AB) → Kopf und Positionen der App */
export function lexwareZuBeleg(v) {
  const [steuerart, brutto] = STEUERART[v.taxConditions?.taxType] ?? ["steuerfrei", false];
  const a = v.address ?? {};
  const pc = v.paymentConditions ?? {};
  const kopf = {
    titel: v.title ?? null,
    einleitung: v.introduction ?? null,
    nachbemerkung: v.remark ?? null,
    steuerart,
    preise_brutto: brutto,
    gesamtrabatt_prozent: Number(v.totalPrice?.totalDiscountPercentage ?? 0),
    zahlungsbedingung_text: pc.paymentTermLabel ?? null,
    zahlungsziel_tage: pc.paymentTermDuration ?? null,
    skontoziel_tage: pc.paymentDiscountConditions?.discountRange ?? null,
    skonto_prozent: pc.paymentDiscountConditions?.discountPercentage ?? null,
    ...(a.name ? { adresse_name: a.name, adresse_zusatz: a.supplement ?? null, adresse_strasse: a.street ?? null, adresse_plz: a.zip ?? null, adresse_ort: a.city ?? null } : {}),
  };
  const positionen = (v.lineItems ?? []).map((p, i) =>
    p.type === "text"
      ? { reihenfolge: i + 1, typ: "text", titel: p.name ?? "", beschreibung_html: textZuHtml(p.description), optional: false, menge: 0, einheit: null, einzelpreis: 0, rabatt_prozent: 0, steuersatz: 0 }
      : {
          reihenfolge: i + 1,
          typ: "artikel",
          titel: p.name ?? "",
          beschreibung_html: textZuHtml(p.description),
          optional: p.optional === true,
          menge: Number(p.quantity ?? 1),
          einheit: p.unitName ?? null,
          einzelpreis: Number((brutto ? p.unitPrice?.grossAmount : p.unitPrice?.netAmount) ?? 0),
          rabatt_prozent: Number(p.discountPercentage ?? 0),
          steuersatz: steuerart === "standard" ? Number(p.unitPrice?.taxRatePercentage ?? 0) : 0,
        },
  );
  return { kopf, positionen };
}
