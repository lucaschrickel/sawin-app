// End-to-End-Test Service: Service-Tickets (Liste, Board, Ticketseite, Reklamations-Regel, Zeiten, Aufgaben, Löschen)
// und Service-Plan (Zeile „Terminierbar“, Einplanen per Ziehen, belegt im Montageplan).
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:service (optional FOTOS=<Ordner>).
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
const SLOT = 26;
let b;
const sichtbar = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length > 0)`;
const berlinHeute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const plus = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const montag = (d) => plus(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
const NAECHSTER_MONTAG = plus(montag(berlinHeute), 7);
const MITTWOCH = plus(NAECHSTER_MONTAG, 2);
async function warteDb(sql, werte, pruef) {
  for (let i = 0; i < 30; i++) {
    const z = await dbAbfrage(sql, werte);
    if (pruef(z)) return true;
    await sleep(250);
  }
  return false;
}
async function waehle(n, eintrag) {
  await b.js(`document.querySelectorAll('[role=dialog] button[role=combobox]')[${n}].setAttribute('data-e2e-select', '1')`);
  await b.klick("[data-e2e-select='1']");
  await b.js("document.querySelector(\"[data-e2e-select='1']\").removeAttribute('data-e2e-select')");
  await b.klickText("[role=option]", eintrag);
}
async function imLetztenDialog(text) {
  await b.js(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].at(-1); const k = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); k.setAttribute('data-x', 'los'); })()`);
  await b.klick("[data-x='los']");
}
/** HTML5-Ziehen (wie im Board) mit Zielkoordinaten für die Plantafel */
const ziehen = (quelle, ziel, dx = null) =>
  b.js(`(() => { const q = ${sichtbar(quelle)}; const z = ${sichtbar(ziel)}; const r = z.getBoundingClientRect(); const x = ${dx === null ? "r.x + r.width / 2" : `r.x + ${dx}`}; const y = r.y + 10; const dt = new DataTransfer();
    q.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
    z.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
    z.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y })); })()`);

try {
  const admin = await testAdmin();
  const { data: kunde } = await service.from("kunde").insert({ name: `Servicekunde ${lauf}`, strasse: "Am Markt 1", plz: "29221", ort: "Celle" }).select("id, name").single();
  merken("kunde", kunde.id);
  const { data: altAuftrag } = await service.from("auftrag").insert({ nummer: `SA${lauf}`, kunde_id: kunde.id, titel: "Rollläden", phase: "abgeschlossen" }).select("id, nummer").single();
  merken("auftrag", altAuftrag.id);
  const { data: laufAuftrag } = await service.from("auftrag").insert({ nummer: `SB${lauf}`, kunde_id: kunde.id, titel: "Haustür", phase: "montage" }).select("id, nummer").single();
  merken("auftrag", laufAuftrag.id);
  const kz = "S" + lauf.replace(/[^a-f]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
  const { data: monteur } = await service.from("mitarbeiter").insert({ kuerzel: kz, name: `Sven Service ${lauf}`, ist_monteur: true }).select("id, name").single();
  merken("mitarbeiter", monteur.id);

  b = await browser();
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // 1. Ticket anlegen mit Ursprungsauftrag
  await b.gehe("/service");
  pruefe("Navigation zeigt Service-Tickets und Service-Plan", await b.js("['/service', '/serviceplan'].every((h) => [...document.querySelectorAll('aside a[href]')].some((a) => a.getAttribute('href') === h))"));
  await b.klickText("main button", "Neues Ticket");
  await b.tippe("[role=dialog] input[aria-label='Kunde suchen']", `Servicekunde ${lauf}`);
  await b.klickText("#kunden-treffer button span", kunde.name);
  await b.tippe("[role=dialog] input[aria-label='Auftrag suchen']", altAuftrag.nummer);
  await b.klickText("#auftrag-treffer button span", altAuftrag.nummer);
  await b.tippe("[role=dialog] [name=thema]", `Rollladen klemmt ${lauf}`);
  await waehle(0, "Wartung");
  await b.tippe("[role=dialog] [name=problem]", "Gurt reißt");
  await b.klickText("[role=dialog] button", "Ticket anlegen");
  await b.warte("/^\\/service\\/[0-9a-f-]{36}$/.test(location.pathname)");
  const tid = await b.js("location.pathname.split('/').pop()");
  merken("service_ticket", tid);
  const [t1] = await dbAbfrage("select nummer, status, art, auftrag_id, vorab_datum::text v, objekt, zustaendig_id from public.service_ticket where id = $1", [tid]);
  pruefe("Ticket ST-JJ-NNNN, Neu, Wartung, Ursprungsauftrag, Objekt aus dem Kunden", /^ST-\d{2}-\d{4}$/.test(t1?.nummer ?? "") && t1?.status === "neu" && t1?.art === "wartung" && t1?.auftrag_id === altAuftrag.id && t1?.objekt === "Am Markt 1, 29221 Celle" && t1?.zustaendig_id === admin.id, JSON.stringify(t1));
  pruefe("Tag in „Terminierbar“ = kommender Montag", t1?.v === NAECHSTER_MONTAG, t1?.v);
  pruefe("Ticketseite: Statusleiste, Problem, Ursprungsauftrag", await b.warte(`document.querySelector('ol[aria-label=Ticketstatus] [aria-current=step]')?.innerText.includes("Neu") && document.querySelector('main').innerText.includes("Gurt reißt") && document.querySelector('main').innerText.includes(${JSON.stringify(altAuftrag.nummer)})`));

  // 2. Reklamation zu einem nicht abgeschlossenen Auftrag: App bietet die Phase „Reklamation“ an
  await b.gehe("/service");
  await b.klickText("main button", "Neues Ticket");
  await b.tippe("[role=dialog] input[aria-label='Kunde suchen']", `Servicekunde ${lauf}`);
  await b.klickText("#kunden-treffer button span", kunde.name);
  await b.tippe("[role=dialog] input[aria-label='Auftrag suchen']", laufAuftrag.nummer);
  await b.klickText("#auftrag-treffer button span", laufAuftrag.nummer);
  await waehle(0, "Reklamation");
  pruefe("Hinweis: Reklamation über die Phase des Auftrags", await b.warte("!!document.querySelector('[data-reklamation-hinweis]')"));
  await b.klickText("[role=dialog] button", "Stattdessen Auftrag auf „Reklamation“ setzen");
  pruefe("Auftrag steht auf „Reklamation“, kein Ticket", (await warteDb("select phase from public.auftrag where id = $1", [laufAuftrag.id], (r) => r[0]?.phase === "reklamation")) && (await b.warte(`location.pathname === '/auftraege/${laufAuftrag.id}'`)));

  // 3. Zeit, Aufgabe und Notiz am Ticket
  await b.gehe(`/service/${tid}`);
  await b.klickText("main button", "Zeit eintragen");
  pruefe("Zeit eintragen: Ticket vorbelegt", await b.warte(`document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(t1.nummer)})`));
  await waehle(0, monteur.name);
  await waehle(1, "Service");
  await b.js(`(() => { const el = ${sichtbar("[role=dialog] [name=beginn]")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "08:00"); el.dispatchEvent(new Event("input", { bubbles: true })); const e2 = ${sichtbar("[role=dialog] [name=ende]")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e2, "10:00"); e2.dispatchEvent(new Event("input", { bubbles: true })); const p = ${sichtbar("[role=dialog] [name=pause_min]")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(p, "0"); p.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await b.klickText("[role=dialog] button", "Eintragen");
  await b.warte("!document.querySelector('[role=dialog]')");
  const [z] = await dbAbfrage("select id, ticket_id, auftrag_id from public.zeitbuchung where mitarbeiter_id = $1", [monteur.id]);
  if (z) merken("zeitbuchung", z.id);
  pruefe("Zeit auf das Ticket gebucht (2 h)", z?.ticket_id === tid && z?.auftrag_id === null && (await b.warte(`document.querySelector('[data-stunden-ticket]')?.textContent === "2 h"`)));
  await b.klickText("main button", "Aufgabe");
  pruefe("Aufgabe: Bezug Ticket vorbelegt", await b.warte(`document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(t1.nummer)})`));
  await b.tippe("[role=dialog] [name=titel]", `Ersatzgurt bestellen ${lauf}`);
  await b.klickText("[role=dialog] button", "Aufgabe anlegen");
  await b.warte("!document.querySelector('[role=dialog]')");
  const [auf] = await dbAbfrage("select id, ticket_id from public.aufgabe where titel = $1", [`Ersatzgurt bestellen ${lauf}`]);
  if (auf) merken("aufgabe", auf.id);
  pruefe("Aufgabe hängt am Ticket", auf?.ticket_id === tid);
  await b.klickText("nav[aria-label=Bereiche] a", "Historie");
  await b.tippe("textarea[aria-label=Notiz]", `Kunde ruft zurück ${lauf}`);
  await b.klickText("main button", "Eintragen");
  pruefe("Notiz in der Historie", await b.warte(`document.body.innerText.includes("Kunde ruft zurück ${lauf}") && document.body.innerText.includes("Ticket angelegt")`));
  (await dbAbfrage("select id from public.historie_notiz where ticket_id = $1", [tid])).forEach((x) => merken("historie_notiz", x.id));
  if (fotos) await b.foto(path.join(fotos, "ticket.png"));

  // 4. Liste mit Schnellfiltern, Board mit Ziehen
  await b.gehe(`/service?q=${lauf}&art=wartung`);
  pruefe("Liste: Filter Art „Wartung“ zeigt das Ticket", await b.warte(`document.querySelector('main table')?.innerText.includes(${JSON.stringify(t1.nummer)})`));
  await b.gehe(`/service?q=${lauf}&art=reparatur`);
  pruefe("Filter „Reparatur“ blendet es aus", await b.enthaelt("Keine Tickets für diese Auswahl"));
  await b.gehe(`/service?q=${lauf}`);
  await b.klickText("button", "Board");
  pruefe("Board-Ansicht", await b.da(`[data-ticket='${tid}']`));
  (await dbAbfrage("select id from public.benutzer_einstellung where benutzer_id = $1", [admin.id])).forEach((x) => merken("benutzer_einstellung", x.id));
  await ziehen(`[data-ticket='${tid}']`, "section[data-status='abgerechnet']");
  pruefe("„Abgerechnet“ per Ziehen abgelehnt", (await b.warte(`document.body.innerText.includes("„Abgerechnet“ setzt die App")`)) && (await dbAbfrage("select status from public.service_ticket where id = $1", [tid]))[0].status === "neu");
  await ziehen(`[data-ticket='${tid}']`, "section[data-status='in_arbeit']");
  pruefe("Ziehen nach „In Arbeit“ speichert", await warteDb("select status from public.service_ticket where id = $1", [tid], (r) => r[0]?.status === "in_arbeit"));
  if (fotos) await b.foto(path.join(fotos, "service-board.png"));
  await b.klickText("button", "Liste");
  await b.warte(`!${sichtbar("[data-ticket]")}`);

  // 5. Service-Plan: Terminierbar, Tag verschieben, auf einen Monteur ziehen
  await b.gehe(`/serviceplan?woche=${NAECHSTER_MONTAG}`);
  pruefe("Terminierbar zeigt das Ticket am Montag", await b.warte(`document.querySelector("[data-terminierbar='${tid}']")?.dataset.tag === "${NAECHSTER_MONTAG}"`));
  // Erste Aktion nach dem Laden: wiederholen, bis React die Seite übernommen hat
  let verschoben = false;
  for (let i = 0; i < 4 && !verschoben; i++) {
    await ziehen(`[data-terminierbar='${tid}']`, "[data-planungszeile='terminierbar'] > div:last-child", (2 * 9 + 1) * SLOT);
    verschoben = await warteDb("select vorab_datum::text v from public.service_ticket where id = $1", [tid], (r) => r[0]?.v === MITTWOCH);
  }
  pruefe("Ziehen in der Zeile verschiebt den Tag auf Mittwoch", verschoben);
  await b.warte(`document.querySelector("[data-terminierbar='${tid}']")?.dataset.tag === "${MITTWOCH}"`);
  if (fotos) await b.foto(path.join(fotos, "serviceplan-terminierbar.png"));
  await ziehen(`[data-terminierbar='${tid}']`, `[data-zeile='${monteur.id}']`, (2 * 9 + 2.5) * SLOT);
  pruefe("Ziehen auf den Monteur plant ein: Mi 09:00–11:00, vorgeplant", await warteDb("select to_char(beginn at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') b, to_char(ende at time zone 'Europe/Berlin', 'HH24:MI') e, fest from public.einsatz where ticket_id = $1 and deleted_at is null", [tid], (r) => r[0]?.b === `${MITTWOCH}T09:00` && r[0]?.e === "11:00" && r[0]?.fest === false));
  const [e1] = await dbAbfrage("select id from public.einsatz where ticket_id = $1", [tid]);
  if (e1) merken("einsatz", e1.id);
  pruefe("Ticket ist „Eingeplant“, nicht mehr terminierbar, Balken in der Zeile", (await warteDb("select status from public.service_ticket where id = $1", [tid], (r) => r[0]?.status === "eingeplant" || r[0]?.status === "in_arbeit")) && (await b.warte(`!document.querySelector("[data-terminierbar='${tid}']") && !!document.querySelector("[data-monteur-zeile='${monteur.id}'] [data-einsatz='${e1?.id}']")`)));
  if (fotos) await b.foto(path.join(fotos, "serviceplan.png"));

  // 6. Im Montageplan erscheint der Service-Einsatz grau als „belegt“
  await b.gehe(`/montageplan?woche=${NAECHSTER_MONTAG}`);
  pruefe("Montageplan: Service-Einsatz als „belegt“", await b.warte(`document.querySelector("[data-monteur-zeile='${monteur.id}'] [data-einsatz='${e1?.id}']")?.dataset.belegt === "1"`));

  // 7. Kunden- und Auftragsseite zeigen das Ticket; am Auftrag „offenes Ticket“
  await b.gehe(`/kunden/${kunde.id}`);
  pruefe("Kundenseite zeigt das Ticket", await b.warte(`!!${sichtbar(`main a[href='/service/${tid}']`)}`));
  await b.gehe(`/auftraege/${altAuftrag.id}`);
  pruefe("Auftrag zeigt Ticket und „offenes Ticket“", await b.warte(`!!${sichtbar(`main a[href='/service/${tid}']`)} && !!document.querySelector('[data-offenes-ticket]')`));

  // 8. Seitenleiste zählt offene Tickets
  pruefe("Seitenleiste zählt das offene Ticket", await b.js(`Number(document.querySelector("aside [data-zaehler='service']")?.textContent) >= 1`));

  // 9. Löschen: mit Einsatz gesperrt, ohne nur Markierung
  await b.gehe(`/service/${tid}`);
  await b.klickText("main button", "Löschen");
  await imLetztenDialog("Löschen");
  pruefe("mit Einsatz und Zeit: Löschen abgelehnt", await b.warte(`document.body.innerText.includes("Das Ticket hat Einsätze")`));
  const { data: leer } = await service.from("service_ticket").insert({ kunde_id: kunde.id, thema: `Löschtest ${lauf}` }).select("id").single();
  merken("service_ticket", leer.id);
  await b.gehe(`/service/${leer.id}`);
  await b.klickText("main button", "Löschen");
  await imLetztenDialog("Löschen");
  await b.warte("location.pathname === '/service'");
  pruefe("ohne Einsätze nur als gelöscht markiert", await warteDb("select deleted_at from public.service_ticket where id = $1", [leer.id], (r) => !!r[0]?.deleted_at));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  const em = await dbAbfrage("select m.id from public.einsatz_monteur m join public.einsatz e on e.id = m.einsatz_id join public.service_ticket t on t.id = e.ticket_id join public.kunde k on k.id = t.kunde_id where k.name = $1", [`Servicekunde ${lauf}`]).catch(() => []);
  em.forEach((x) => merken("einsatz_monteur", x.id));
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
