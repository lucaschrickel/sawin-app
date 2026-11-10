// End-to-End-Test Modul Zeiterfassung mit einem vorübergehenden Test-Admin.
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:zeiten
// Optional FOTOS=<Ordner> für Bildschirmfotos. Bucht in der Woche ab 09.11.2026.
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
const WOCHE = "2026-11-09";
let b;
const sichtbar = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length > 0)`;
/** Wert in ein Feld schreiben, auch wenn React es steuert (nativer Setter) */
const setzeWert = (sel, wert) =>
  b.js(`(() => { const el = ${sichtbar(sel)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(wert)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
async function waehle(n, eintrag) {
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
async function imLetztenDialog(text) {
  await b.js(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].at(-1); const k = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); k.setAttribute('data-x', 'los'); })()`);
  await b.klick("[data-x='los']");
}
const main = () => b.js("document.querySelector('main')?.innerText ?? ''");

try {
  const admin = await testAdmin();
  const { data: kunde } = await service.from("kunde").insert({ name: `Zeitkunde ${lauf}` }).select("id, name").single();
  merken("kunde", kunde.id);
  const { data: auftrag } = await service.from("auftrag").insert({ nummer: `Z${lauf}`, kunde_id: kunde.id, titel: `Fenster ${lauf}` }).select("id, nummer").single();
  merken("auftrag", auftrag.id);
  const kz = (p) => p + lauf.replace(/[^a-f]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
  const { data: anna } = await service.from("mitarbeiter").insert({ kuerzel: kz("A"), name: `Anna Zeit ${lauf}`, ist_monteur: true }).select("id, name").single();
  merken("mitarbeiter", anna.id);
  const { data: ben } = await service.from("mitarbeiter").insert({ kuerzel: kz("B"), name: `Ben Zeit ${lauf}` }).select("id, name").single();
  merken("mitarbeiter", ben.id);
  const buchungenMerken = async () => (await dbAbfrage("select id from public.zeitbuchung where mitarbeiter_id = any($1)", [[anna.id, ben.id]])).forEach((x) => merken("zeitbuchung", x.id));

  b = await browser();
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // 1. Montage ohne Auftrag wird abgelehnt, Eingaben bleiben; mit Auftrag gespeichert (8,5 h)
  await b.gehe(`/zeiten?ab=${WOCHE}`);
  pruefe("Navigation zeigt Zeiterfassung", await b.js("[...document.querySelectorAll('aside a[href]')].some((a) => a.getAttribute('href') === '/zeiten')"));
  pruefe("Woche KW 46", await b.warte(`document.querySelector('[data-zeitraum]')?.textContent.includes("KW 46")`));
  await b.klickText("main button", "Zeit eintragen");
  await waehle(0, anna.name);
  await setzeWert("[role=dialog] [name=datum]", WOCHE);
  await b.tippe("[role=dialog] [name=taetigkeit]", "Fenster eingesetzt");
  pruefe("Dialog rechnet 8,5 h (7–16 Uhr, 30 min Pause)", await b.warte(`document.querySelector('[role=dialog]')?.innerText.includes("8,5 h")`));
  await b.klickText("[role=dialog] button", "Eintragen");
  pruefe("Montage ohne Auftrag abgelehnt", await b.warte(`document.querySelector("[role=dialog] [role=alert]")?.innerText.includes("Auftrag oder ein Ticket wählen")`));
  pruefe("Eingaben bleiben nach dem Fehler erhalten", (await b.js(`${sichtbar("[role=dialog] [name=taetigkeit]")}.value`)) === "Fenster eingesetzt" && (await b.js(`${sichtbar("[role=dialog] [name=datum]")}.value`)) === WOCHE);
  await b.tippe("[role=dialog] input[aria-label='Auftrag suchen']", `Zeitkunde ${lauf}`);
  await b.klickText("#auftrag-treffer button span", auftrag.nummer);
  await b.klickText("[role=dialog] button", "Eintragen");
  await b.warte("!document.querySelector('[role=dialog]')");
  await buchungenMerken();
  const [z1] = await dbAbfrage("select id, datum::text d, beginn::text b, ende::text e, pause_min p, art, auftrag_id, taetigkeit from public.zeitbuchung where mitarbeiter_id = $1", [anna.id]);
  pruefe("Montage gespeichert: 09.11., 07–16 Uhr, 30 min, Auftrag", z1?.d === WOCHE && z1?.b === "07:00:00" && z1?.e === "16:00:00" && z1?.p === 30 && z1?.art === "montage" && z1?.auftrag_id === auftrag.id && z1?.taetigkeit === "Fenster eingesetzt");

  // 2. Fahrt ohne Bezug für Ben (1 h)
  await b.klickText("main button", "Zeit eintragen");
  await waehle(0, ben.name);
  await waehle(1, "Fahrt");
  await setzeWert("[role=dialog] [name=datum]", "2026-11-10");
  await setzeWert("[role=dialog] [name=beginn]", "07:00");
  await setzeWert("[role=dialog] [name=ende]", "08:00");
  await setzeWert("[role=dialog] [name=pause_min]", "0");
  await b.klickText("[role=dialog] button", "Eintragen");
  await b.warte("!document.querySelector('[role=dialog]')");
  await buchungenMerken();
  pruefe("Fahrt ohne Auftrag gespeichert", await warteDb("select art, auftrag_id from public.zeitbuchung where mitarbeiter_id = $1", [ben.id], (r) => r[0]?.art === "fahrt" && r[0]?.auftrag_id === null));
  // Nur die eigenen Buchungen prüfen: auf Staging können weitere Buchungen dieser Woche liegen
  const eigene = (await dbAbfrage("select id from public.zeitbuchung where mitarbeiter_id = any($1)", [[anna.id, ben.id]])).map((x) => x.id);
  const zeilenDa = eigene.map((id) => `!!document.querySelector("tr[data-buchung='${id}']")`).join(" && ");
  pruefe("Liste: beide Buchungen, Summe je Mitarbeiter (8,5 h und 1 h)", await b.warte(`${zeilenDa} && (() => { const f = document.querySelector('main tfoot')?.innerText ?? ""; return f.includes("Anna Zeit ${lauf} 8,5 h") && f.includes("Ben Zeit ${lauf} 1 h"); })()`));

  // 3. Bearbeiten: Ende 15 Uhr → 7,5 h
  await b.klick(`tr[data-buchung='${z1.id}'] td`);
  await b.da("[role=dialog]");
  await setzeWert("[role=dialog] [name=ende]", "15:00");
  await b.klickText("[role=dialog] button", "Speichern");
  await b.warte("!document.querySelector('[role=dialog]')");
  pruefe("Ende geändert", await warteDb("select ende::text e from public.zeitbuchung where id = $1", [z1.id], (r) => r[0]?.e === "15:00:00"));
  if (fotos) await b.foto(path.join(fotos, "zeiten-buchungen.png"));

  // 4. Freigabe einzeln, gesammelt und zurücknehmen
  await b.js(`${sichtbar(`tr[data-buchung='${z1.id}'] button`)}.click()`);
  pruefe("einzeln freigegeben, mit Benutzer", await warteDb("select freigabe, freigegeben_von from public.zeitbuchung where id = $1", [z1.id], (r) => r[0]?.freigabe === "freigegeben" && r[0]?.freigegeben_von === admin.id));
  await b.klickText("main button", "Offene Buchung freigeben");
  pruefe("gesammelt freigegeben", await warteDb("select count(*)::int n from public.zeitbuchung where mitarbeiter_id = any($1) and freigabe = 'offen'", [[anna.id, ben.id]], (r) => r[0]?.n === 0));
  await b.warte(`!!${sichtbar(`tr[data-buchung] button[aria-label='Freigabe zurücknehmen']`)}`);
  const [fahrt] = await dbAbfrage("select id from public.zeitbuchung where mitarbeiter_id = $1", [ben.id]);
  await b.klick(`tr[data-buchung='${fahrt.id}'] button[aria-label='Freigabe zurücknehmen']`);
  pruefe("Freigabe zurückgenommen", await warteDb("select freigabe from public.zeitbuchung where id = $1", [fahrt.id], (r) => r[0]?.freigabe === "offen"));
  await b.klick(`tr[data-buchung='${z1.id}'] td`);
  await sleep(500);
  pruefe("freigegebene Buchung öffnet keinen Dialog", !(await b.js("!!document.querySelector('[role=dialog]')")));

  // 5. Summen je Mitarbeiter und je Auftrag; Monat
  await b.gehe(`/zeiten?ab=${WOCHE}&ansicht=mitarbeiter`);
  pruefe("Je Mitarbeiter: Anna 7,5 h (freigegeben), Ben 1 h Fahrt", await b.warte(`(() => { const t = document.querySelector('main table')?.innerText ?? ""; return /Anna Zeit ${lauf}\\s+7,5 h\\s+7,5 h\\s+Montage 7,5 h/.test(t) && /Ben Zeit ${lauf}\\s+1 h\\s+0 h\\s+Fahrt 1 h/.test(t); })()`));
  await b.gehe(`/zeiten?ab=${WOCHE}&ansicht=auftraege`);
  pruefe("Je Auftrag: Auftrag 7,5 h, ohne Bezug 1 h", await b.warte(`document.querySelector("[data-auftrag-summe='${auftrag.id}']")?.innerText.includes("7,5 h") && document.querySelector("[data-auftrag-summe='ohne']")?.innerText.includes("1 h")`));
  if (fotos) await b.foto(path.join(fotos, "zeiten-je-auftrag.png"));
  await b.gehe(`/zeiten?ab=${WOCHE}&ansicht=auftraege&zeitraum=monat`);
  pruefe("Monat November 2026", await b.warte(`document.querySelector('[data-zeitraum]')?.textContent === "November 2026" && document.querySelector("[data-auftrag-summe='${auftrag.id}']")?.innerText.includes("7,5 h")`));
  await b.gehe(`/zeiten?ab=${WOCHE}&mitarbeiter=${ben.id}`);
  pruefe("Filter Mitarbeiter: nur Bens Buchung", await b.warte(`(() => { const t = document.querySelector('main').innerText; return t.includes("1 Buchung ·") && !(document.querySelector("main table")?.innerText ?? "x Anna").includes("Anna Zeit ${lauf}") && !!document.querySelector("main table"); })()`));
  await b.gehe("/zeiten?ab=2026-11-16");
  pruefe("andere Woche ohne Buchungen", await b.warte(`document.querySelector('main').innerText.includes("Keine Zeiten für diese Auswahl")`));

  // 6. Auftrags- und Mitarbeiterseite
  await b.gehe(`/auftraege/${auftrag.id}`);
  pruefe("Auftrag zeigt 7,5 h mit Anna", await b.warte(`document.querySelector('[data-stunden-auftrag]')?.textContent === "7,5 h" && document.querySelector('main').innerText.includes("Anna Zeit ${lauf}")`));
  await b.klickText("main button", "Zeit eintragen");
  pruefe("Zeit eintragen am Auftrag: Auftrag vorbelegt", await b.warte(`document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(auftrag.nummer)})`));
  await b.klickText("[role=dialog] button", "Abbrechen");
  await b.warte("!document.querySelector('[role=dialog]')");
  await b.gehe(`/mitarbeiter/${anna.id}`);
  pruefe("Mitarbeiterseite zeigt die Woche (7,5 h)", (await b.warte(`document.querySelector('[data-stunden-woche]')?.textContent === "7,5 h"`)) || (await main()).includes("Keine Zeiten"));

  // 7. Offene Buchung löschen (nur Markierung, mit Bestätigung)
  await b.gehe(`/zeiten?ab=${WOCHE}`);
  await b.klick(`tr[data-buchung='${fahrt.id}'] td`);
  await b.da("[role=dialog]");
  await b.klickText("[role=dialog] button", "Löschen");
  pruefe("Löschen fragt nach", await b.enthaelt("Buchung löschen?"));
  await imLetztenDialog("Löschen");
  pruefe("nur als gelöscht markiert", await warteDb("select deleted_at from public.zeitbuchung where id = $1", [fahrt.id], (r) => !!r[0]?.deleted_at));
  pruefe("nicht mehr in der Liste", await b.warte(`!document.querySelector("tr[data-buchung='${fahrt.id}']")`));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
