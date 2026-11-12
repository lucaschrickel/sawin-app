// Go-live-Prüfung (Nummernkreise): Jeder Startwert der App muss über der höchsten Nummer im selben Format liegen, die es
// schon gibt – in der Datenbank (Datenübernahme) und in Lexware. Lexware wird nur gelesen (GET).
//
//   npm run golive:pruefen                       mit .env.local (Staging: Lexware = Testkonto, nur bedingt aussagekräftig)
//   npm run golive:pruefen -- --env=.env.produktion
//   … --ohne-lexware                             nur die Datenbank prüfen
//
// Exit-Code 1, wenn ein Startwert nicht passt.

import { existsSync } from "node:fs";
import pg from "pg";

const arg = (n) => (process.argv.includes(`--${n}`) ? true : process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("="));
const envDatei = arg("env") || ".env.local";
if (existsSync(envDatei)) process.loadEnvFile(envDatei);
const jahr = Number(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date()));

/**
 * Formate der App-Kreise: laufende Nummer aus einer Nummer lesen (null = anderes Format, kann nicht kollidieren).
 * Jährliche Kreise vergleichen nur Nummern desselben Jahres.
 */
const FORMAT = {
  angebot: { lexware: "quotation", lauf: (n, jj) => ((m) => (m && m[1] === jj ? Number(m[2]) : null))(/^AG1(\d{2})(\d+)$/.exec(n)) },
  auftragsbestaetigung: { lexware: "orderconfirmation", lauf: (n, jj) => ((m) => (m && m[1] === jj ? Number(m[2]) : null))(/^AB2(\d{2})(\d+)$/.exec(n)) },
  lieferschein: { lexware: "deliverynote", lauf: (n) => ((m) => (m ? Number(m[1]) : null))(/^LS(\d+)$/.exec(n)) },
  kunde: { lexware: null, lauf: (n) => (/^\d+$/.test(String(n)) ? Number(n) : null) },
};

async function lexwareLesen() {
  const key = process.env.LEXWARE_API_KEY?.trim();
  if (!key || arg("ohne-lexware")) return null;
  let zuletzt = 0;
  const get = async (pfad) => {
    for (let versuch = 0; ; versuch++) {
      const warten = zuletzt + 600 - Date.now();
      if (warten > 0) await new Promise((ok) => setTimeout(ok, warten));
      zuletzt = Date.now();
      const r = await fetch(`https://api.lexware.io${pfad}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
      if (r.status === 429 && versuch < 6) {
        await new Promise((ok) => setTimeout(ok, 1000 * 2 ** versuch));
        continue;
      }
      if (!r.ok) throw new Error(`Lexware ${pfad.split("?")[0]}: HTTP ${r.status}`);
      return r.json();
    }
  };
  const konto = (await get("/v1/profile")).companyName;
  const nummern = { quotation: [], orderconfirmation: [], deliverynote: [], kunde: [] };
  for (let seite = 0; seite < 100; seite++) {
    const r = await get(`/v1/voucherlist?voucherType=quotation,orderconfirmation,deliverynote&voucherStatus=any&size=250&page=${seite}`);
    for (const v of r.content) if (v.voucherNumber) nummern[v.voucherType]?.push(v.voucherNumber);
    if (r.last || !r.content.length) break;
  }
  for (let seite = 0; seite < 100; seite++) {
    const r = await get(`/v1/contacts?customer=true&size=250&page=${seite}`);
    for (const k of r.content) if (k.roles?.customer?.number != null) nummern.kunde.push(String(k.roles.customer.number));
    if (r.last || !r.content.length) break;
  }
  return { konto, nummern };
}

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
let fehler = 0;
try {
  const projekt = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://x").hostname.split(".")[0];
  const { rows: kreise } = await db.query("select art, muster, jaehrlich, jahr, letzte, start, start_jahr from public.nummernkreis where deleted_at is null and art = any($1)", [Object.keys(FORMAT)]);
  const { rows: belege } = await db.query("select art, nummer, airtable_id is not null as importiert from public.beleg where nummer is not null and art in ('angebot', 'auftragsbestaetigung', 'lieferschein')");
  const { rows: auftraege } = await db.query("select nummer from public.auftrag where nummer is not null");
  const { rows: kunden } = await db.query("select nummer, airtable_id is not null as importiert from public.kunde");
  const lex = await lexwareLesen();
  const sawin = process.env.LEXWARE_ALTBESTAND?.trim() === "aktiv";
  console.log(`Go-live-Prüfung Nummernkreise – Supabase-Projekt ${projekt}`);
  console.log(lex ? `Lexware: ${lex.konto}${sawin ? "" : " (nicht als Sawins Konto markiert: LEXWARE_ALTBESTAND ist nicht aktiv)"}` : "Lexware: nicht geprüft");
  console.log("");
  const zeilen = [["Kreis", "Startwert", "nächste Nummer", "höchste in der App", "höchste in Lexware", "Ergebnis"]];
  for (const k of kreise) {
    const f = FORMAT[k.art];
    const jj = String((k.jaehrlich ? (k.start_jahr ?? jahr) : jahr) % 100).padStart(2, "0");
    // Herkunft: übernommene Zeilen (airtable_id) tragen Nummern aus Airtable bzw. Lexware. Auftragsnummern unter dem
    // Startwert stammen aus der Übernahme, ab dem Startwert aus dem Kreis der App (Aufträge ohne AB).
    const zeilenApp = [
      ...(k.art === "kunde" ? kunden : belege.filter((b) => b.art === k.art)).map((x) => ({ nummer: x.nummer, importiert: x.importiert })),
      ...(k.art === "auftragsbestaetigung" ? auftraege.map((a) => ({ nummer: a.nummer, importiert: k.start == null || (f.lauf(a.nummer, jj) ?? 0) < k.start })) : []),
    ];
    const ausApp = zeilenApp.map((x) => x.nummer);
    const ausLex = lex ? (k.art === "kunde" ? lex.nummern.kunde : lex.nummern[f.lexware]) : [];
    const laeufe = (liste) => liste.map((n) => f.lauf(n, jj)).filter((x) => x != null);
    const max = (xs) => xs.reduce((m, x) => Math.max(m, x), 0);
    const neuJahr = k.jaehrlich && k.jahr !== jahr;
    const startGilt = k.start != null && (!k.jaehrlich || k.start_jahr === jahr);
    const naechste = Math.max(neuJahr ? 1 : k.letzte + 1, startGilt ? k.start : 0);
    // Fremde Nummern: aus der Übernahme (unter dem Startwert) und alle aus Lexware; die App selbst vergibt ab dem Startwert
    const fremd = max([...laeufe(zeilenApp.filter((x) => x.importiert).map((x) => x.nummer)), ...laeufe(ausLex)]);
    const eigene = max(laeufe(zeilenApp.filter((x) => !x.importiert).map((x) => x.nummer)));
    const app = max(laeufe(ausApp));
    const lw = max(laeufe(ausLex));
    const text = (n) => (k.art === "kunde" ? String(n) : k.muster.replace("{JJ}", jj).replace(/\{(N+)\}/, (_, s) => String(n).padStart(s.length, "0")));
    const probleme = [];
    if (k.start == null) probleme.push("kein Startwert");
    else if (k.start <= fremd) probleme.push(`Startwert nicht über ${text(fremd)} (Übernahme bzw. Lexware)`);
    if (naechste <= Math.max(fremd, eigene)) probleme.push("nächste Nummer schon vergeben");
    if (k.jaehrlich && k.start_jahr && k.start_jahr !== jahr) probleme.push(`Startwert gilt für ${k.start_jahr}, nicht ${jahr}`);
    if (probleme.length) fehler++;
    zeilen.push([k.art, k.start != null ? text(k.start) : "–", text(naechste), app ? text(app) : "–", lex ? (lw ? text(lw) : "–") : "nicht geprüft", probleme.length ? `FEHLER: ${probleme.join(", ")}` : "ok"]);
  }
  const breite = zeilen[0].map((_, i) => Math.max(...zeilen.map((z) => String(z[i]).length)));
  for (const z of zeilen) console.log(z.map((x, i) => String(x).padEnd(breite[i])).join("  "));
  console.log("");
  console.log("Kundennummern: Die App schickt keine Kundennummer an Lexware (Lexware lehnt eine vorgegebene Nummer ab und vergibt");
  console.log("eine eigene). App-Kunden ab dem Startwert und Lexwares Kundenkreis können sich deshalb nicht überschneiden.");
  if (fehler) console.log(`\n${fehler} Kreis(e) nicht in Ordnung.`);
  else console.log("\nAlle Startwerte liegen über den vorhandenen Nummern.");
} finally {
  await db.end();
}
process.exitCode = fehler ? 1 : 0;
