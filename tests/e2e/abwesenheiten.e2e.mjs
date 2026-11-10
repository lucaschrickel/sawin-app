// End-to-End-Test Modul Abwesenheiten mit einem Büro-Benutzer ohne Admin-Recht und einem Test-Admin (zwei Browser).
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:abwesenheiten
// Optional FOTOS=<Ordner> für Bildschirmfotos. Plant in der Woche ab 14.12.2026.
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
let buero, chef;
const sichtbar = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length > 0)`;
const setzeWert = (b, sel, wert) =>
  b.js(`(() => { const el = ${sichtbar(sel)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(wert)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
async function waehle(b, n, eintrag) {
  await b.js(`document.querySelectorAll('[role=dialog] button[role=combobox]')[${n}].setAttribute('data-e2e-select', '1')`);
  await b.klick("[data-e2e-select='1']");
  await b.js("document.querySelector(\"[data-e2e-select='1']\").removeAttribute('data-e2e-select')");
  await b.klickText("[role=option]", eintrag);
}
async function warteDb(sql, werte, pruef) {
  for (let i = 0; i < 30; i++) {
    const z = await dbAbfrage(sql, werte);
    if (pruef(z)) return true;
    await sleep(250);
  }
  return false;
}
async function imLetztenDialog(b, text) {
  await b.js(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].at(-1); const k = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); k.setAttribute('data-x', 'los'); })()`);
  await b.klick("[data-x='los']");
}
async function eintragen(b, { mitarbeiter, art, von, bis, direkt }) {
  await b.klickText("main button", "Abwesenheit eintragen");
  await waehle(b, 0, mitarbeiter);
  if (art) await waehle(b, 1, art);
  await setzeWert(b, "[role=dialog] [name=von]", von);
  await setzeWert(b, "[role=dialog] [name=bis]", bis);
  if (direkt) await b.klick("[role=dialog] [name=direkt]");
  await b.klickText("[role=dialog] button", "Speichern");
}

try {
  const [{ standard }] = await dbAbfrage("select urlaubsanspruch_tage as standard from public.einstellung");
  const adminNutzer = await testAdmin();
  const bueroNutzer = await testAdmin({ admin: false });
  const { data: kunde } = await service.from("kunde").insert({ name: `Urlaubskunde ${lauf}` }).select("id").single();
  merken("kunde", kunde.id);
  const { data: auftrag } = await service.from("auftrag").insert({ nummer: `U${lauf}`, kunde_id: kunde.id, titel: "Haustür" }).select("id, nummer").single();
  merken("auftrag", auftrag.id);
  const kz = (p) => p + lauf.replace(/[^a-f]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
  const { data: anna } = await service.from("mitarbeiter").insert({ kuerzel: kz("A"), name: `Anna Urlaub ${lauf}`, ist_monteur: true }).select("id, name").single();
  merken("mitarbeiter", anna.id);
  const { data: ben } = await service.from("mitarbeiter").insert({ kuerzel: kz("B"), name: `Ben Urlaub ${lauf}`, ist_monteur: true }).select("id, name").single();
  merken("mitarbeiter", ben.id);
  const { data: einsatz } = await service.from("einsatz").insert({ auftrag_id: auftrag.id, beginn: "2026-12-15T06:00:00Z", ende: "2026-12-15T15:00:00Z", fest: true }).select("id").single();
  merken("einsatz", einsatz.id);
  const { data: em } = await service.from("einsatz_monteur").insert({ einsatz_id: einsatz.id, mitarbeiter_id: anna.id }).select("id").single();
  merken("einsatz_monteur", em.id);
  const abwesenheitenMerken = async () => (await dbAbfrage("select id from public.abwesenheit where mitarbeiter_id = any($1)", [[anna.id, ben.id]])).forEach((x) => merken("abwesenheit", x.id));

  // ---------- Büro-Benutzer ohne Admin-Recht ----------
  buero = await browser();
  await buero.anmelden(bueroNutzer);
  await buero.warte("!location.pathname.startsWith('/anmelden')");

  // 1. Urlaubsantrag, Person ist eingeplant → Antrag und Warnung, kein „Direkt genehmigen“
  await buero.gehe("/abwesenheiten");
  pruefe("Navigation zeigt Abwesenheiten", await buero.js("[...document.querySelectorAll('aside a[href]')].some((a) => a.getAttribute('href') === '/abwesenheiten')"));
  await buero.klickText("main button", "Abwesenheit eintragen");
  pruefe("ohne Admin-Recht kein „Direkt genehmigen“", !(await buero.js("!!document.querySelector('[role=dialog] [name=direkt]')")));
  await buero.klickText("[role=dialog] button", "Abbrechen");
  await eintragen(buero, { mitarbeiter: anna.name, von: "2026-12-14", bis: "2026-12-18" });
  pruefe("Antrag gestellt, Warnung: eingeplant bei Auftrag", await buero.warte(`(() => { const d = document.querySelector('[role=dialog]')?.innerText ?? ""; return d.includes("Antrag gestellt") && d.includes("eingeplant bei ${auftrag.nummer}"); })()`));
  await buero.klickText("[role=dialog] button", "Schließen");
  await buero.warte("!document.querySelector('[role=dialog]')");
  await abwesenheitenMerken();
  const [antrag] = await dbAbfrage("select id, status, art from public.abwesenheit where mitarbeiter_id = $1", [anna.id]);
  pruefe("als „beantragt“ gespeichert", antrag?.status === "beantragt" && antrag?.art === "urlaub");

  // 2. Genehmigungsübersicht: wer, was, wann, Arbeitstage, Resturlaub, Planungskonflikt; nur Admin entscheidet
  pruefe("Zur Genehmigung: Anna, Urlaub, 5 Arbeitstage, Resturlaub, eingeplant", await buero.warte(`(() => { const z = document.querySelector("[data-antrag='${antrag.id}']")?.innerText ?? ""; return z.includes("Anna Urlaub ${lauf}") && z.includes("Urlaub") && z.includes("14.12.2026 – 18.12.2026") && z.includes("5 Arbeitstage") && z.includes("Resturlaub danach ${standard - 5} Tage") && z.includes("Eingeplant bei"); })()`));
  pruefe("Büro sieht „wartet auf Admin“, keine Knöpfe", await buero.js(`(() => { const z = document.querySelector("[data-antrag='${antrag.id}']"); return z.innerText.includes("wartet auf Admin") && ![...z.querySelectorAll("button")].some((b) => b.textContent.includes("Genehmigen")); })()`));
  if (fotos) await buero.foto(path.join(fotos, "abwesenheiten-buero.png"));

  // 3. Krankmeldung gilt sofort; das Büro darf sie löschen
  await eintragen(buero, { mitarbeiter: ben.name, art: "Krank", von: heute, bis: heute });
  await buero.warte("!document.querySelector('[role=dialog]')");
  await abwesenheitenMerken();
  const [krank] = await dbAbfrage("select id, status from public.abwesenheit where mitarbeiter_id = $1 and art = 'krank'", [ben.id]);
  pruefe("Krankmeldung sofort genehmigt", krank?.status === "genehmigt");
  await buero.gehe("/abwesenheiten");
  await buero.klick(`[data-abwesenheit-zeile='${krank.id}'] button[aria-label$='löschen']`);
  await imLetztenDialog(buero, "Löschen");
  pruefe("Büro löscht die Krankmeldung (nur Markierung)", await warteDb("select deleted_at from public.abwesenheit where id = $1", [krank.id], (r) => !!r[0]?.deleted_at));

  // ---------- Admin ----------
  chef = await browser();
  await chef.anmelden(adminNutzer);
  await chef.warte("!location.pathname.startsWith('/anmelden')");

  // 4. Genehmigen
  await chef.gehe("/abwesenheiten");
  await chef.warte(`!!document.querySelector("[data-antrag='${antrag.id}']")`);
  await chef.js(`[...document.querySelectorAll("[data-antrag='${antrag.id}'] button")].find((b) => b.textContent.includes("Genehmigen")).setAttribute("data-x", "gen")`);
  await chef.klick("[data-x='gen']");
  pruefe("Admin genehmigt, entschieden_von = Admin", await warteDb("select status, entschieden_von from public.abwesenheit where id = $1", [antrag.id], (r) => r[0]?.status === "genehmigt" && r[0]?.entschieden_von === adminNutzer.id));
  pruefe("Urlaubskonto: 5 genehmigt, Rest", await chef.warte(`(() => { const t = document.querySelector("[data-konto='${anna.id}']")?.innerText ?? ""; return t.includes("${standard - 5} von ${standard} übrig") && t.includes("5 genehmigt"); })()`));

  // 5. Plantafel: genehmigter Urlaub sichtbar, Einsatz am 15.12. als Konflikt markiert
  await chef.gehe("/montageplan?woche=2026-12-14");
  pruefe("Plantafel zeigt den genehmigten Urlaub", await chef.warte(`document.querySelectorAll("[data-monteur-zeile='${anna.id}'] [data-abwesenheit='genehmigt']").length === 5`));
  pruefe("Einsatz im Urlaub als Konflikt markiert", await chef.js(`document.querySelector("[data-monteur-zeile='${anna.id}'] [data-einsatz='${einsatz.id}']")?.dataset.konflikt === "1"`));
  if (fotos) await chef.foto(path.join(fotos, "abwesenheiten-plantafel.png"));

  // 6. Direkt genehmigen (Admin) und Ablehnen
  await chef.gehe("/abwesenheiten");
  await eintragen(chef, { mitarbeiter: ben.name, art: "Schulung", von: "2026-12-21", bis: "2026-12-21", direkt: true });
  await chef.warte("!document.querySelector('[role=dialog]')");
  await abwesenheitenMerken();
  pruefe("Admin: direkt genehmigt", await warteDb("select status from public.abwesenheit where mitarbeiter_id = $1 and art = 'schulung'", [ben.id], (r) => r[0]?.status === "genehmigt"));
  await eintragen(chef, { mitarbeiter: ben.name, art: "Sonstiges", von: "2026-12-22", bis: "2026-12-22" });
  await chef.warte("!document.querySelector('[role=dialog]')");
  await abwesenheitenMerken();
  const [sonst] = await dbAbfrage("select id from public.abwesenheit where mitarbeiter_id = $1 and art = 'sonstiges'", [ben.id]);
  await chef.warte(`!!document.querySelector("[data-antrag='${sonst.id}']")`);
  await chef.js(`[...document.querySelectorAll("[data-antrag='${sonst.id}'] button")].find((b) => b.textContent.includes("Ablehnen")).setAttribute("data-x", "ab")`);
  await chef.klick("[data-x='ab']");
  pruefe("Admin lehnt ab", await warteDb("select status from public.abwesenheit where id = $1", [sonst.id], (r) => r[0]?.status === "abgelehnt"));
  if (fotos) await chef.foto(path.join(fotos, "abwesenheiten-admin.png"));

  // 7. Büro darf den genehmigten Urlaub nicht löschen, der Admin schon
  await buero.gehe("/abwesenheiten");
  await buero.warte(`!!document.querySelector("[data-abwesenheit-zeile='${antrag.id}']")`);
  pruefe("Büro: kein Löschen beim genehmigten Urlaub", !(await buero.js(`!!document.querySelector("[data-abwesenheit-zeile='${antrag.id}'] button")`)));
  await chef.gehe("/abwesenheiten");
  await chef.klick(`[data-abwesenheit-zeile='${antrag.id}'] button[aria-label$='löschen']`);
  pruefe("Löschen fragt nach", await chef.enthaelt("Abwesenheit löschen?"));
  await imLetztenDialog(chef, "Löschen");
  pruefe("Admin löscht (nur Markierung)", await warteDb("select deleted_at from public.abwesenheit where id = $1", [antrag.id], (r) => !!r[0]?.deleted_at));
  await chef.gehe("/montageplan?woche=2026-12-14");
  pruefe("Urlaub nicht mehr in der Plantafel", await chef.warte(`!!document.querySelector('[data-tafel]') && !document.querySelector("[data-monteur-zeile='${anna.id}'] [data-abwesenheit]")`));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  buero?.ende();
  chef?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
