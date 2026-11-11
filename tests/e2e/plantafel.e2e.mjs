// End-to-End-Test Plantafel: Kolonnen, weitere Ressourcen, Auftrags-Pipeline, Duplizieren (Alt und Modus), Farbe,
// Sammelfreigabe, Termin zurück in die Pipeline, Zeilen und Gruppen am Griff verschieben, 4-Wochen-Ansicht, Wochenplan-PDF.
// Echte Mausbewegungen (CDP) für Balken, HTML5-Ziehen für Pipeline-Einträge und Zeilen.
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:plantafel
// Optional FOTOS=<Ordner> für Bildschirmfotos und das PDF. Plant in der Woche ab 11.01.2027 (KW 2, ohne Feiertag).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
const WOCHE = "2027-01-11";
const SLOT = 26;
const SLOT_TAG = 44;
let b;
const sichtbar = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length > 0)`;
const rechteck = async (sel, scrollen = true) => {
  if (scrollen) {
    await b.js(`${sichtbar(sel)}?.scrollIntoView({ block: "center", inline: "nearest" })`);
    await sleep(80);
  }
  return b.js(`(() => { const r = ${sichtbar(sel)}?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
};
const maus = (type, x, y, buttons = 0, modifiers = 0) => b.cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, modifiers, clickCount: type === "mouseMoved" ? 0 : 1 });
async function ziehe(x1, y1, x2, y2, modifiers = 0) {
  await maus("mouseMoved", x1, y1, 0, modifiers);
  await sleep(50);
  await maus("mousePressed", x1, y1, 1, modifiers);
  for (let i = 1; i <= 10; i++) {
    await maus("mouseMoved", x1 + ((x2 - x1) * i) / 10, y1 + ((y2 - y1) * i) / 10, 1, modifiers);
    await sleep(30);
  }
  await maus("mouseReleased", x2, y2, 0, modifiers);
  await sleep(250);
}
/** HTML5-Ziehen (Pipeline-Einträge, Zeilen am Griff) mit Zielkoordinate */
const html5 = (quelle, ziel, dx = null, alt = false) =>
  b.js(`(() => { const q = ${sichtbar(quelle)}; const z = ${sichtbar(ziel)}; if (!q || !z) return false; z.scrollIntoView({ block: "center" }); const r = z.getBoundingClientRect(); const x = ${dx === null ? "r.x + r.width / 2" : `r.x + ${dx}`}; const y = r.y + Math.min(12, r.height / 2); const dt = new DataTransfer();
    q.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
    z.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
    z.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y, altKey: ${alt} }));
    q.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt })); return true; })()`);
async function warteDb(sql, werte, pruef) {
  for (let i = 0; i < 40; i++) {
    const z = await dbAbfrage(sql, werte);
    if (pruef(z)) return true;
    await sleep(250);
  }
  return false;
}
const zeit = (id) => dbAbfrage("select to_char(beginn at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') b, to_char(ende at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') e, fest, farbe, ressource_id, fahrzeug_id from public.einsatz where id = $1", [id]);
const team = async (id) => (await dbAbfrage("select mitarbeiter_id from public.einsatz_monteur where einsatz_id = $1 and deleted_at is null", [id])).map((x) => x.mitarbeiter_id).sort();
const einsaetzeVon = (auftrag) => dbAbfrage("select id from public.einsatz where auftrag_id = $1 and deleted_at is null order by created_at", [auftrag]);

let auftragA, auftragB, kolonneId, ressourceId, gruppenVorher;
try {
  const admin = await testAdmin();
  [{ plantafel_gruppen: gruppenVorher }] = await dbAbfrage("select plantafel_gruppen from public.einstellung");
  await dbAbfrage("update public.einstellung set arbeitszeit_von = '07:00', arbeitszeit_bis = '16:00'");
  const { data: kunde } = await service.from("kunde").insert({ name: `Tafelkunde ${lauf}`, strasse: "Lindenweg 4", plz: "38518", ort: "Gifhorn", telefon: "05371 12345" }).select("id").single();
  merken("kunde", kunde.id);
  ({ data: auftragA } = await service.from("auftrag").insert({ nummer: `TA${lauf}`, kunde_id: kunde.id, titel: "Haustür", objekt: "Lindenweg 4, 38518 Gifhorn", phase: "montage", liefertermin: "2027-01-13" }).select("id, nummer").single());
  merken("auftrag", auftragA.id);
  ({ data: auftragB } = await service.from("auftrag").insert({ nummer: `TB${lauf}`, kunde_id: kunde.id, titel: "Fenster", phase: "montage" }).select("id, nummer").single());
  merken("auftrag", auftragB.id);
  const kz = (p) => p + lauf.replace(/[^a-f]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
  const monteur = async (k, n) => {
    const { data } = await service.from("mitarbeiter").insert({ kuerzel: kz(k), name: `${n} ${lauf}`, ist_monteur: true }).select("id, name").single();
    merken("mitarbeiter", data.id);
    return data;
  };
  const carla = await monteur("C", "Carla Kolonne");
  const dirk = await monteur("D", "Dirk Kolonne");
  const emil = await monteur("E", "Emil Einzeln");
  const { data: fz } = await service.from("fahrzeug").insert({ kennzeichen: `GF-T ${lauf.slice(0, 4).toUpperCase()}` }).select("id, kennzeichen").single();
  merken("fahrzeug", fz.id);
  const { data: urlaub } = await service.from("abwesenheit").insert({ mitarbeiter_id: carla.id, art: "urlaub", von: "2027-01-12", bis: "2027-01-12", status: "genehmigt" }).select("id").single();
  merken("abwesenheit", urlaub.id);
  // Auftrag B hat einen festen Einsatz am Freitag (Dirk)
  const { data: b1 } = await service.from("einsatz").insert({ auftrag_id: auftragB.id, beginn: "2027-01-15T06:00:00Z", ende: "2027-01-15T15:00:00Z", fest: true }).select("id").single();
  await service.from("einsatz_monteur").insert({ einsatz_id: b1.id, mitarbeiter_id: dirk.id });

  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // 1. Pipeline: Auftrag A mit Liefertermin steht in „Lieferung“ am Mittwoch
  await b.gehe(`/montageplan?woche=${WOCHE}`);
  pruefe("Pipeline mit drei Stufen", await b.warte("['lieferung','abschlag','warten'].every((s) => !!document.querySelector(`[data-planungszeile='${s}']`))"));
  pruefe("Auftrag A in „Lieferung“ am Liefertermin", await b.warte(`document.querySelector("[data-pipeline-auftrag='${auftragA.id}']")?.dataset.tag === "2027-01-13"`));

  // 2. Kolonne anlegen: Carla und Dirk, Stammfahrzeug
  await b.klickText("main button", "Kolonne hinzufügen");
  await b.da("[data-kolonne-formular]");
  await b.tippe("[data-kolonne-formular] [name=name]", `Kolonne ${lauf}`);
  await b.klick(`[data-kolonne-formular] input[value='${carla.id}']`);
  await b.klick(`[data-kolonne-formular] input[value='${dirk.id}']`);
  await b.klick("[data-kolonne-formular] [aria-label='Stammfahrzeug']");
  await b.klickText("[role=option]", fz.kennzeichen);
  await b.klickText("[data-kolonne-formular] button", "Kolonne anlegen");
  await b.warte("!document.querySelector('[data-kolonne-formular]')");
  const [k] = await dbAbfrage("select id, stammfahrzeug_id from public.kolonne where name = $1 and deleted_at is null", [`Kolonne ${lauf}`]);
  kolonneId = k?.id;
  const mitglieder = kolonneId ? await dbAbfrage("select mitarbeiter_id from public.kolonne_mitglied where kolonne_id = $1 and deleted_at is null order by reihenfolge", [kolonneId]) : [];
  pruefe("Kolonne gespeichert: zwei Mitglieder, Stammfahrzeug", k?.stammfahrzeug_id === fz.id && mitglieder.map((x) => x.mitarbeiter_id).join() === [carla.id, dirk.id].join(), JSON.stringify(mitglieder));
  pruefe("Kolonne als Gruppenzeile, Carla darunter", await b.warte(`!!document.querySelector("[data-kolonne-zeile='${kolonneId}']") && document.querySelector("[data-monteur-zeile='${carla.id}']")?.dataset.gruppe === "kolonne:${kolonneId}"`));

  // 3. In der Pipeline auf Donnerstag ziehen: Datum der Stufe „Lieferung“
  await html5(`[data-pipeline-auftrag='${auftragA.id}']`, "[data-ziel='p:lieferung']", 3 * 9 * SLOT + 12);
  pruefe("Pipeline: Lieferung am Donnerstag (Datum der Stufe)", await warteDb("select stufe_lieferung_datum::text d, liefertermin::text l from public.auftrag where id = $1", [auftragA.id], (r) => r[0]?.d === "2027-01-14" && r[0]?.l === "2027-01-13"));

  // 4. Aus der Pipeline auf die Kolonne ziehen (Di 9 Uhr): alle Mitglieder und das Stammfahrzeug, vorgeplant; Urlaub warnt
  await b.warte(`document.querySelector("[data-pipeline-auftrag='${auftragA.id}']")?.dataset.tag === "2027-01-14"`);
  await html5(`[data-pipeline-auftrag='${auftragA.id}']`, `[data-ziel='k:${kolonneId}']`, (9 + 2) * SLOT + 8);
  pruefe("Einsatz aus der Pipeline: Di 09–16 Uhr, vorgeplant", await warteDb("select count(*)::int n from public.einsatz where auftrag_id = $1 and deleted_at is null", [auftragA.id], (r) => r[0]?.n === 1));
  const [a1] = await einsaetzeVon(auftragA.id);
  let [z] = await zeit(a1.id);
  pruefe("… Team = Kolonne, Fahrzeug = Stammfahrzeug", z.b === "2027-01-12T09:00" && z.e === "2027-01-12T16:00" && z.fest === false && z.fahrzeug_id === fz.id && (await team(a1.id)).join() === [carla.id, dirk.id].sort().join(), JSON.stringify(z));
  pruefe("Warnung nennt Carlas Urlaub", await b.warte(`[...document.querySelectorAll('[role=alert]')].some((x) => x.innerText.includes("Carla Kolonne ${lauf}: Urlaub"))`));
  pruefe("Balken in der Kolonnenzeile und bei Carla als Konflikt, nicht mehr in der Pipeline", await b.warte(`!!document.querySelector("[data-kolonne-zeile='${kolonneId}'] [data-einsatz='${a1.id}']") && document.querySelector("[data-monteur-zeile='${carla.id}'] [data-einsatz='${a1.id}']")?.dataset.konflikt === "1" && !document.querySelector("[data-pipeline-auftrag='${auftragA.id}']")`));

  // 5. Mit gedrückter Alt-Taste auf Emil ziehen: weiterer Einsatz (Kopie), Original bleibt
  let balken = await rechteck(`[data-kolonne-zeile='${kolonneId}'] [data-einsatz='${a1.id}']`);
  let zeile = await rechteck(`[data-zeile='${emil.id}']`, false);
  await ziehe(balken.x + 40, balken.y + balken.h / 2, balken.x + 40, zeile.y + zeile.h / 2, 1);
  pruefe("Alt-Ziehen: zweiter Einsatz zu Auftrag A", await warteDb("select count(*)::int n from public.einsatz where auftrag_id = $1 and deleted_at is null", [auftragA.id], (r) => r[0]?.n === 2));
  const [, a2] = await einsaetzeVon(auftragA.id);
  [z] = await zeit(a2.id);
  pruefe("Kopie: nur Emil, gleiche Zeit, vorgeplant; Original unverändert", z.b === "2027-01-12T09:00" && z.fest === false && (await team(a2.id)).join() === emil.id && (await team(a1.id)).length === 2, JSON.stringify(z));
  pruefe("Kopie als „weiterer Einsatz“ markiert", await b.warte(`document.querySelector("[data-monteur-zeile='${emil.id}'] [data-einsatz='${a2.id}']")?.dataset.weiterer === "1"`));

  // 6. Duplizier-Modus: Emils Balken einen Tag nach rechts → dritter Einsatz am Mittwoch
  await b.klick("[data-dup-modus]");
  pruefe("Duplizier-Modus an", await b.warte("document.querySelector('[data-dup-modus]')?.dataset.dupModus === 'an'"));
  balken = await rechteck(`[data-monteur-zeile='${emil.id}'] [data-einsatz='${a2.id}']`);
  await ziehe(balken.x + 30, balken.y + balken.h / 2, balken.x + 30 + 9 * SLOT, balken.y + balken.h / 2);
  pruefe("Duplizier-Modus: dritter Einsatz", await warteDb("select count(*)::int n from public.einsatz where auftrag_id = $1 and deleted_at is null", [auftragA.id], (r) => r[0]?.n === 3));
  const [, , a3] = await einsaetzeVon(auftragA.id);
  [z] = await zeit(a3.id);
  pruefe("… am Mittwoch 09–16 Uhr mit Emil", z.b === "2027-01-13T09:00" && z.e === "2027-01-13T16:00" && (await team(a3.id)).join() === emil.id, JSON.stringify(z));
  await b.klick("[data-dup-modus]");
  await b.warte("document.querySelector('[data-dup-modus]')?.dataset.dupModus === 'aus'");

  // 7. Farbe: Palette (plan-7) und frei gewählt (Schrift automatisch hell)
  await b.klick(`[data-monteur-zeile='${emil.id}'] [data-einsatz='${a3.id}']`);
  await b.da("[role=dialog] [data-farbwahl]");
  await b.klick("[role=dialog] [data-farbe='plan-7']");
  await b.klickText("[role=dialog] button", "Speichern");
  pruefe("Farbe aus der Palette gespeichert", await warteDb("select farbe from public.einsatz where id = $1", [a3.id], (r) => r[0]?.farbe === "plan-7"));
  await b.warte("!document.querySelector('[role=dialog]')");
  await b.klick(`[data-monteur-zeile='${emil.id}'] [data-einsatz='${a2.id}']`);
  await b.da("[role=dialog] [data-farbwahl]");
  await b.js(`(() => { const i = document.querySelector("[role=dialog] input[type=color]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "#1a237e"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await b.klickText("[role=dialog] button", "Speichern");
  pruefe("Freie Farbe gespeichert (#1A237E)", await warteDb("select farbe from public.einsatz where id = $1", [a2.id], (r) => r[0]?.farbe === "#1A237E"));
  await b.warte("!document.querySelector('[role=dialog]')");
  pruefe("Vorgeplant mit freier Farbe: gestrichelter Rand in der Farbe", await b.warte(`(() => { const s = document.querySelector("[data-monteur-zeile='${emil.id}'] [data-einsatz='${a2.id}']")?.style; return s?.borderColor === "rgb(26, 35, 126)" || s?.borderColor === "#1a237e"; })()`));

  // 8. Weitere Ressource anlegen und einen Einsatz darauf ziehen (Team bleibt)
  await b.klickText("main button", "Zeile hinzufügen");
  await b.da("[data-ressource-formular]");
  await b.tippe("[data-ressource-formular] [name=name]", `Selbstabholer ${lauf}`);
  await b.klickText("[data-ressource-formular] button", "Hinzufügen");
  await b.warte("!document.querySelector('[data-ressource-formular]')");
  [{ id: ressourceId } = {}] = await dbAbfrage("select id from public.ressource where name = $1 and deleted_at is null", [`Selbstabholer ${lauf}`]);
  pruefe("Ressourcenzeile angelegt", !!ressourceId && (await b.da(`[data-ressource-zeile='${ressourceId}']`)));
  balken = await rechteck(`[data-monteur-zeile='${emil.id}'] [data-einsatz='${a3.id}']`);
  zeile = await rechteck(`[data-ziel='r:${ressourceId}']`, false);
  await ziehe(balken.x + 30, balken.y + balken.h / 2, balken.x + 30, zeile.y + zeile.h / 2);
  pruefe("Auf die Ressource gezogen: Ressource gesetzt, Team bleibt", await warteDb("select ressource_id from public.einsatz where id = $1", [a3.id], (r) => r[0]?.ressource_id === ressourceId) && (await team(a3.id)).join() === emil.id);
  pruefe("Balken in der Ressourcenzeile", await b.warte(`!!document.querySelector("[data-ressource-zeile='${ressourceId}'] [data-einsatz='${a3.id}']")`));
  if (fotos) await b.foto(path.join(fotos, "plantafel-woche.png"));

  // 9. Sammelfreigabe: Einsatz mit Konflikt (Carla im Urlaub) ist nicht vorausgewählt
  await b.klick("[data-freigeben]");
  await b.da("[data-freigabe]");
  pruefe("Freigabe-Liste: Konflikt nicht angehakt, die beiden anderen schon", await b.warte(`(() => { const f = document.querySelector("[data-freigabe]"); const c = (id) => f.querySelector("input[value='" + id + "']")?.checked; return c("${a1.id}") === false && c("${a2.id}") === true && c("${a3.id}") === true; })()`));
  await b.klick("[data-freigabe] button[type=submit]");
  pruefe("Freigegeben: zwei fest, Konflikt bleibt vorgeplant", await warteDb("select id, fest from public.einsatz where auftrag_id = $1 and deleted_at is null", [auftragA.id], (r) => r.length === 3 && r.find((x) => x.id === a1.id)?.fest === false && r.filter((x) => x.fest).length === 2));
  pruefe("Freigegeben mit freier Farbe: volle Farbe, Schrift automatisch hell", await b.warte(`(() => { const s = document.querySelector("[data-monteur-zeile='${emil.id}'] [data-einsatz='${a2.id}']")?.style; return /rgb\\(26, 35, 126\\)|#1a237e/i.test(s?.background ?? "") && /rgb\\(255, 255, 255\\)|#ffffff/i.test(s?.color ?? ""); })()`));

  // 10. Einsatz zurück in die Pipeline („Warten auf Kunde“, Montag): Termin entfernt, Stufe gesetzt
  balken = await rechteck(`[data-monteur-zeile='${dirk.id}'] [data-einsatz='${b1.id}']`);
  zeile = await rechteck("[data-ziel='p:warten']", false);
  await ziehe(balken.x + 20, balken.y + balken.h / 2, zeile.x + 30, zeile.y + zeile.h / 2);
  pruefe("Zurück in die Pipeline: Einsatz als gelöscht markiert", await warteDb("select deleted_at from public.einsatz where id = $1", [b1.id], (r) => !!r[0]?.deleted_at));
  pruefe("… Auftrag B „Warten auf Kunde“ am Montag", await warteDb("select warten_auf_kunde w, stufe_warten_datum::text d from public.auftrag where id = $1", [auftragB.id], (r) => r[0]?.w === true && r[0]?.d === WOCHE));
  pruefe("… steht in der Zeile „Warten auf Kunde“", await b.warte(`document.querySelector("[data-pipeline-auftrag='${auftragB.id}']")?.dataset.stufe === "warten"`));

  // 11. Zeilen am Griff: Emil in die Kolonne, Gruppe „Weitere Ressourcen“ vor die Kolonne
  await html5(`[data-griff-zeile='M|${emil.id}|solo']`, `[data-label-ziel='G|kolonne:${kolonneId}']`);
  pruefe("Emil per Griff in die Kolonne verschoben", await warteDb("select count(*)::int n from public.kolonne_mitglied where kolonne_id = $1 and mitarbeiter_id = $2 and deleted_at is null", [kolonneId, emil.id], (r) => r[0]?.n === 1));
  pruefe("… Zeile steht jetzt unter der Kolonne", await b.warte(`document.querySelector("[data-monteur-zeile='${emil.id}']")?.dataset.gruppe === "kolonne:${kolonneId}"`));
  await html5("[data-griff-zeile='G|res']", `[data-label-ziel='G|kolonne:${kolonneId}']`);
  pruefe("Gruppen-Reihenfolge gespeichert (Ressourcen vor der Kolonne)", await warteDb("select plantafel_gruppen g from public.einstellung", [], (r) => (r[0]?.g ?? []).indexOf("res") >= 0 && r[0].g.indexOf("res") < r[0].g.indexOf(`kolonne:${kolonneId}`)));
  pruefe("… und in der Tafel", await b.warte(`(() => { const g = [...document.querySelectorAll("[data-gruppe-block]")].map((x) => x.dataset.gruppeBlock); return g.indexOf("res") < g.indexOf("kolonne:${kolonneId}"); })()`));

  // 12. 4-Wochen-Ansicht: tagesgenau, Verschieben um einen Tag behält die Uhrzeit
  await b.klickText("main a", "4 Wochen");
  pruefe("4 Wochen: 20 Arbeitstage tagesgenau", await b.warte(`location.search.includes("ansicht=4") && document.querySelector("[data-tafel]")?.dataset.ansicht === "4" && document.querySelector("[data-zeile='${emil.id}']")?.getBoundingClientRect().width === ${20 * SLOT_TAG}`));
  pruefe("Kopf: KW 2–5, tagesgenau", await b.enthaelt("KW 2–5"));
  balken = await rechteck(`[data-monteur-zeile='${emil.id}'] [data-einsatz='${a2.id}']`);
  await ziehe(balken.x + 10, balken.y + balken.h / 2, balken.x + 10 + SLOT_TAG, balken.y + balken.h / 2);
  pruefe("4 Wochen: einen Tag später, Uhrzeit bleibt (Mi 09–16)", await warteDb("select to_char(beginn at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') b, to_char(ende at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') e from public.einsatz where id = $1", [a2.id], (r) => r[0]?.b === "2027-01-13T09:00" && r[0]?.e === "2027-01-13T16:00"));
  if (fotos) await b.foto(path.join(fotos, "plantafel-4wochen.png"));
  await b.klick("a[aria-label='Nächste Woche']");
  pruefe("Navigation behält die 4-Wochen-Ansicht", await b.warte(`location.search.includes("woche=2027-01-18") && location.search.includes("ansicht=4")`));

  // 13. Wochenplan: Dialog und PDF je Kolonne und Monteur
  await b.gehe(`/montageplan?woche=${WOCHE}`);
  await b.klickText("main button", "Wochenplan");
  pruefe("Wochenplan-Dialog mit PDF-Link", await b.warte(`document.querySelector("[data-wochenplan-link]")?.getAttribute("href")?.includes("woche=${WOCHE}")`));
  await b.taste("Escape", "Escape", 27);
  const pdfK = await b.js(`fetch('/pdf/wochenplan?woche=${WOCHE}&kolonne=${kolonneId}').then(async (r) => r.status + ' ' + r.headers.get('content-type') + ' ' + (await r.arrayBuffer()).byteLength)`);
  pruefe("Wochenplan-PDF der Kolonne", /^200 application\/pdf \d{4,}/.test(pdfK ?? ""), pdfK);
  const pdfM = await b.js(`fetch('/pdf/wochenplan?woche=${WOCHE}&monteur=${emil.id}').then(async (r) => r.status + ' ' + r.headers.get('content-type') + ' ' + (await r.arrayBuffer()).byteLength)`);
  pruefe("Wochenplan-PDF eines Monteurs", /^200 application\/pdf \d{4,}/.test(pdfM ?? ""), pdfM);
  const ohne = await b.js(`fetch('/pdf/wochenplan?woche=${WOCHE}').then((r) => r.status)`);
  pruefe("Ohne Monteur bzw. Kolonne: 400", ohne === 400);
  if (fotos) {
    const b64 = await b.js(`fetch('/pdf/wochenplan?woche=${WOCHE}&kolonne=${kolonneId}').then((r) => r.arrayBuffer()).then((x) => { let s = ''; new Uint8Array(x).forEach((c) => (s += String.fromCharCode(c))); return btoa(s); })`);
    writeFileSync(path.join(fotos, "wochenplan-kolonne.pdf"), Buffer.from(b64, "base64"));
  }
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  // Über die Oberfläche entstandene Zeilen zuerst (Einsätze, Teams, Kolonne, Ressource), dann die gemerkten Testdaten
  const ids = [auftragA?.id, auftragB?.id].filter(Boolean);
  try {
    if (ids.length) {
      await dbAbfrage("delete from public.einsatz_monteur where einsatz_id in (select id from public.einsatz where auftrag_id = any($1))", [ids]);
      await dbAbfrage("delete from public.einsatz where auftrag_id = any($1)", [ids]);
    }
    if (kolonneId) {
      await dbAbfrage("delete from public.kolonne_mitglied where kolonne_id = $1", [kolonneId]);
      await dbAbfrage("delete from public.kolonne where id = $1", [kolonneId]);
    }
    if (ressourceId) await dbAbfrage("delete from public.ressource where id = $1", [ressourceId]);
    await dbAbfrage("update public.einstellung set plantafel_gruppen = $1", [gruppenVorher ?? null]);
  } catch (e) {
    console.error("Aufräumen Plantafel:", e.message);
  }
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
