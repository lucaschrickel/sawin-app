// Datenübernahme aus Airtable (docs/airtable-uebernahme.md). Liest Airtable nur lesend, schreibt nur in Supabase,
// sendet nichts an Lexware. Wiederholbar: Jede Zeile trägt ihre airtable_id; ein erneuter Lauf aktualisiert nur Zeilen,
// die seit dem letzten Import niemand geändert hat (updated_at = import_stand).
//
//   npm run import:airtable                                  Probelauf: rechnet alles durch, schreibt nur den Bericht
//   npm run import:airtable -- --schreiben --projekt=<ref>    schreibt (ref = Supabase-Projekt, Schutz gegen Verwechslung)
//   … --lexware-lesen                                         zusätzlich Positionen offener Angebote und ABs aus Lexware
//                                                             lesen (nur GET; nur mit LEXWARE_ALTBESTAND=aktiv, also
//                                                             Sawins eigenem Lexware in Produktion)
//   … --env=<datei>                                           andere Umgebungsdatei (Standard .env.local)
//   … --aus-datei=<json>                                      Airtable-Daten aus einer gespeicherten Datei statt live
//   … --nur-kunden                                           nur Kunden und Lieferadressen (Stammdaten für den Go-live):
//                                                             keine Anfragen, Aufträge, Belege, Bestellungen, Aufgaben,
//                                                             Ordner; Nummernkreise außer „kunde“ bleiben unberührt
//
// Umgebung: AIRTABLE_TOKEN (nur Lesen), AIRTABLE_BASE_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_URL; für
// --lexware-lesen LEXWARE_API_KEY und LEXWARE_ALTBESTAND=aktiv. Bericht in berichte/ (nicht im Repository).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

// Datumsspalten als Text (JJJJ-MM-TT) statt als Datum in der lokalen Zeitzone
pg.types.setTypeParser(1082, (v) => v);
import { belegSummen } from "../src/lib/beleg-summen.ts";
import { lexwareZuBeleg, planen } from "./airtable/zuordnung.mjs";
import { refAusDb } from "./testprojekt.mjs";

/** --name → true, --name=wert → "wert", fehlt → undefined */
const arg = (name) => {
  if (process.argv.includes(`--${name}`)) return true;
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
};
const envDatei = arg("env") || ".env.local";
if (existsSync(envDatei)) process.loadEnvFile(envDatei);
const SCHREIBEN = !!arg("schreiben");
const LEXWARE_LESEN = !!arg("lexware-lesen");
const NUR_KUNDEN = !!arg("nur-kunden");
if (NUR_KUNDEN && LEXWARE_LESEN) {
  console.error("Abbruch: --nur-kunden liest kein Lexware (ohne --lexware-lesen aufrufen).");
  process.exit(1);
}
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

function abbruch(text) {
  console.error(`Abbruch: ${text}`);
  process.exit(1);
}
const projekt = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
  } catch {
    return null;
  }
})();
if (!process.env.SUPABASE_DB_URL || !projekt) abbruch("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_DB_URL fehlen.");
// Geschrieben wird über SUPABASE_DB_URL: sie muss zum selben Projekt gehören wie die API-Adresse
if (refAusDb(process.env.SUPABASE_DB_URL) !== projekt) abbruch(`SUPABASE_DB_URL gehört nicht zum Projekt ${projekt} aus NEXT_PUBLIC_SUPABASE_URL.`);
if (SCHREIBEN && arg("projekt") !== projekt) abbruch(`Zum Schreiben --projekt=${projekt} angeben (Schutz gegen das falsche Supabase-Projekt).`);
if (LEXWARE_LESEN && process.env.LEXWARE_ALTBESTAND?.trim() !== "aktiv")
  abbruch("--lexware-lesen nur mit LEXWARE_ALTBESTAND=aktiv (Sawins eigenes Lexware, Produktion). In Staging gehören die IDs nicht zum Testkonto.");

// ---------------------------------------------------------------------------------------------------------------------
// Airtable (nur lesend)
// ---------------------------------------------------------------------------------------------------------------------

async function airtableLesen() {
  if (arg("aus-datei")) return JSON.parse(readFileSync(arg("aus-datei"), "utf8"));
  const token = process.env.AIRTABLE_TOKEN?.trim();
  const base = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !base) abbruch("AIRTABLE_TOKEN und AIRTABLE_BASE_ID fehlen.");
  const api = async (pfad) => {
    for (let versuch = 0; ; versuch++) {
      const r = await fetch(`https://api.airtable.com/v0/${pfad}`, { headers: { Authorization: `Bearer ${token}` } });
      await new Promise((ok) => setTimeout(ok, 220)); // höchstens 5 Anfragen je Sekunde
      if (r.status === 429 && versuch < 5) {
        await new Promise((ok) => setTimeout(ok, 30_000));
        continue;
      }
      if (!r.ok) throw new Error(`Airtable ${pfad.split("?")[0]}: HTTP ${r.status}`);
      return r.json();
    }
  };
  const { tables } = await api(`meta/bases/${base}/tables`);
  const daten = {};
  for (const t of tables) {
    const recs = [];
    let offset;
    do {
      const q = new URLSearchParams({ pageSize: "100" });
      if (offset) q.set("offset", offset);
      const r = await api(`${base}/${t.id}?${q}`);
      recs.push(...r.records);
      offset = r.offset;
    } while (offset);
    daten[t.name] = recs;
  }
  return daten;
}

// ---------------------------------------------------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------------------------------------------------

const JSONB = new Set(["steuern", "unterordner"]);
const wert = (spalte, v) => (JSONB.has(spalte) ? JSON.stringify(v) : v);

/** Spalten ohne Verweise (_…) */
const spalten = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("_")));

async function tabelleSchreiben(db, tabelle, rows, ids, ergebnis, fehler, aufloesen, nummerVon) {
  const stand = { gelesen: rows.length, neu: 0, aktualisiert: 0, uebersprungen: 0, fehler: 0 };
  ergebnis[tabelle] = stand;
  if (!rows.length) return;
  const { rows: vorhanden } = await db.query(
    `select id, airtable_id, (import_stand is not null and updated_at = import_stand) as unveraendert from public.${tabelle} where airtable_id = any($1)`,
    [rows.map((r) => r.airtable_id)],
  );
  const alt = new Map(vorhanden.map((r) => [r.airtable_id, r]));
  for (const row of rows) {
    await db.query("savepoint zeile");
    try {
      const daten = { ...spalten(row), ...aufloesen(row) };
      const x = alt.get(row.airtable_id);
      if (x) {
        ids.set(`${tabelle}:${row.airtable_id}`, x.id);
        if (!x.unveraendert) {
          stand.uebersprungen++;
          await db.query("release savepoint zeile");
          continue;
        }
        if (daten.nummer == null) delete daten.nummer;
        // Wurzel einer Kette (ohne _wurzel): kette_id ist die eigene ID
        if (tabelle === "beleg" && !("kette_id" in daten)) daten.kette_id = x.id;
        const k = Object.keys(daten).filter((s) => s !== "airtable_id");
        await db.query(
          `update public.${tabelle} set ${k.map((s, i) => `${s} = $${i + 2}`).join(", ")}, import_stand = now() where id = $1`,
          [x.id, ...k.map((s) => wert(s, daten[s]))],
        );
        stand.aktualisiert++;
      } else {
        if (nummerVon && daten.nummer == null) daten.nummer = await nummerVon(row);
        const k = Object.keys(daten);
        const { rows: neu } = await db.query(
          `insert into public.${tabelle} (${k.join(", ")}, import_stand) values (${k.map((_, i) => `$${i + 1}`).join(", ")}, now()) returning id`,
          k.map((s) => wert(s, daten[s])),
        );
        ids.set(`${tabelle}:${row.airtable_id}`, neu[0].id);
        stand.neu++;
      }
      await db.query("release savepoint zeile");
    } catch (e) {
      await db.query("rollback to savepoint zeile");
      stand.fehler++;
      fehler.push({ tabelle, id: row.airtable_id, nummer: row.nummer ?? row.titel ?? row.name ?? "", text: e.message });
    }
  }
}

function id(ids, tabelle, key, pflicht = true) {
  if (key == null) return null;
  const x = ids.get(`${tabelle}:${key}`);
  if (!x && pflicht) throw new Error(`Verweis fehlt: ${tabelle} ${key}`);
  return x ?? null;
}

async function schreiben(db, plan) {
  const ids = new Map();
  const ergebnis = {};
  const fehler = [];
  const nk = {};
  const jahr = Number(heute.slice(0, 4));

  await tabelleSchreiben(db, "kunde", plan.kunden, ids, ergebnis, fehler, () => ({}));
  await tabelleSchreiben(db, "kunde_lieferadresse", plan.lieferadressen, ids, ergebnis, fehler, (r) => ({ kunde_id: id(ids, "kunde", r._kunde) }));

  // Nummernkreise vor den Aufträgen ohne AB (die eine neue Nummer aus dem AB-Kreis bekommen)
  for (const [art, n] of Object.entries(plan.nummernkreise)) {
    if (NUR_KUNDEN && art !== "kunde") continue;
    const { rows } = await db.query("select letzte, jahr, jaehrlich, start, start_jahr from public.nummernkreis where art = $1 and deleted_at is null", [art]);
    if (!rows[0]) continue;
    const vorher = rows[0].jaehrlich && rows[0].jahr !== jahr ? 0 : rows[0].letzte;
    const nachher = Math.max(vorher, n);
    await db.query("update public.nummernkreis set letzte = $2, jahr = $3 where art = $1 and deleted_at is null", [art, nachher, rows[0].jaehrlich ? jahr : rows[0].jahr]);
    // Startwert (Go-live): die App vergibt nie weniger (app.naechste_nummer); er muss über allem Übernommenen liegen
    const start = rows[0].start != null && (!rows[0].jaehrlich || rows[0].start_jahr === jahr) ? rows[0].start : null;
    nk[art] = { vorher, airtable: n, nachher, start };
  }

  if (NUR_KUNDEN) {
    for (const x of Object.values(nk)) x.naechste = Math.max(x.nachher + 1, x.start ?? 0);
    return { ergebnis, fehler, nk, ids };
  }
  await tabelleSchreiben(db, "anfrage", plan.anfragen, ids, ergebnis, fehler, (r) => ({ kunde_id: id(ids, "kunde", r._kunde) }));
  await tabelleSchreiben(db, "auftrag", plan.auftraege, ids, ergebnis, fehler, (r) => ({ kunde_id: id(ids, "kunde", r._kunde) }), async () => (await db.query("select app.naechste_nummer('auftragsbestaetigung') as n")).rows[0].n);
  const { rows: abNach } = await db.query("select letzte from public.nummernkreis where art = 'auftragsbestaetigung' and deleted_at is null");
  if (nk.auftragsbestaetigung && abNach[0]) nk.auftragsbestaetigung.nachher = abNach[0].letzte;
  for (const x of Object.values(nk)) x.naechste = Math.max(x.nachher + 1, x.start ?? 0);
  const vorgangIds = (r) => ({ anfrage_id: id(ids, "anfrage", r._anfrage), auftrag_id: id(ids, "auftrag", r._auftrag) });
  await tabelleSchreiben(db, "ablage_ordner", plan.ordner, ids, ergebnis, fehler, vorgangIds);
  await tabelleSchreiben(db, "beleg", plan.belege, ids, ergebnis, fehler, (r) => ({
    ...vorgangIds(r),
    kunde_id: id(ids, "kunde", r._kunde),
    vorgaenger_id: id(ids, "beleg", r._vorgaenger),
    ...(r._wurzel ? { kette_id: id(ids, "beleg", r._wurzel) } : {}),
  }));
  await tabelleSchreiben(db, "bestellung", plan.bestellungen, ids, ergebnis, fehler, () => ({}));
  await tabelleSchreiben(db, "bestellzeile", plan.bestellzeilen, ids, ergebnis, fehler, (r) => ({ bestellung_id: id(ids, "bestellung", r._bestellung), auftrag_id: id(ids, "auftrag", r._auftrag) }));
  await tabelleSchreiben(db, "aufgabe", plan.aufgaben, ids, ergebnis, fehler, vorgangIds);
  return { ergebnis, fehler, nk, ids };
}

// ---------------------------------------------------------------------------------------------------------------------
// Lexware lesen (nur GET, nur Produktion)
// ---------------------------------------------------------------------------------------------------------------------

async function lexwareLesen(db) {
  const key = process.env.LEXWARE_API_KEY?.trim();
  if (!key) abbruch("LEXWARE_API_KEY fehlt.");
  let zuletzt = 0;
  const get = async (pfad) => {
    for (let versuch = 0; ; versuch++) {
      const warten = zuletzt + 600 - Date.now(); // höchstens 2 Anfragen je Sekunde
      if (warten > 0) await new Promise((ok) => setTimeout(ok, warten));
      zuletzt = Date.now();
      const r = await fetch(`https://api.lexware.io${pfad}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
      if (r.status === 429 && versuch < 6) {
        await new Promise((ok) => setTimeout(ok, 1000 * 2 ** versuch));
        continue;
      }
      if (!r.ok) throw new Error(`Lexware ${pfad}: HTTP ${r.status}`);
      return r.json();
    }
  };
  // Offene Angebote und Entwürfe, ABs laufender Aufträge (ohne Schlussrechnung), jeweils noch ohne Positionen
  const { rows: ziele } = await db.query(`
    select b.id, b.art, b.nummer, b.lexware_id, b.summe_brutto
      from public.beleg b
      left join public.auftrag a on a.id = b.auftrag_id
     where b.altbestand and b.lexware_id is not null and b.deleted_at is null and b.airtable_id is not null
       and not exists (select 1 from public.beleg_position p where p.beleg_id = b.id)
       and b.updated_at = b.import_stand
       and ((b.art = 'angebot' and b.status in ('entwurf', 'offen', 'angenommen'))
         or (b.art = 'auftragsbestaetigung' and (b.status = 'entwurf' or coalesce(a.phase, '') <> 'abgeschlossen')
             and not exists (select 1 from public.beleg r where r.kette_id = b.kette_id and r.art = 'rechnung' and not r.teil
                               and r.status not in ('entwurf', 'storniert') and r.deleted_at is null)))`);
  const stand = { ziele: ziele.length, gelesen: 0, abweichung: [], fehler: [] };
  for (const z of ziele) {
    await db.query("savepoint lex");
    try {
      const v = await get(`/v1/${z.art === "angebot" ? "quotations" : "order-confirmations"}/${z.lexware_id}`);
      const { kopf, positionen } = lexwareZuBeleg(v);
      const k = Object.keys(kopf);
      await db.query(`update public.beleg set ${k.map((s, i) => `${s} = $${i + 2}`).join(", ")}, import_stand = now() where id = $1`, [z.id, ...k.map((s) => kopf[s])]);
      for (const p of positionen) {
        const s = Object.keys(p);
        await db.query(`insert into public.beleg_position (beleg_id, ${s.join(", ")}) values ($1, ${s.map((_, i) => `$${i + 2}`).join(", ")})`, [z.id, ...s.map((x) => p[x])]);
      }
      const summe = belegSummen(positionen, kopf);
      if (Math.abs(summe.brutto - Number(z.summe_brutto)) > 0.005) stand.abweichung.push(`${z.nummer}: Positionen ${summe.brutto} gegen ${z.summe_brutto}`);
      await db.query("release savepoint lex");
      stand.gelesen++;
    } catch (e) {
      await db.query("rollback to savepoint lex");
      stand.fehler.push(`${z.nummer}: ${e.message}`);
    }
  }
  return stand;
}

// ---------------------------------------------------------------------------------------------------------------------
// Bericht
// ---------------------------------------------------------------------------------------------------------------------

const zahl = (n) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Stichproben: Feld für Feld Airtable-Plan gegen Datenbank; Personendaten nur als „gleich“/„abweichend“ */
const STICHPROBE = {
  kunde: { felder: ["nummer", "typ", "name", "anrede", "strasse", "plz", "ort", "telefon", "email", "lexware_kontakt_id"], offen: ["nummer", "typ", "anrede"] },
  auftrag: { felder: ["nummer", "phase", "montagestatus", "titel", "pruefhinweis"], offen: ["nummer", "phase", "montagestatus"] },
  anfrage: { felder: ["titel", "status", "archiv", "eingang"], offen: ["status", "archiv", "eingang"] },
  beleg: { felder: ["art", "nummer", "status", "datum", "summe_netto", "summe_brutto", "offen_betrag", "abschlag_nr", "lexware_id"], offen: ["art", "nummer", "status", "datum", "summe_netto", "summe_brutto", "offen_betrag", "abschlag_nr"] },
  ablage_ordner: { felder: ["name", "item_id", "web_url", "status"], offen: ["status"] },
  aufgabe: { felder: ["titel", "status", "prioritaet", "faellig"], offen: ["status", "prioritaet", "faellig"] },
};
const PLAN_TABELLE = { kunde: "kunden", auftrag: "auftraege", anfrage: "anfragen", beleg: "belege", ablage_ordner: "ordner", aufgabe: "aufgaben" };
const gleich = (a, b) => {
  const n = (x) => (x == null || x === "" ? null : x instanceof Date ? x.toISOString().slice(0, 10) : typeof x === "number" || /^-?\d+(\.\d+)?$/.test(String(x)) ? Number(x) : String(x));
  return n(a) === n(b);
};

async function stichproben(db, plan) {
  const zeilen = [];
  for (const [tabelle, { felder, offen }] of Object.entries(STICHPROBE)) {
    const liste = plan[PLAN_TABELLE[tabelle]];
    if (!liste.length) continue;
    const schritt = Math.max(1, Math.floor(liste.length / 10));
    const auswahl = liste.filter((_, i) => i % schritt === 0).slice(0, 10);
    const { rows } = await db.query(`select airtable_id, ${felder.join(", ")} from public.${tabelle} where airtable_id = any($1)`, [auswahl.map((r) => r.airtable_id)]);
    const db_ = new Map(rows.map((r) => [r.airtable_id, r]));
    zeilen.push(`\n### ${tabelle}\n`, `| Airtable | ${felder.join(" | ")} |`, `|${"---|".repeat(felder.length + 1)}`);
    for (const p of auswahl) {
      const d = db_.get(p.airtable_id);
      if (!d) {
        zeilen.push(`| ${p.airtable_id} | fehlt in der App |${" |".repeat(felder.length - 1)}`);
        continue;
      }
      const zellen = felder.map((f) => {
        if (f === "nummer" && p.nummer == null) return d.nummer ? `${d.nummer} (neu)` : "–";
        const ok = gleich(p[f], d[f]);
        if (offen.includes(f)) return ok ? String(d[f] ?? "–").slice(0, 40) : `**${p[f] ?? "–"} → ${d[f] ?? "–"}**`;
        return ok ? "gleich" : "**abweichend**";
      });
      zeilen.push(`| ${p.airtable_id} | ${zellen.join(" | ")} |`);
    }
  }
  return zeilen;
}

async function summenAbgleich(db, daten, plan) {
  const ART = { Angebot: "angebot", "Auftragsbestätigung": "auftragsbestaetigung", Lieferschein: "lieferschein", Abschlagsrechnung: "abschlagsrechnung", Rechnung: "rechnung" };
  const airtable = {};
  for (const r of daten.Belege ?? []) {
    if (r.fields["Gelöscht in Lexware"]) continue;
    const a = ART[r.fields.Belegart] ?? r.fields.Belegart;
    airtable[a] = (airtable[a] ?? 0) + Number(r.fields["Betrag brutto"] ?? 0);
  }
  const { rows } = await db.query("select art, count(*)::int as n, coalesce(sum(summe_brutto), 0)::float as s from public.beleg where airtable_id = any($1) and deleted_at is null group by art", [plan.belege.map((b) => b.airtable_id)]);
  const app = new Map(rows.map((r) => [r.art, r]));
  const zeilen = ["| Belegart | Airtable brutto | App (Anzahl) | App brutto | Differenz |", "|---|---:|---:|---:|---:|"];
  for (const [art, s] of Object.entries(airtable)) {
    const x = app.get(art);
    zeilen.push(`| ${art} | ${zahl(s)} | ${x?.n ?? 0} | ${zahl(x?.s ?? 0)} | ${zahl((x?.s ?? 0) - s)} |`);
  }
  return zeilen;
}

function bericht({ plan, daten, ergebnis, fehler, nk, lex, proben, summen, vorhandeneAnzahl }) {
  const t = [];
  t.push(`# Prüfbericht Airtable-Übernahme`, ``, `${SCHREIBEN ? "Lauf mit Schreiben" : "Probelauf (nichts geschrieben)"} am ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}, Supabase-Projekt \`${projekt}\`.`, ``);
  t.push(`## Anzahl je Tabelle`, ``, `| Airtable | gelesen |`, `|---|---:|`);
  for (const [k, v] of Object.entries(daten)) t.push(`| ${k} | ${v.length} |`);
  t.push(``, `| App-Tabelle | geplant | ${SCHREIBEN ? "neu | aktualisiert | übersprungen (in der App geändert) | Fehler" : "schon vorhanden"} |`, `|---|---:|${SCHREIBEN ? "---:|---:|---:|---:|" : "---:|"}`);
  const plaene = { kunde: plan.kunden, kunde_lieferadresse: plan.lieferadressen, anfrage: plan.anfragen, auftrag: plan.auftraege, ablage_ordner: plan.ordner, beleg: plan.belege, bestellung: plan.bestellungen, bestellzeile: plan.bestellzeilen, aufgabe: plan.aufgaben };
  for (const [tab, rows] of Object.entries(plaene)) {
    const e = ergebnis?.[tab];
    t.push(SCHREIBEN ? `| ${tab} | ${rows.length} | ${e?.neu ?? 0} | ${e?.aktualisiert ?? 0} | ${e?.uebersprungen ?? 0} | ${e?.fehler ?? 0} |` : `| ${tab} | ${rows.length} | ${vorhandeneAnzahl[tab] ?? 0} |`);
  }
  const z = (xs) => Object.entries(xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).map(([k, n]) => `${k}: ${n}`).join(", ");
  t.push(``, `## Verteilung`, ``);
  t.push(`- Aufträge: ${z(plan.auftraege.map((a) => `${a.airtable_id.startsWith("kette:") ? "aus Lexware-Kette" : "aus Airtable"} ${a.phase}${a.nummer ? "" : " (neue AB-Nummer)"}`))}`);
  t.push(`- Anfragen: ${z(plan.anfragen.map((a) => `${a.status}${a.archiv ? ` (${a.archiv})` : ""}`))}`);
  t.push(`- Belege: ${z(plan.belege.map((b) => `${b.art} ${b.status}`))}`);
  t.push(`- Belege je Bezug: ${z(plan.belege.map((b) => (b._auftrag ? "Auftrag" : b._anfrage ? "Anfrage" : "nur Kunde")))}`);
  t.push(`- OneDrive-Ordner: ${z(plan.ordner.map((o) => (o.item_id ? "mit ID" : "nur Link")))}`);
  t.push(``, `## Nummernkreise`, ``, `Laufende Nummern. Die App vergibt nie unter dem Startwert (Go-live); Prüfung gegen Lexware: npm run golive:pruefen.`, ``, `| Kreis | vorher | höchste aus Airtable | Startwert | nächste laufende Nummer | |`, `|---|---:|---:|---:|---:|---|`);
  for (const [art, n] of Object.entries(plan.nummernkreise)) {
    const x = nk?.[art];
    const warnung = x?.start != null && x.start <= n ? "**Startwert nicht über der höchsten Nummer**" : "";
    t.push(`| ${art} | ${x?.vorher ?? "–"} | ${n} | ${x?.start ?? "–"} | ${x?.naechste ?? "–"} | ${warnung} |`);
  }
  if (summen) t.push(``, `## Summen (brutto)`, ``, ...summen);
  t.push(``, `## Hinweise`, ``);
  t.push(`- Lieferantenkürzel aus „Lieferung KW“ (in scripts/airtable/lieferanten.json einem Lieferanten zuordnen): ${[...plan.hinweise.kuerzel].map(([k, n]) => `${k} (${n})`).join(", ") || "keine"}`);
  t.push(`- Belege ohne Umsatzsteuer, als § 13b übernommen (bitte prüfen): ${plan.hinweise.steuer0.join(", ") || "keine"}`);
  t.push(`- Stornierte Rechnungen/Abschläge: ${plan.hinweise.stornoListe.join(", ") || "keine"}`);
  t.push(`- Airtable-Mitarbeiter ohne App-Benutzer (Zuständig bleibt leer): ${[...plan.hinweise.benutzerFehlt].map(([k, n]) => `${k} (${n})`).join(", ") || "keine"}`);
  if (lex) {
    t.push(``, `## Positionen aus Lexware`, ``, `- Ziele: ${lex.ziele}, gelesen: ${lex.gelesen}, Fehler: ${lex.fehler.length}`);
    for (const x of lex.abweichung) t.push(`- Summe weicht ab: ${x}`);
    for (const x of lex.fehler) t.push(`- Fehler: ${x}`);
  } else t.push(``, `Positionen aus Lexware: nicht gelesen (nur in Produktion mit --lexware-lesen).`);
  t.push(``, `## Ohne Zuordnung und Fehler (${plan.probleme.length + (fehler?.length ?? 0)})`, ``, `| Tabelle | Airtable | Nummer | Grund |`, `|---|---|---|---|`);
  for (const p of [...plan.probleme, ...(fehler ?? [])]) t.push(`| ${p.tabelle} | ${p.id} | ${p.nummer ?? ""} | ${String(p.text).replace(/\|/g, "/").replace(/\n/g, " ")} |`);
  if (proben) t.push(``, `## Stichproben (Airtable gegen App)`, ...proben);
  return t.join("\n") + "\n";
}

/** Bericht für --nur-kunden: Anzahl, Dubletten, Kunden ohne Lexware-ID bzw. Kundennummer, Fehler */
function kundenBericht({ plan, ergebnis, fehler, nk, vorhanden }) {
  const k = plan.kunden;
  const gruppen = (schluessel) => {
    const m = new Map();
    for (const x of k) {
      const s = schluessel(x);
      if (!s) continue;
      m.set(s, [...(m.get(s) ?? []), x]);
    }
    return [...m.entries()].filter(([, l]) => l.length > 1);
  };
  const zeile = (x) => `${x.nummer} ${x.name}${x.plz || x.ort ? ` (${[x.plz, x.ort].filter(Boolean).join(" ")})` : ""}`;
  const dubletten = [
    ["gleiche Kundennummer", gruppen((x) => (x.nummer && x.nummer !== "undefined" ? x.nummer : null))],
    ["gleiche Lexware-Kontakt-ID", gruppen((x) => x.lexware_kontakt_id)],
    ["gleiche E-Mail", gruppen((x) => x.email)],
    ["gleicher Name und gleiche PLZ", gruppen((x) => (x.name && x.plz ? `${x.name.toLowerCase()}|${x.plz}` : null))],
  ];
  const ohneLex = k.filter((x) => !x.lexware_kontakt_id);
  const ohneNr = k.filter((x) => !x.nummer || x.nummer === "undefined" || x.nummer === "null");
  const t = [
    `# Kundenimport (nur Stammdaten)`,
    ``,
    `${SCHREIBEN ? "Lauf mit Schreiben" : "Probelauf (nichts geschrieben)"} am ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}, Supabase-Projekt \`${projekt}\`. Airtable nur lesend, nichts an Lexware.`,
    ``,
    `| | Anzahl |`,
    `|---|---|`,
    `| Kunden | ${k.length} |`,
    `| davon mit Lexware-Kontakt-ID (altbestand) | ${k.length - ohneLex.length} |`,
    `| davon ohne Lexware-Kontakt-ID | ${ohneLex.length} |`,
    `| davon ohne Kundennummer | ${ohneNr.length} |`,
    `| Lieferadressen | ${plan.lieferadressen.length} |`,
    `| schon in der Datenbank (airtable_id) | Kunden ${vorhanden?.kunde ?? "–"}, Lieferadressen ${vorhanden?.kunde_lieferadresse ?? "–"} |`,
    ...(ergebnis ? [`| geschrieben | ${Object.entries(ergebnis).map(([t2, e]) => `${t2}: ${JSON.stringify(e)}`).join("; ")} |`] : []),
    ``,
    `Kundennummern: übernommene Kunden behalten ihre bisherige Nummer (höchste: ${Math.max(0, ...k.map((x) => Number(x.nummer)).filter(Number.isFinite))}); neue Kunden der App bekommen Nummern ab dem Startwert des Nummernkreises${nk?.kunde ? ` (nächste: ${nk.kunde.naechste})` : ""}.`,
    ``,
    `## Dubletten`,
    ``,
  ];
  for (const [titel, g] of dubletten) {
    t.push(`### ${titel}: ${g.length}`, ``);
    for (const [, l] of g.slice(0, 200)) t.push(`- ${l.map(zeile).join(" · ")}`);
    if (g.length > 200) t.push(`- … und ${g.length - 200} weitere`);
    t.push(``);
  }
  t.push(`## Kunden ohne Lexware-Kontakt-ID: ${ohneLex.length}`, ``, `Sie werden beim ersten Lexware-Beleg über die Dubletten-Suche (Kundennummer, E-Mail, Name, Adresse) einem vorhandenen Lexware-Kontakt zugeordnet oder neu angelegt.`, ``);
  for (const x of ohneLex.slice(0, 300)) t.push(`- ${zeile(x)}`);
  if (ohneLex.length > 300) t.push(`- … und ${ohneLex.length - 300} weitere`);
  if (ohneNr.length) t.push(``, `## Kunden ohne Kundennummer: ${ohneNr.length}`, ``, ...ohneNr.map((x) => `- ${x.airtable_id} ${x.name}`));
  const probleme = [...plan.probleme.filter((x) => x.tabelle === "Kunden"), ...(fehler ?? [])];
  t.push(``, `## Fehler und Hinweise: ${probleme.length}`, ``);
  for (const x of probleme) t.push(`- ${x.tabelle} ${x.id} ${x.nummer ?? ""}: ${String(x.text).replace(/\n/g, " ")}`);
  return t.join("\n") + "\n";
}

// ---------------------------------------------------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------------------------------------------------

const daten = await airtableLesen();
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const { rows: nutzer } = await db.query("select id, lower(email) as email from public.benutzer where deleted_at is null");
  const kuerzelDatei = new URL("./airtable/lieferanten.json", import.meta.url);
  const kuerzel = existsSync(kuerzelDatei) ? JSON.parse(readFileSync(kuerzelDatei, "utf8")) : {};
  const { rows: lief } = await db.query("select id, lower(name) as name from public.lieferant where deleted_at is null");
  const lieferanten = new Map();
  for (const [k, name] of Object.entries(kuerzel)) {
    const l = name && lief.find((x) => x.name === String(name).toLowerCase());
    if (l) lieferanten.set(k.toLowerCase(), l.id);
  }
  const { rows: einst } = await db.query("select onedrive_drive_id, angebot_gueltig_tage from public.einstellung where einzig");
  const plan = planen({
    daten,
    benutzer: new Map(nutzer.map((n) => [n.email, n.id])),
    lieferanten,
    einstellung: { drive_id: einst[0]?.onedrive_drive_id ?? null, angebot_gueltig_tage: einst[0]?.angebot_gueltig_tage ?? 30 },
    heute,
  });

  let ergebnis, fehler, nk, lex, proben, summen;
  const vorhandeneAnzahl = {};
  if (SCHREIBEN) {
    await db.query("begin");
    ({ ergebnis, fehler, nk } = await schreiben(db, plan));
    if (LEXWARE_LESEN) lex = await lexwareLesen(db);
    await db.query("commit");
    if (!NUR_KUNDEN) {
      proben = await stichproben(db, plan);
      summen = await summenAbgleich(db, daten, plan);
    }
  } else {
    const zaehlen = NUR_KUNDEN ? { kunde: plan.kunden, kunde_lieferadresse: plan.lieferadressen } : { kunde: plan.kunden, anfrage: plan.anfragen, auftrag: plan.auftraege, beleg: plan.belege, aufgabe: plan.aufgaben, ablage_ordner: plan.ordner, kunde_lieferadresse: plan.lieferadressen };
    for (const [tab, rows] of Object.entries(zaehlen)) {
      const { rows: r } = await db.query(`select count(*)::int as n from public.${tab} where airtable_id = any($1)`, [rows.map((x) => x.airtable_id)]);
      vorhandeneAnzahl[tab] = r[0].n;
    }
  }
  mkdirSync("berichte", { recursive: true });
  const datei = `berichte/airtable-import-${NUR_KUNDEN ? "kunden-" : ""}${projekt}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`;
  if (NUR_KUNDEN) {
    writeFileSync(datei, kundenBericht({ plan, ergebnis, fehler, nk, vorhanden: vorhandeneAnzahl }));
    console.log(`${SCHREIBEN ? "Geschrieben" : "Probelauf"} (nur Kunden): ${plan.kunden.length} Kunden, ${plan.lieferadressen.length} Lieferadressen, ${plan.kunden.filter((x) => !x.lexware_kontakt_id).length} ohne Lexware-ID.`);
    if (fehler?.length) console.log(`Fehler beim Schreiben: ${fehler.length} (siehe Bericht)`);
    console.log(`Bericht: ${datei}`);
    process.exitCode = fehler?.length ? 1 : 0;
  } else {
  writeFileSync(datei, bericht({ plan, daten, ergebnis, fehler, nk, lex, proben, summen, vorhandeneAnzahl }));
  console.log(`${SCHREIBEN ? "Geschrieben" : "Probelauf"}: ${plan.kunden.length} Kunden, ${plan.anfragen.length} Anfragen, ${plan.auftraege.length} Aufträge, ${plan.belege.length} Belege, ${plan.ordner.length} Ordner, ${plan.aufgaben.length} Aufgaben.`);
  if (fehler?.length) console.log(`Fehler beim Schreiben: ${fehler.length} (siehe Bericht)`);
  console.log(`Bericht: ${datei}`);
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.end();
}
