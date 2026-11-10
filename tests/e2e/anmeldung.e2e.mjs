// End-to-End-Test der Anmeldung im echten Browser (Chrome headless über das DevTools-Protokoll) gegen eine laufende
// App und das Supabase-Projekt aus .env.local (nur Staging).
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:anmeldung
// Optional CHROME_PATH, falls Chrome nicht am Standardort liegt.
//
// Einladungs- und Passwort-Links holt der Test über die Admin-API (generateLink), es werden keine E-Mails verschickt.
// Testbenutzer und ihre Daten entfernt er am Ende über SUPABASE_DB_URL.
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const { NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: SECRET, SUPABASE_DB_URL: DB_URL } = process.env;
if (!URL_ || !SECRET || !DB_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und SUPABASE_DB_URL werden benötigt");
const CHROME =
  process.env.CHROME_PATH ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);
if (!CHROME) throw new Error("Chrome nicht gefunden (CHROME_PATH setzen)");

const service = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const lauf = randomBytes(3).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ergebnisse = [];
const pruefe = (name, ok, info = "") => {
  ergebnisse.push({ name, ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${info ? ` (${info})` : ""}`);
};

// ---------- TOTP ----------
function base32(t) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of t.replace(/[\s=]/g, "").toUpperCase()) bits += abc.indexOf(c).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret, t = Date.now()) {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac("sha1", base32(secret)).update(c).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}
// Neuen Code erst im nächsten 30-Sekunden-Fenster (ein Code gilt nur einmal)
async function frischerCode(secret, letzter) {
  let c = totp(secret);
  while (c === letzter) {
    await sleep(1000);
    c = totp(secret);
  }
  return c;
}

// ---------- Browser ----------
const profil = mkdtempSync(path.join(os.tmpdir(), "e2e-chrome-"));
const PORT = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "about:blank"], { stdio: "ignore" });
let ws, id = 0;
const offen = {};
async function verbinden() {
  let liste;
  for (let i = 0; i < 40 && !liste?.length; i++) {
    try { liste = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === "page"); } catch { await sleep(250); }
  }
  ws = new WebSocket(liste[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && offen[d.id]) { offen[d.id](d); delete offen[d.id]; } };
  await cdp("Page.enable");
  await cdp("Network.enable");
}
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; offen[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
async function js(expr) {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
}
async function warte(expr, ms = 15000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    try { if (await js(expr)) return true; } catch { /* Seite lädt */ }
    await sleep(200);
  }
  return false;
}
const pfad = () => js("location.pathname + location.search");
async function gehe(url) { await cdp("Page.navigate", { url: APP + url }); await sleep(400); await warte("document.readyState === 'complete'"); }
// Wartet, bis die Felder dieses Schritts da sind (nach einer Weiterleitung steht die neue URL schon, bevor der neue
// Inhalt gerendert ist), füllt sie aus und sendet ab.
async function formular(felder, knopf = 'button[type=submit]') {
  const da = [knopf, ...Object.keys(felder).map((n) => `[name=${n}]`)].map((s) => `!!document.querySelector(${JSON.stringify(s)})`).join(" && ");
  if (!(await warte(da))) throw new Error(`Formularfelder fehlen: ${Object.keys(felder).join(", ")} auf ${await pfad()}`);
  await sleep(300);
  for (const [name, wert] of Object.entries(felder)) {
    await js(`(() => { const el = document.querySelector('[name=${name}]'); el.value = ${JSON.stringify(wert)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  }
  await js(`document.querySelector(${JSON.stringify(knopf)}).click()`);
}
const text = () => js("document.body.innerText");
async function abmeldenKlicken() {
  const knopf = "form[action='/abmelden'] button";
  if (!(await warte(`!!document.querySelector("${knopf}")`))) throw new Error("Abmelden-Knopf fehlt");
  await js(`document.querySelector("${knopf}").click()`);
}

// ---------- Testbenutzer ----------
const email = `e2e-${lauf}@example.com`;
const passwort = `Start-${randomBytes(6).toString("hex")}A1`;
const neuesPasswort = `Neu-${randomBytes(6).toString("hex")}B2`;
const einladungEmail = `e2e-${lauf}-neu@example.com`;
const nutzer = [];

async function aufraeumen() {
  const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    for (const u of nutzer) await db.query("delete from public.benutzer where id = $1", [u]);
  } finally { await db.end(); }
  for (const u of nutzer) await service.auth.admin.deleteUser(u);
}

try {
  const { data: angelegt, error } = await service.auth.admin.createUser({ email, password: passwort, email_confirm: true });
  if (error) throw error;
  nutzer.push(angelegt.user.id);
  await service.from("benutzer").insert({ id: angelegt.user.id, name: `E2E Admin ${lauf}`, email, admin: true });
  await verbinden();

  // 1. Ohne Anmeldung keine App-Seite
  await gehe("/styleguide");
  pruefe("ohne Anmeldung: Umleitung auf /anmelden", (await pfad()).startsWith("/anmelden"), await pfad());
  await gehe("/einstellungen/benutzer");
  pruefe("ohne Anmeldung: Benutzerverwaltung gesperrt", (await pfad()).startsWith("/anmelden"));

  // 2. Falsches Passwort
  await formular({ email, passwort: "falsch-falsch-1A" });
  await warte("document.body.innerText.includes('falsch')");
  pruefe("falsches Passwort: allgemeine Fehlermeldung", (await text()).includes("E-Mail oder Passwort ist falsch"));

  // 3. Erste Anmeldung: Passwort, dann Einrichtung des zweiten Faktors
  await gehe("/anmelden");
  await formular({ email, passwort });
  pruefe("ohne Faktor: weiter zur Einrichtung", await warte("location.pathname === '/anmelden/einrichten'"), await pfad());
  await gehe("/styleguide");
  pruefe("ohne zweiten Faktor keine App-Seite", (await pfad()).startsWith("/anmelden/einrichten"), await pfad());
  await warte("!!document.querySelector('details code')");
  const secret = (await js("document.querySelector('details code').textContent")).replace(/\s/g, "");
  let code = totp(secret);
  await formular({ code });
  pruefe("Einrichtung abgeschlossen, App erreichbar", await warte("location.pathname === '/'"), await pfad());
  pruefe("Benutzername in der Seitenleiste", await warte(`document.body.innerText.includes(${JSON.stringify(`E2E Admin ${lauf}`)})`));

  // 4. Benutzerverwaltung (Admin)
  await gehe("/einstellungen/benutzer");
  await warte("document.body.innerText.includes('Benutzer einladen')");
  pruefe("Admin sieht die Benutzerverwaltung", (await text()).includes(email));

  // 5. Abmelden und erneut anmelden mit Code
  await abmeldenKlicken();
  pruefe("Abmelden", await warte("location.pathname === '/anmelden'"), await pfad());
  await formular({ email, passwort });
  pruefe("zweite Anmeldung fragt den Code ab", await warte("location.pathname === '/anmelden/code'"), await pfad());
  await formular({ code: "000000" });
  await warte("document.body.innerText.includes('Code stimmt nicht')");
  pruefe("falscher Code wird abgelehnt", (await text()).includes("Der Code stimmt nicht"));
  code = await frischerCode(secret, code);
  await formular({ code });
  pruefe("richtiger Code: angemeldet", await warte("location.pathname === '/'"), await pfad());

  // 6. Nicht-Admin: keine Benutzerverwaltung
  await service.from("benutzer").update({ admin: false }).eq("id", angelegt.user.id);
  await gehe("/einstellungen/benutzer");
  pruefe("Nicht-Admin wird aus der Benutzerverwaltung umgeleitet", !(await pfad()).startsWith("/einstellungen"), await pfad());
  await service.from("benutzer").update({ admin: true }).eq("id", angelegt.user.id);

  // 7. Inaktivität: Zeitstempel älter als 60 Minuten
  const host = new URL(APP).hostname;
  await cdp("Network.setCookie", { name: "app_letzte_aktivitaet", value: String(Date.now() - 61 * 60_000), domain: host, path: "/", httpOnly: true });
  await gehe("/styleguide");
  pruefe("nach 60 Minuten ohne Aktivität abgemeldet", (await pfad()) === "/anmelden?grund=inaktiv", await pfad());
  pruefe("Hinweis auf der Anmeldeseite", (await text()).includes("ohne Aktivität abgemeldet"));

  // 8. Passwort vergessen (Link über die Admin-API statt E-Mail)
  const { data: rec } = await service.auth.admin.generateLink({ type: "recovery", email });
  await gehe(`/auth/bestaetigen?token_hash=${rec.properties.hashed_token}&type=recovery`);
  await formular({});
  pruefe("Passwort-Link verlangt zuerst den Code", await warte("location.pathname === '/anmelden/code'"), await pfad());
  code = await frischerCode(secret, code);
  await formular({ code });
  pruefe("dann Passwort setzen", await warte("location.pathname === '/passwort-setzen'"), await pfad());
  // Browser-Prüfung (minLength) abschalten, damit die Regel auf dem Server geprüft wird
  await warte("!!document.querySelector('form')");
  await js("document.querySelectorAll('form').forEach((f) => { f.noValidate = true; })");
  await formular({ passwort: "kurz", passwort2: "kurz" });
  await warte("document.body.innerText.includes('Mindestens 12')");
  pruefe("zu kurzes Passwort abgelehnt", (await text()).includes("Mindestens 12 Zeichen"));
  await formular({ passwort: neuesPasswort, passwort2: neuesPasswort });
  pruefe("neues Passwort gespeichert", await warte("location.pathname === '/'"), await pfad());
  await abmeldenKlicken();
  await warte("location.pathname === '/anmelden'");
  await formular({ email, passwort });
  await warte("document.body.innerText.includes('falsch')");
  pruefe("altes Passwort gilt nicht mehr", (await text()).includes("E-Mail oder Passwort ist falsch"));
  await gehe("/anmelden");
  await formular({ email, passwort: neuesPasswort });
  pruefe("neues Passwort gilt", await warte("location.pathname === '/anmelden/code'"), await pfad());

  // 9. Gebrauchter Link ist ungültig
  await gehe(`/auth/bestaetigen?token_hash=${rec.properties.hashed_token}&type=recovery`);
  await formular({});
  pruefe("Link nur einmal gültig", await warte("location.search.includes('grund=link')"), await pfad());

  // 10. Einladung annehmen (Link über die Admin-API statt E-Mail)
  const { data: inv } = await service.auth.admin.generateLink({ type: "invite", email: einladungEmail });
  nutzer.push(inv.user.id);
  await service.from("benutzer").insert({ id: inv.user.id, name: `E2E Neu ${lauf}`, email: einladungEmail });
  await gehe(`/auth/bestaetigen?token_hash=${inv.properties.hashed_token}&type=invite`);
  pruefe("Einladungsseite", (await text()).includes("Einladung annehmen"));
  await formular({});
  pruefe("Einladung: Passwort setzen", await warte("location.pathname === '/passwort-setzen'"), await pfad());
  const pwNeu = `Neu-${randomBytes(6).toString("hex")}C3`;
  await formular({ passwort: pwNeu, passwort2: pwNeu });
  pruefe("Einladung: danach Einrichtung des Faktors", await warte("location.pathname === '/anmelden/einrichten'"), await pfad());
  await warte("!!document.querySelector('details code')");
  const secret2 = (await js("document.querySelector('details code').textContent")).replace(/\s/g, "");
  await formular({ code: totp(secret2) });
  pruefe("Einladung: angemeldet", await warte("location.pathname === '/'"), await pfad());

  // 11. Deaktivierter Benutzer verliert den Zugriff sofort
  await service.from("benutzer").update({ aktiv: false }).eq("id", inv.user.id);
  await gehe("/styleguide");
  pruefe("deaktiviert: abgemeldet mit Hinweis", (await pfad()) === "/anmelden?grund=gesperrt", await pfad());
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  ws?.close();
  chrome.kill();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome hält noch Dateien */ }
}
const fehler = ergebnisse.filter((e) => !e.ok).length;
console.log(`\n${ergebnisse.length - fehler} von ${ergebnisse.length} bestanden`);
process.exit(fehler ? 1 : 0);
