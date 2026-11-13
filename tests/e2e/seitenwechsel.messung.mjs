// Messung der Seitenwechsel-Zeit im echten Browser (für die Entscheidung CSP mit Nonce oder Hash, docs/sicherheit.md M3).
// Klickt über die Seitenleiste durch die Hauptseiten und misst je Wechsel:
//   Rückmeldung = Klick bis die Adresse wechselt und Platzhalter oder Inhalt der neuen Seite sichtbar ist,
//   fertig      = Klick bis die neue Seite ohne Platzhalter vollständig da ist.
// Aufruf: App starten (npm run build && npx next start -p 3100), dann
//   APP_URL=http://localhost:3100 node tests/e2e/seitenwechsel.messung.mjs [Runden]
import { aufraeumen, browser, testAdmin } from "./hilfen.mjs";

const RUNDEN = Number(process.argv[2] ?? 3);
const SEITEN = ["/kunden", "/anfragen", "/belege", "/auftraege", "/montageplan", "/aufgaben", "/"];

const messen = (ziel) => `new Promise((fertig) => {
  const sichtbar = (el) => !!el && el.getClientRects().length > 0;
  const mains = () => [...document.querySelectorAll("main")].filter(sichtbar);
  const link = [...document.querySelectorAll("aside a[href]")].find((a) => a.getAttribute("href") === ${JSON.stringify(ziel)});
  if (!link) return fertig({ fehler: "Link fehlt" });
  const t0 = performance.now();
  let rueck = null;
  link.click();
  const schritt = () => {
    const t = performance.now() - t0;
    const da = location.pathname === ${JSON.stringify(ziel)};
    const m = mains();
    const platzhalter = m.some((x) => [...x.querySelectorAll("[data-platzhalter]")].some(sichtbar)) || [...document.querySelectorAll("[data-platzhalter]")].some(sichtbar);
    if (rueck === null && da) rueck = t;
    if (da && !platzhalter && m.length && m[0].innerText.trim().length > 20) return fertig({ rueck, fertig: t });
    if (t > 20000) return fertig({ fehler: "Zeitüberschreitung", rueck, fertig: t });
    requestAnimationFrame(schritt);
  };
  requestAnimationFrame(schritt);
})`;

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

let b;
try {
  const admin = await testAdmin();
  b = await browser();
  await b.anmelden(admin);
  // Seitenleiste streamt nach (Rahmen hinter Suspense)
  if (!(await b.warte(`!!document.querySelector('aside a[href="/kunden"]')`, 20000))) throw new Error("Seitenleiste fehlt");
  // Aufwärmen: jede Seite einmal (Server-Caches, Prefetch)
  for (const s of SEITEN) await b.js(messen(s));
  const werte = {};
  for (let r = 0; r < RUNDEN; r++) {
    for (const s of SEITEN) {
      const m = await b.js(messen(s));
      if (m?.fehler) console.error(`${s}: ${m.fehler}`);
      (werte[s] ??= []).push(m);
    }
  }
  const alle = Object.values(werte).flat().filter((m) => !m.fehler);
  console.log("Seite".padEnd(14), "Rückmeldung (Median)", "fertig (Median)");
  for (const [s, ms] of Object.entries(werte)) {
    const ok = ms.filter((m) => !m.fehler);
    console.log(s.padEnd(14), `${Math.round(median(ok.map((m) => m.rueck)))} ms`.padStart(20), `${Math.round(median(ok.map((m) => m.fertig)))} ms`.padStart(15));
  }
  console.log(
    "GESAMT".padEnd(14),
    `${Math.round(median(alle.map((m) => m.rueck)))} ms`.padStart(20),
    `${Math.round(median(alle.map((m) => m.fertig)))} ms`.padStart(15),
    `(${alle.length} Wechsel)`,
  );
} catch (e) {
  console.error(`Abbruch: ${e.message}`);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(0);
