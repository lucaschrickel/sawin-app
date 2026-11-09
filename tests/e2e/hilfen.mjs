// Gemeinsame Hilfen für End-to-End-Tests im echten Browser (Chrome headless über das DevTools-Protokoll)
// gegen eine laufende App und das Supabase-Projekt aus .env.local (nur Staging).
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
export const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const { NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SERVICE_ROLE_KEY: SECRET, SUPABASE_DB_URL: DB_URL } = process.env;
if (!URL_ || !PUB || !SECRET || !DB_URL) throw new Error("Supabase-Variablen und SUPABASE_DB_URL werden benötigt");

export const service = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
export const lauf = randomBytes(3).toString("hex");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Ergebnisse ----------
const ergebnisse = [];
export function pruefe(name, ok, info = "") {
  ergebnisse.push({ name, ok: !!ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${info ? ` (${info})` : ""}`);
}
export function bilanz() {
  const fehler = ergebnisse.filter((e) => !e.ok).length;
  console.log(`\n${ergebnisse.length - fehler} von ${ergebnisse.length} bestanden`);
  return fehler;
}

// ---------- TOTP ----------
function base32(t) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of t.replace(/[\s=]/g, "").toUpperCase()) bits += abc.indexOf(c).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
export function totp(secret) {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", base32(secret)).update(c).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

// ---------- Testbenutzer ----------
const nutzer = [];
const zeilen = []; // [tabelle, id] zum Aufräumen
export const merken = (tabelle, id) => zeilen.push([tabelle, id]);

/** Test-Admin mit eingerichtetem TOTP-Faktor (über die API, ohne Browser). */
export async function testAdmin({ konditionen = true } = {}) {
  const email = `e2e-${lauf}@example.com`;
  const passwort = `Test-${randomBytes(6).toString("hex")}A1`;
  const { data, error } = await service.auth.admin.createUser({ email, password: passwort, email_confirm: true });
  if (error) throw error;
  nutzer.push(data.user.id);
  const ins = await service.from("benutzer").insert({ id: data.user.id, name: `E2E Admin ${lauf}`, email, admin: true, konditionen });
  if (ins.error) throw ins.error;
  const c = createClient(URL_, PUB, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: passwort });
  const enr = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: `e2e-${lauf}` });
  if (enr.error) throw enr.error;
  const ver = await c.auth.mfa.challengeAndVerify({ factorId: enr.data.id, code: totp(enr.data.totp.secret) });
  if (ver.error) throw ver.error;
  return { id: data.user.id, email, passwort, secret: enr.data.totp.secret };
}

/** Weiterer Benutzer ohne Anmeldung (z. B. als Zuständiger für Aufgaben). */
export async function weitererBenutzer(name) {
  const email = `e2e-${lauf}-${randomBytes(2).toString("hex")}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, password: `Test-${randomBytes(6).toString("hex")}A1`, email_confirm: true });
  if (error) throw error;
  nutzer.push(data.user.id);
  const ins = await service.from("benutzer").insert({ id: data.user.id, name: `${name} ${lauf}`, email });
  if (ins.error) throw ins.error;
  return { id: data.user.id, name: `${name} ${lauf}` };
}

/** Entfernt alle gemerkten Zeilen und Testbenutzer (über die Datenbankverbindung, die API löscht nie echt). */
export async function aufraeumen() {
  const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    for (const [t, id] of [...zeilen].reverse()) await db.query(`delete from public.${pg.escapeIdentifier(t)} where id = $1`, [id]);
    for (const id of nutzer) await db.query("delete from public.benutzer where id = $1", [id]);
  } finally {
    await db.end();
  }
  for (const id of nutzer) await service.auth.admin.deleteUser(id);
}
export async function dbAbfrage(sql, werte = []) {
  const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    return (await db.query(sql, werte)).rows;
  } finally {
    await db.end();
  }
}

// ---------- Browser ----------
export async function browser() {
  const chrome =
    process.env.CHROME_PATH ??
    ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);
  if (!chrome) throw new Error("Chrome nicht gefunden (CHROME_PATH setzen)");
  const profil = mkdtempSync(path.join(os.tmpdir(), "e2e-chrome-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`, "about:blank"], { stdio: "ignore" });
  let liste;
  for (let i = 0; i < 40 && !liste?.length; i++) {
    try { liste = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === "page"); } catch { await sleep(250); }
  }
  const ws = new WebSocket(liste[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const offen = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && offen[d.id]) { offen[d.id](d); delete offen[d.id]; } };
  const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; offen[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  // Headless-Seiten haben keinen Fenster-Fokus; ohne Emulation schlagen focus() und Zeigerereignisse teils fehl
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });

  const js = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const warte = async (expr, ms = 15000) => {
    const ende = Date.now() + ms;
    while (Date.now() < ende) {
      try { if (await js(expr)) return true; } catch { /* lädt */ }
      await sleep(150);
    }
    return false;
  };
  const q = (s) => JSON.stringify(s);
  // Erstes sichtbares Element: Next.js hält zuletzt besuchte Seiten versteckt im DOM (React Activity),
  // ein einfaches querySelector träfe sonst z. B. das versteckte Feld der Anmeldeseite.
  const F = "((s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length > 0) ?? null)";
  const da = (sel) => warte(`!!${F}(${q(sel)})`);
  /** Echter Mausklick auf die Mitte des Elements (Radix reagiert auf Zeigerereignisse). */
  const klick = async (sel) => {
    if (!(await da(sel))) throw new Error(`Element fehlt: ${sel}`);
    const r = await js(`(() => { const el = ${F}(${q(sel)}); el.scrollIntoView({ block: "center" }); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y, buttons: 0 });
    await sleep(60);
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", buttons: 1, clickCount: 1 });
    await sleep(40);
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", buttons: 0, clickCount: 1 });
    await sleep(150);
  };
  /** Klick auf ein Element mit sichtbarem Text (z. B. Knopf oder Auswahleintrag). */
  const klickText = async (tag, text) => {
    const sel = `[data-e2e-ziel="${lauf}"]`;
    const ok = await warte(`(() => { document.querySelectorAll(${q(sel)}).forEach((e) => e.removeAttribute("data-e2e-ziel")); const el = [...document.querySelectorAll(${q(tag)})].find((e) => e.offsetParent !== null && e.textContent.trim() === ${q(text)}); if (el) el.setAttribute("data-e2e-ziel", ${q(lauf)}); return !!el; })()`);
    if (!ok) throw new Error(`Kein ${tag} mit Text „${text}“`);
    await klick(sel);
  };
  /**
   * Feld leeren und Text wie über die Tastatur eingeben. Prüft Fokus und Ergebnis und wiederholt, falls React die
   * Seite gerade erst übernimmt (Hydration) oder ein Neu-Rendern den Fokus verschoben hat.
   */
  const tippe = async (sel, text) => {
    for (let versuch = 1; versuch <= 6; versuch++) {
      if (!(await da(sel))) throw new Error(`Feld fehlt: ${sel}`);
      await klick(sel);
      const fokus = await js(`(() => { const el = ${F}(${q(sel)}); if (document.activeElement !== el) el.focus(); el.select?.(); return document.activeElement === el; })()`);
      if (!fokus) { await sleep(250); continue; }
      await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      if (text) await cdp("Input.insertText", { text });
      await sleep(80);
      if (await js(`${F}(${q(sel)})?.value === ${q(text)}`)) return;
      await sleep(250);
    }
    throw new Error(`Eingabe in ${sel} fehlgeschlagen`);
  };
  const taste = async (key, code = key, vk = 0) => {
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
  };
  const gehe = async (url) => { await cdp("Page.navigate", { url: APP + url }); await sleep(300); await warte("document.readyState === 'complete'"); };
  const pfad = () => js("location.pathname + location.search");
  const text = () => js("document.body.innerText");
  const enthaelt = (t, ms) => warte(`document.body.innerText.includes(${q(t)})`, ms);
  const foto = async (datei) => {
    const r = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(datei, Buffer.from(r.result.data, "base64"));
  };
  /** Anmeldung mit Passwort und Code bis in die App. */
  const anmelden = async (admin) => {
    await gehe("/anmelden");
    await tippe("[name=email]", admin.email);
    await tippe("[name=passwort]", admin.passwort);
    await klick("button[type=submit]");
    if (!(await warte("location.pathname === '/anmelden/code' && !!document.querySelector('[name=code]')"))) {
      const felder = await js("JSON.stringify({ email: document.querySelector('[name=email]')?.value, pwLaenge: document.querySelector('[name=passwort]')?.value.length })");
      throw new Error(`Code-Seite fehlt (${await pfad()}) · Felder ${felder} · Seite: ${(await js("document.querySelector('main')?.innerText") ?? "").replace(/\s+/g, " ").slice(0, 160)}`);
    }
    await tippe("[name=code]", totp(admin.secret));
    await klick("button[type=submit]");
    if (!(await warte("!location.pathname.startsWith('/anmelden')"))) throw new Error(`Anmeldung fehlgeschlagen (${await pfad()})`);
  };
  const ende = () => { ws.close(); proc.kill(); try { rmSync(profil, { recursive: true, force: true }); } catch { /* belegt */ } };
  return { cdp, js, warte, da, klick, klickText, tippe, taste, gehe, pfad, text, enthaelt, foto, anmelden, ende };
}
