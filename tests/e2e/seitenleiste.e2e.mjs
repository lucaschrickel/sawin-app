// End-to-End-Test der Seitenleiste: Gruppen und Reihenfolge wie in der Demo, „folgt“, Zähler, Einklappen.
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:seitenleiste
// Optional FOTOS=<Ordner> für Bildschirmfotos.
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;

// Reihenfolge und Gruppen aus docs/demo/sawin-demo.html (Funktion layout)
const DEMO = [
  ["Übersicht", ["Dashboard", "Aufgaben"]],
  ["Kunden & Anfragen", ["Kunden", "Anfragen"]],
  ["Belege", ["Alle Belege", "Angebote", "Aufträge", "Lieferscheine", "Abschlagsrechnungen", "Rechnungen", "Gutschriften"]],
  ["Montage & Service", ["Montageplan", "Service-Tickets", "Service-Plan"]],
  ["Einkauf", ["Lieferanten", "Bestellungen"]],
  ["Team und Ressourcen", ["Kalender", "Mitarbeiter", "Fahrzeuge", "Zeiterfassung", "Abwesenheiten"]],
  ["System", ["Einstellungen"]],
];
const FERTIG = ["Dashboard", "Aufgaben", "Kunden", "Anfragen", "Aufträge", "Montageplan", "Service-Tickets", "Service-Plan", "Kalender", "Mitarbeiter", "Fahrzeuge", "Zeiterfassung", "Abwesenheiten", "Lieferanten", "Bestellungen", "Einstellungen"];
const ZUSATZ = (process.env.FERTIG_ZUSATZ ?? "").split(",").filter(Boolean); // später gebaute Module

try {
  const admin = await testAdmin();
  b = await browser();
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");
  await b.warte("[...document.querySelectorAll('aside [data-folgt]')].some((x) => x.getClientRects().length)");

  // 1. Gruppen und Einträge in der Reihenfolge der Demo
  const ist = await b.js(`(() => { const a = document.querySelector('aside[aria-label=Hauptnavigation]'); const out = []; for (const g of a.children) { const k = g.querySelector('div.uppercase'); if (!k) continue; out.push([k.textContent.trim(), [...g.querySelectorAll('a, [data-folgt]')].map((x) => x.querySelector('span.truncate')?.textContent.trim())]); } return JSON.stringify(out); })()`);
  pruefe("Gruppen und Reihenfolge wie in der Demo", ist === JSON.stringify(DEMO), ist);
  pruefe("kein Designsystem in der Seitenleiste", !(await b.js("!!document.querySelector('aside a[href=\"/styleguide\"]')")));

  // 2. Fertige Module sind Links, die übrigen ausgegraut mit „folgt“
  const links = await b.js(`JSON.stringify([...document.querySelectorAll('aside a[href] span.truncate')].map((x) => x.textContent.trim()))`);
  const erwartet = DEMO.flatMap(([, l]) => l).filter((x) => FERTIG.includes(x) || ZUSATZ.includes(x));
  pruefe("Links genau für die fertigen Module", links === JSON.stringify(erwartet), links);
  const folgt = await b.js(`JSON.stringify([...document.querySelectorAll('aside [data-folgt]')].map((x) => ({ t: x.textContent.trim(), a: x.getAttribute('aria-disabled'), tag: x.tagName })))`);
  const folgtListe = JSON.parse(folgt);
  pruefe("übrige Module ausgegraut mit „folgt“, nicht anklickbar", folgtListe.length === 22 - erwartet.length && folgtListe.every((x) => x.t.endsWith("folgt") && x.a === "true" && x.tag === "SPAN"), folgt);
  pruefe("Fuß: Lexware nicht verbunden, Rolle „Admin · Büro“", (await b.text()).includes("Lexware nicht verbunden") && (await b.text()).includes("Admin · Büro"));

  // 3. Zähler: Anfragen offen, Abwesenheiten zur Genehmigung (rot)
  const zahl = (key) => b.js(`Number(document.querySelector("aside [data-zaehler='${key}']")?.textContent ?? 0)`);
  const anfragenVorher = await zahl("anfragen");
  const { data: kunde } = await service.from("kunde").insert({ name: `Leiste ${lauf}` }).select("id").single();
  merken("kunde", kunde.id);
  const { data: q } = await service.from("anfrage").insert({ titel: `Leistentest ${lauf}`, kunde_id: kunde.id }).select("id").single();
  merken("anfrage", q.id);
  const kz = "L" + lauf.replace(/[^a-f]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
  const { data: m } = await service.from("mitarbeiter").insert({ kuerzel: kz, name: `Leiste ${lauf}` }).select("id").single();
  merken("mitarbeiter", m.id);
  const { data: abw } = await service.from("abwesenheit").insert({ mitarbeiter_id: m.id, art: "urlaub", von: "2027-02-01", bis: "2027-02-02" }).select("id").single();
  merken("abwesenheit", abw.id);
  await b.gehe("/aufgaben");
  pruefe("Zähler Anfragen zählt die neue Anfrage", await b.warte(`Number(document.querySelector("aside [data-zaehler='anfragen']")?.textContent ?? 0) === ${anfragenVorher + 1}`));
  pruefe("Zähler Abwesenheiten rot hervorgehoben", await b.js(`document.querySelector("aside [data-zaehler='abwesenheiten']")?.className.includes("bg-tone-red-fg")`));

  // 4. Einklappen: Symbolleiste mit Zählern, gemerkt je Benutzer
  await b.klick("aside button[aria-label='Seitenleiste einklappen']");
  pruefe("eingeklappt: schmale Symbolleiste", await b.warte("document.querySelector('aside').getBoundingClientRect().width < 100"));
  pruefe("gespeichert", await (async () => { for (let i = 0; i < 20; i++) { const [r] = await dbAbfrage("select seitenleiste_eingeklappt e from public.benutzer_einstellung where benutzer_id = $1", [admin.id]); if (r?.e) return true; await sleep(250); } return false; })());
  (await dbAbfrage("select id from public.benutzer_einstellung where benutzer_id = $1", [admin.id])).forEach((x) => merken("benutzer_einstellung", x.id));
  if (fotos) await b.foto(path.join(fotos, "seitenleiste-eingeklappt.png"));
  await b.gehe("/kunden");
  pruefe("nach dem Laden weiter eingeklappt, Zähler am Symbol", await b.warte("document.querySelector('aside').getBoundingClientRect().width < 100 && [...document.querySelectorAll('aside i')].some((x) => x.getClientRects().length && Number(x.textContent) > 0)"));
  await b.klick("aside button[aria-label='Seitenleiste ausklappen']");
  pruefe("wieder ausgeklappt", await b.warte("document.querySelector('aside').getBoundingClientRect().width > 200"));
  if (fotos) await b.foto(path.join(fotos, "seitenleiste.png"));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
