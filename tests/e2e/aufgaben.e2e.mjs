// End-to-End-Test Modul Aufgaben mit einem vorübergehenden Test-Admin und einem zweiten Benutzer.
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:aufgaben
// Optional FOTOS=<Ordner> für Bildschirmfotos.
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin, weitererBenutzer } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;
const sichtbar = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length > 0)`;
const setzeWert = (sel, wert) => b.js(`(() => { const el = ${sichtbar(sel)}; el.value = ${JSON.stringify(wert)}; el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
const tagVerschoben = (tage) => new Date(Date.now() + tage * 864e5).toISOString().slice(0, 10);
/** Wählt im n-ten Auswahlfeld des Dialogs (Radix-Select) den Eintrag mit diesem Text */
async function waehle(n, eintrag) {
  await b.js(`document.querySelectorAll('[role=dialog] button[role=combobox]')[${n}].setAttribute('data-e2e-select', '1')`);
  await b.klick("[data-e2e-select='1']");
  await b.js("document.querySelector(\"[data-e2e-select='1']\").removeAttribute('data-e2e-select')");
  await b.klickText("[role=option]", eintrag);
}
async function aufgabeAnlegen({ titel, faellig, zustaendig, bezugSuche, bezugText }) {
  await b.klickText("button", "Neue Aufgabe");
  await b.tippe("[role=dialog] [name=titel]", titel);
  if (zustaendig) await waehle(0, zustaendig);
  if (faellig) await setzeWert("[role=dialog] [name=faellig]", faellig);
  if (bezugSuche) {
    await b.tippe("[role=dialog] input[aria-label='Bezug suchen']", bezugSuche);
    await b.klickText("#bezug-treffer button span", bezugText);
  }
  await b.klickText("[role=dialog] button", "Aufgabe anlegen");
  await b.warte("!document.querySelector('[role=dialog]')");
  const [a] = await dbAbfrage("select id from public.aufgabe where titel = $1", [titel]);
  if (a) merken("aufgabe", a.id);
  return a?.id;
}

try {
  const admin = await testAdmin();
  const kollegin = await weitererBenutzer("Kollegin");
  const { data: kunde } = await service.from("kunde").insert({ name: `Aufgabentest ${lauf}` }).select("id, name").single();
  merken("kunde", kunde.id);
  const { data: anfrage } = await service.from("anfrage").insert({ titel: `Anfrage für Aufgaben ${lauf}`, kunde_id: kunde.id }).select("id, titel").single();
  merken("anfrage", anfrage.id);
  b = await browser();
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // 1. Meine Aufgaben: überfällig, mit Bezug zum Kunden
  await b.gehe("/aufgaben");
  pruefe("Navigation zeigt Aufgaben", await b.js("[...document.querySelectorAll('aside a[href]')].some((a) => a.getAttribute('href') === '/aufgaben')"));
  const a1 = await aufgabeAnlegen({ titel: `Rückruf ${lauf}`, faellig: tagVerschoben(-2), bezugSuche: `Aufgabentest ${lauf}`, bezugText: kunde.name });
  pruefe("Aufgabe angelegt", !!a1);
  const [r1] = await dbAbfrage("select zustaendig_id, kunde_id, faellig from public.aufgabe where id = $1", [a1]);
  pruefe("Zuständig = ich, Bezug = Kunde", r1?.zustaendig_id === admin.id && r1?.kunde_id === kunde.id);
  pruefe("erscheint unter „Überfällig“", await b.warte(`document.querySelector('section[aria-label="Überfällig"]')?.innerText.includes("Rückruf ${lauf}")`));
  pruefe("Bezug als Link zum Kunden", await b.js(`!!${sichtbar(`a[href='/kunden/${kunde.id}']`)}`));

  // 2. Aufgabe für die Kollegin: nicht unter „Meine“, aber unter „Alle“
  await aufgabeAnlegen({ titel: `Bestellung prüfen ${lauf}`, faellig: tagVerschoben(3), zustaendig: kollegin.name });
  await b.gehe("/aufgaben");
  pruefe("„Meine“ zeigt die Aufgabe der Kollegin nicht", !(await b.text()).includes(`Bestellung prüfen ${lauf}`));
  await b.gehe("/aufgaben?wer=alle");
  pruefe("„Alle“ zeigt sie unter „Demnächst“ mit Zuständiger", await b.warte(`document.querySelector('section[aria-label="Demnächst"]')?.innerText.includes("Bestellung prüfen ${lauf}") && document.body.innerText.includes(${JSON.stringify(kollegin.name)})`));
  if (fotos) await b.foto(path.join(fotos, "aufgaben-alle.png"));

  // 3. Abhaken und wieder öffnen
  await b.gehe("/aufgaben");
  await b.klick(`[data-aufgabe='${a1}'] input[type=checkbox]`);
  let erledigt = false;
  for (let i = 0; i < 20 && !erledigt; i++) { await sleep(250); erledigt = (await dbAbfrage("select status, erledigt_am from public.aufgabe where id = $1", [a1]))[0]?.erledigt_am != null; }
  pruefe("Abhaken speichert „erledigt“ mit Zeitpunkt", erledigt);
  await b.gehe("/aufgaben");
  pruefe("erledigte Aufgabe nicht mehr unter „Offen“", !(await b.text()).includes(`Rückruf ${lauf}`));
  await b.gehe("/aufgaben?zustand=erledigt");
  pruefe("unter „Erledigt“ durchgestrichen", await b.warte(`[...document.querySelectorAll("button")].some((x) => x.textContent === "Rückruf ${lauf}" && x.className.includes("line-through"))`));
  await b.klick(`[data-aufgabe='${a1}'] input[type=checkbox]`);
  let offen = false;
  for (let i = 0; i < 20 && !offen; i++) { await sleep(250); offen = (await dbAbfrage("select status from public.aufgabe where id = $1", [a1]))[0]?.status === "offen"; }
  pruefe("Haken entfernen öffnet die Aufgabe wieder", offen);

  // 4. Aufgabe auf der Anfrageseite mit vorbelegtem Bezug; sichtbar auf der Anfrage- und unter „Meine“
  await b.gehe(`/anfragen/${anfrage.id}`);
  await b.klickText("main button", "Aufgabe");
  pruefe("Bezug Anfrage vorbelegt", await b.warte(`document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(anfrage.titel)})`));
  await b.tippe("[role=dialog] [name=titel]", `Aufmaß vereinbaren ${lauf}`);
  await b.klickText("[role=dialog] button", "Aufgabe anlegen");
  await b.warte("!document.querySelector('[role=dialog]')");
  const [a3] = await dbAbfrage("select id, anfrage_id from public.aufgabe where titel = $1", [`Aufmaß vereinbaren ${lauf}`]);
  if (a3) merken("aufgabe", a3.id);
  pruefe("Aufgabe hängt an der Anfrage", a3?.anfrage_id === anfrage.id);
  pruefe("Anfrageseite zeigt die Aufgabe", await b.enthaelt(`Aufmaß vereinbaren ${lauf}`));
  if (fotos) await b.foto(path.join(fotos, "anfrage-mit-aufgabe.png"));
  await b.gehe(`/kunden/${kunde.id}`);
  pruefe("Kundenseite zeigt die Kunden-Aufgabe", await b.enthaelt(`Rückruf ${lauf}`));

  // 5. Bearbeiten und löschen mit Bestätigung
  await b.gehe("/aufgaben");
  await b.klickText("button", `Rückruf ${lauf}`);
  await b.tippe("[role=dialog] [name=titel]", `Rückruf erledigen ${lauf}`);
  await waehle(1, "Hoch");
  await b.klickText("[role=dialog] button", "Speichern");
  pruefe("Bearbeiten speichert, Priorität „Hoch“ sichtbar", (await b.enthaelt(`Rückruf erledigen ${lauf}`)) && (await b.js(`document.querySelector("[data-aufgabe='${a1}']")?.innerText.includes("Hoch")`)));
  await b.klickText("button", `Rückruf erledigen ${lauf}`);
  await b.klickText("[role=dialog] button", "Löschen");
  pruefe("Löschen fragt nach", await b.enthaelt("Aufgabe löschen?"));
  await b.js(`(() => { const dialoge = [...document.querySelectorAll('[role=dialog]')]; const knopf = [...dialoge.at(-1).querySelectorAll('button')].find((x) => x.textContent.trim() === 'Löschen'); knopf.setAttribute('data-x', 'weg'); })()`);
  await b.klick("[data-x='weg']");
  let geloescht = false;
  for (let i = 0; i < 20 && !geloescht; i++) { await sleep(250); geloescht = !!(await dbAbfrage("select deleted_at from public.aufgabe where id = $1", [a1]))[0]?.deleted_at; }
  pruefe("nur als gelöscht markiert", geloescht);
  await b.gehe("/aufgaben");
  pruefe("gelöschte Aufgabe nicht mehr in der Liste", !(await b.text()).includes(`Rückruf erledigen ${lauf}`));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
