// End-to-End-Test der Content-Security-Policy mit Nonce (docs/sicherheit.md M3) und der Cache-Header (F124):
// Auf den wichtigsten Seiten darf der Browser keinen CSP-Verstoß melden (sonst wären Skripte oder Inhalte blockiert),
// jede Antwort trägt eine eigene Nonce und „Cache-Control: private, no-store“, fremde Skripte werden blockiert.
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:csp
import { aufraeumen, bilanz, browser, pruefe, testAdmin } from "./hilfen.mjs";

const SEITEN = ["/", "/kunden", "/anfragen", "/belege", "/auftraege", "/beleg/neu?art=angebot", "/montageplan", "/kalender", "/einstellungen/darstellung", "/styleguide", "/gibt-es-nicht"];

let b;
try {
  const admin = await testAdmin();
  b = await browser();
  // Jede geladene Seite sammelt CSP-Verstöße, bevor ihre eigenen Skripte laufen
  await b.cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + (e.blockedURI || "inline")));`,
  });
  await b.anmelden(admin);

  for (const s of SEITEN) {
    await b.gehe(s);
    await b.warte("document.readyState === 'complete' && !!document.querySelector('main, [data-fehlerseite]')", 20000);
    await new Promise((r) => setTimeout(r, 800));
    const verstoesse = await b.js("JSON.stringify(window.__csp ?? ['Zähler fehlt'])");
    pruefe(`keine CSP-Verstöße auf ${s}`, verstoesse === "[]", verstoesse);
  }
  pruefe("404-Seite auf Deutsch", await b.enthaelt("Seite nicht gefunden"));

  const kopf = JSON.parse(
    await b.js(`(async () => { const a = await fetch("/kunden"); const c = await fetch("/kunden"); return JSON.stringify({ csp: a.headers.get("content-security-policy"), csp2: c.headers.get("content-security-policy"), cache: a.headers.get("cache-control") }); })()`),
  );
  pruefe("CSP mit Nonce und strict-dynamic, ohne unsafe-inline für Skripte", /script-src[^;]*'nonce-[^']+'[^;]*'strict-dynamic'/.test(kopf.csp ?? "") && !/script-src[^;]*unsafe-inline/.test(kopf.csp ?? ""), kopf.csp);
  pruefe("neue Nonce je Anfrage", kopf.csp !== kopf.csp2);
  pruefe("Seiten nicht zwischenspeicherbar (private, no-store)", /private/.test(kopf.cache ?? "") && /no-store/.test(kopf.cache ?? ""), kopf.cache);

  // Eingeschleustes HTML mit Inline-Handler (typischer XSS-Weg) wird blockiert
  await b.gehe("/kunden");
  await b.js(`(() => { window.__csp = []; window.__lief = false; document.body.insertAdjacentHTML("beforeend", '<img src="/gibt-es-nicht.png" onerror="window.__lief = true">'); })()`);
  await new Promise((r) => setTimeout(r, 1000));
  pruefe("eingeschleuster Inline-Handler blockiert", (await b.js("window.__lief")) === false && (await b.js("window.__csp.length")) > 0);
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
