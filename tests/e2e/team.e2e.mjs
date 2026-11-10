// End-to-End-Test Team und Ressourcen: Fahrzeuge (Liste, Prüftermine, Werkstatt, Löschen), Fahrzeug im Termin-Dialog der
// Plantafel, Kalender (Monat, Woche, Tag, Liste, Filter, Feiertage, eigene Termine).
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:team (optional FOTOS=<Ordner>).
// Plant in der Woche ab 14.12.2026 (Winterzeit: Berlin = UTC+1).
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
const SLOT = 26;
let b;
const sichtbar = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length > 0)`;
const setzeWert = (sel, wert) =>
  b.js(`(() => { const el = ${sichtbar(sel)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(wert)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const tagPlus = (n) => new Date(Date.parse(`${heute}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
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
const maus = (type, x, y, buttons = 0) => b.cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: type === "mouseMoved" ? 0 : 1 });

try {
  const admin = await testAdmin();
  const { data: kunde } = await service.from("kunde").insert({ name: `Teamkunde ${lauf}` }).select("id, name").single();
  merken("kunde", kunde.id);
  const { data: auftrag } = await service.from("auftrag").insert({ nummer: `T${lauf}`, kunde_id: kunde.id, titel: "Fenster" }).select("id, nummer").single();
  merken("auftrag", auftrag.id);
  const { data: anfrage } = await service.from("anfrage").insert({ titel: `Aufmaß ${lauf}`, kunde_id: kunde.id, aufmass_termin: "2026-12-16T09:00:00Z" }).select("id").single();
  merken("anfrage", anfrage.id);
  const kz = (p) => p + lauf.replace(/[^a-f]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
  const { data: monteur } = await service.from("mitarbeiter").insert({ kuerzel: kz("K"), name: `Karl Team ${lauf}`, ist_monteur: true }).select("id, name").single();
  merken("mitarbeiter", monteur.id);
  const { data: abw } = await service.from("abwesenheit").insert({ mitarbeiter_id: monteur.id, art: "schulung", von: "2026-12-17", bis: "2026-12-17", status: "genehmigt" }).select("id").single();
  merken("abwesenheit", abw.id);

  b = await browser();
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // ---------- Fahrzeuge ----------
  await b.gehe("/fahrzeuge");
  pruefe("Navigation zeigt Fahrzeuge und Kalender", await b.js("['/fahrzeuge', '/kalender'].every((h) => [...document.querySelectorAll('aside a[href]')].some((a) => a.getAttribute('href') === h))"));
  await b.klickText("main button", "Fahrzeug");
  await b.tippe("[role=dialog] [name=kennzeichen]", `gf-t ${lauf}`);
  await b.tippe("[role=dialog] [name=typ]", "Transporter");
  await setzeWert("[role=dialog] [name=tuev_am]", tagPlus(-3));
  await setzeWert("[role=dialog] [name=service_am]", tagPlus(10));
  await b.tippe("[role=dialog] [name=km_stand]", "84200");
  await b.klickText("[role=dialog] button", "Speichern");
  await b.warte("/^\\/fahrzeuge\\/[0-9a-f-]{36}$/.test(location.pathname)");
  const fzId = await b.js("location.pathname.split('/').pop()");
  merken("fahrzeug", fzId);
  const [fz] = await dbAbfrage("select kennzeichen, km_stand from public.fahrzeug where id = $1", [fzId]);
  pruefe("Fahrzeug angelegt (Kennzeichen groß)", fz?.kennzeichen === `GF-T ${lauf.toUpperCase()}` && fz?.km_stand === 84200);
  pruefe("Detail: Prüftermine mit Ampel", await b.warte(`document.querySelector('main').innerText.includes("überfällig") && document.querySelector('main').innerText.includes("in 10 Tagen")`));
  await b.klickText("main button", "Werkstatttermin");
  await setzeWert("[role=dialog] [name=von]", "2026-12-15");
  await setzeWert("[role=dialog] [name=bis]", "2026-12-15");
  await b.tippe("[role=dialog] [name=notiz]", "Inspektion");
  await b.klickText("[role=dialog] button", "Eintragen");
  await b.warte("!document.querySelector('[role=dialog]')");
  (await dbAbfrage("select id from public.fahrzeug_werkstatt where fahrzeug_id = $1", [fzId])).forEach((x) => merken("fahrzeug_werkstatt", x.id));
  pruefe("Werkstatttermin eingetragen", await b.warte(`!!document.querySelector('[data-werkstatt]') && document.querySelector('main').innerText.includes("Inspektion")`));
  await b.gehe("/fahrzeuge");
  pruefe("Liste: TÜV rot, Service gelb, Hinweis oben", await b.warte(`(() => { const z = [...document.querySelectorAll('main tr')].find((r) => r.innerText.includes("GF-T ${lauf.toUpperCase()}")); return z && z.querySelector("[data-pruefung=tuev_am] span")?.className.includes("tone-red") && z.querySelector("[data-pruefung=service_am] span")?.className.includes("tone-amber") && document.querySelector('main [role=alert]')?.innerText.includes("überfällig"); })()`));
  pruefe("Seitenleiste zählt fällige Fahrzeuge (rot)", await b.js(`Number(document.querySelector("aside [data-zaehler='fahrzeuge']")?.textContent) >= 1 && document.querySelector("aside [data-zaehler='fahrzeuge']").className.includes("bg-tone-red-fg")`));
  if (fotos) await b.foto(path.join(fotos, "fahrzeuge.png"));

  // ---------- Plantafel: Fahrzeug im Termin-Dialog, Werkstatt-Konflikt ----------
  await b.gehe("/montageplan?woche=2026-12-14");
  await b.da(`[data-zeile='${monteur.id}']`);
  // Klick auf Dienstag 8 Uhr; wiederholen, falls React die Seite noch nicht übernommen hat
  for (let i = 0; i < 5 && !(await b.js("!!document.querySelector('[role=dialog]')")); i++) {
    const zeile = await b.js(`(() => { const r = ${sichtbar(`[data-zeile='${monteur.id}']`)}.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
    const x = zeile.x + (9 + 1.5) * SLOT;
    await maus("mouseMoved", x, zeile.y + 20);
    await maus("mousePressed", x, zeile.y + 20, 1);
    await maus("mouseReleased", x, zeile.y + 20);
    await sleep(700);
  }
  await b.da("[role=dialog]");
  await b.tippe("[role=dialog] input[aria-label='Auftrag suchen']", `Teamkunde ${lauf}`);
  await b.klickText("#auftrag-treffer button span", auftrag.nummer);
  await b.klick("[role=dialog] button[aria-label='Fahrzeug']");
  await b.klickText("[role=option]", `GF-T ${lauf.toUpperCase()} · Transporter`);
  pruefe("Dialog warnt vor überfälligem TÜV", await b.warte(`document.querySelector('[role=dialog] [data-pruefung]')?.innerText.includes("TÜV/HU")`));
  await b.klickText("[role=dialog] button", "Einplanen");
  pruefe("Warnung nennt den Werkstatttermin", await b.warte(`[...document.querySelectorAll('[role=alert]')].some((x) => x.innerText.includes("in der Werkstatt (Inspektion)"))`));
  const [e1] = await dbAbfrage("select id, fahrzeug_id from public.einsatz where auftrag_id = $1", [auftrag.id]);
  if (e1) merken("einsatz", e1.id);
  pruefe("Einsatz mit Fahrzeug gespeichert", e1?.fahrzeug_id === fzId);
  pruefe("Balken als Konflikt markiert", await b.warte(`document.querySelector("[data-einsatz='${e1?.id}']")?.dataset.konflikt === "1"`));

  // ---------- Fahrzeug löschen ----------
  await b.gehe(`/fahrzeuge/${fzId}`);
  await b.klickText("main button", "Löschen");
  await imLetztenDialog("Löschen");
  pruefe("mit künftigem Einsatz: Löschen abgelehnt", await b.warte(`document.body.innerText.includes("künftige Einsätze eingeplant")`));

  // ---------- Kalender ----------
  await b.gehe("/kalender?datum=2026-12-15");
  pruefe("Monat Dezember 2026", await b.warte(`document.querySelector('main h1')?.parentElement?.innerText.includes("Dezember 2026")`));
  pruefe("Montage, Aufmaß und Abwesenheit an ihren Tagen", await b.warte(`!!document.querySelector("[data-tag='2026-12-15'] [data-eintrag='e-${e1?.id}']") && !!document.querySelector("[data-tag='2026-12-16'] [data-eintrag='a-${anfrage.id}']") && !!document.querySelector("[data-tag='2026-12-17'] [data-eintrag='w-${abw.id}']")`));
  pruefe("Feiertag 25.12. rot markiert", await b.js(`document.querySelector("[data-tag='2026-12-25'] [data-feiertag]")?.textContent === "1. Weihnachtstag"`));
  pruefe("Mini-Kalender markiert Tage mit Einträgen", await b.js(`document.querySelector("[data-mini='2026-12-15']")?.dataset.hat === "1"`));
  if (fotos) await b.foto(path.join(fotos, "kalender-monat.png"));
  await b.klick("[data-filter-art='montage']");
  pruefe("Filter Montage aus blendet den Einsatz aus", await b.warte(`location.search.includes("aus=montage") && !document.querySelector("[data-eintrag='e-${e1?.id}']")`));
  await b.klick("[data-filter-art='montage']");
  await b.warte(`!location.search.includes("aus=")`);
  await b.gehe(`/kalender?datum=2026-12-15&ma=${monteur.id}`);
  pruefe("Filter Mitarbeiter: Einsatz und Abwesenheit, nicht das Aufmaß", await b.warte(`!!document.querySelector("[data-eintrag='e-${e1?.id}']") && !!document.querySelector("[data-eintrag='w-${abw.id}']") && !document.querySelector("[data-eintrag='a-${anfrage.id}']")`));
  await b.gehe("/kalender?datum=2026-12-15&ansicht=woche");
  pruefe("Woche: Einsatz im Stundenraster", await b.warte(`!!document.querySelector("[data-kalender='woche'] [data-tag='2026-12-15'] [data-eintrag='e-${e1?.id}']")`));
  await b.gehe("/kalender?datum=2026-12-16&ansicht=tag");
  pruefe("Tag: Aufmaß-Termin", await b.warte(`!!document.querySelector("[data-kalender='tag'] [data-eintrag='a-${anfrage.id}']")`));
  await b.gehe("/kalender?datum=2026-12-15&ansicht=liste");
  pruefe("Liste: Tage mit Einträgen und Feiertag", await b.warte(`!!document.querySelector("[data-kalender='liste'] [data-tag='2026-12-15']") && !!document.querySelector("[data-kalender='liste'] [data-tag='2026-12-25']")`));

  // Eigener Termin: anlegen, bearbeiten, löschen
  await b.gehe("/kalender?datum=2026-12-18");
  await b.klickText("main button", "Termin");
  await b.tippe("[role=dialog] [name=titel]", `Beratung ${lauf}`);
  await setzeWert("[role=dialog] [name=datum]", "2026-12-18");
  await b.klick(`[role=dialog] input[name=mitarbeiter][value='${monteur.id}']`);
  await b.tippe("[role=dialog] input[aria-label='Bezug suchen']", `Teamkunde ${lauf}`);
  await b.klickText("#termin-bezug-treffer button span", kunde.name);
  await b.klickText("[role=dialog] button", "Termin anlegen");
  await b.warte("!document.querySelector('[role=dialog]')");
  const [termin] = await dbAbfrage("select id, kunde_id, beginn::text b from public.termin where titel = $1", [`Beratung ${lauf}`]);
  if (termin) {
    merken("termin", termin.id);
    (await dbAbfrage("select id from public.termin_mitarbeiter where termin_id = $1", [termin.id])).forEach((x) => merken("termin_mitarbeiter", x.id));
  }
  pruefe("Termin gespeichert (Kunde, 10:00)", termin?.kunde_id === kunde.id && termin?.b === "10:00:00");
  pruefe("Termin im Kalender", await b.warte(`!!document.querySelector("[data-tag='2026-12-18'] [data-eintrag='t-${termin?.id}']")`));
  await b.klick(`[data-eintrag='t-${termin?.id}']`);
  await b.tippe("[role=dialog] [name=titel]", `Beratung Haustür ${lauf}`);
  await b.klickText("[role=dialog] button", "Speichern");
  pruefe("Termin bearbeitet", await warteDb("select titel from public.termin where id = $1", [termin?.id], (r) => r[0]?.titel === `Beratung Haustür ${lauf}`));
  await b.warte("!document.querySelector('[role=dialog]')");
  await b.klick(`[data-eintrag='t-${termin?.id}']`);
  await b.klickText("[role=dialog] button", "Löschen");
  pruefe("Löschen fragt nach", await b.enthaelt("Termin löschen?"));
  await imLetztenDialog("Löschen");
  pruefe("Termin nur als gelöscht markiert", await warteDb("select deleted_at from public.termin where id = $1", [termin?.id], (r) => !!r[0]?.deleted_at));
  if (fotos) await b.foto(path.join(fotos, "kalender.png"));

  // Klick auf den Einsatz öffnet den Auftrag
  await b.gehe("/kalender?datum=2026-12-15");
  await b.klick(`[data-eintrag='e-${e1?.id}']`);
  pruefe("Klick öffnet den Auftrag", await b.warte(`location.pathname === '/auftraege/${auftrag.id}'`));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  const em = await dbAbfrage("select m.id from public.einsatz_monteur m join public.einsatz e on e.id = m.einsatz_id join public.auftrag a on a.id = e.auftrag_id where a.nummer = $1", [`T${lauf}`]).catch(() => []);
  em.forEach((x) => merken("einsatz_monteur", x.id));
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
