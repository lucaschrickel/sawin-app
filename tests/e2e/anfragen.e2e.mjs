// End-to-End-Test Modul Anfragen mit einem vorübergehenden Test-Admin.
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:anfragen
// Optional FOTOS=<Ordner> für Bildschirmfotos.
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;
const sichtbar = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length > 0)`;
const setzeWert = (sel, wert) => b.js(`(() => { const el = ${sichtbar(sel)}; el.value = ${JSON.stringify(wert)}; el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
const anfrageIdAusPfad = async () => (await b.pfad()).split("/").pop();

try {
  const admin = await testAdmin();
  const { data: kunde } = await service
    .from("kunde")
    .insert({ name: `Familie Anfragetest ${lauf}`, strasse: "Teststraße 1", plz: "38518", ort: "Gifhorn", herkunft: "Empfehlung" })
    .select("id, name")
    .single();
  merken("kunde", kunde.id);
  b = await browser();
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // 1. Erfassen mit Kundensuche; Objekt und Herkunft aus dem Kunden vorbelegt
  await b.gehe("/anfragen");
  pruefe("Navigation zeigt Anfragen", await b.js("[...document.querySelectorAll('aside a[href]')].some((a) => a.getAttribute('href') === '/anfragen')"));
  await b.klickText("button", "Neue Anfrage");
  await b.tippe("[role=dialog] [name=titel]", `Haustür und Fenster ${lauf}`);
  await b.tippe("[role=dialog] input[aria-label='Kunde suchen']", `Anfragetest ${lauf}`);
  await b.klickText("#kunden-treffer button span", kunde.name);
  pruefe("Kunde gewählt", await b.enthaelt(kunde.name));
  pruefe("Objekt aus der Rechnungsadresse vorbelegt", await b.warte(`${sichtbar("[role=dialog] [name=objekt]")}?.value === "Teststraße 1, 38518 Gifhorn"`));
  pruefe("Herkunft aus dem Kunden vorbelegt", await b.warte("[...document.querySelectorAll('[role=dialog] button[role=combobox]')][0]?.textContent === 'Empfehlung'"));
  await b.klickText("[role=dialog] label", "Fenster");
  await b.tippe("[role=dialog] [name=geschaetzter_wert]", "12000");
  const gestern = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  await setzeWert("[role=dialog] [name=wiedervorlage]", gestern);
  if (fotos) await b.foto(path.join(fotos, "anfrage-dialog.png"));
  await b.klickText("[role=dialog] button", "Anfrage anlegen");
  pruefe("Anlegen öffnet die Anfrageseite", await b.warte("/^\\/anfragen\\/[0-9a-f-]{36}$/.test(location.pathname)"), await b.pfad());
  const id1 = await anfrageIdAusPfad();
  merken("anfrage", id1);
  const [q1] = await dbAbfrage("select status, kunde_id, produkte, geschaetzter_wert, zustaendig_id, created_by from public.anfrage where id = $1", [id1]);
  pruefe("gespeichert: Kunde, Produkte, Wert, Zuständig = ich", q1.kunde_id === kunde.id && q1.produkte.includes("Fenster") && Number(q1.geschaetzter_wert) === 12000 && q1.zustaendig_id === admin.id && q1.created_by === admin.id);

  // 2. Status ändern, Historie, Notiz
  await b.js(`${sichtbar("button[aria-label='Status ändern']")}.setAttribute("data-x", "status")`);
  await b.klick("[data-x='status']");
  await b.klickText("[role=option]", "In Klärung");
  pruefe("Status geändert, Historie zeigt den Wechsel", await b.enthaelt("Status: Neu → In Klärung"));
  await b.tippe("textarea[aria-label='Notiz']", "Kunde ruft zurück wegen Farbe");
  await b.js(`(() => { const s = ${sichtbar("select[aria-label='Art']")}; s.value = "telefonat"; })()`);
  await b.klickText("button", "Eintragen");
  pruefe("Telefonat in der Historie", await b.enthaelt("Kunde ruft zurück wegen Farbe"));
  if (fotos) await b.foto(path.join(fotos, "anfrage-seite.png"));
  (await dbAbfrage("select id from public.historie_notiz where anfrage_id = $1", [id1])).forEach((n) => merken("historie_notiz", n.id));

  // 3. Liste, Filter, überfällige Wiedervorlage
  await b.gehe(`/anfragen?q=${lauf}`);
  pruefe("Liste zeigt die Anfrage", await b.enthaelt(`Haustür und Fenster ${lauf}`));
  pruefe("überfällige Wiedervorlage rot", await b.js("[...document.querySelectorAll('td')].some((td) => td.textContent.startsWith('Wiedervorlage') && td.className.includes('text-tone-red-fg'))"));
  await b.gehe(`/anfragen?q=${lauf}&status=neu`);
  pruefe("Statusfilter „Neu“ blendet sie aus", await b.enthaelt("Keine Anfragen für diese Auswahl"));
  await b.gehe(`/anfragen?q=${lauf}&status=in_klaerung&meine=1`);
  pruefe("Filter „In Klärung“ und „Meine“", await b.enthaelt(`Haustür und Fenster ${lauf}`));
  if (fotos) await b.foto(path.join(fotos, "anfragen-liste.png"));

  // 4. Board: Ansicht gemerkt, Karte ziehen ändert den Status
  await b.klickText("button", "Board");
  pruefe("Board-Ansicht", await b.da(`[data-anfrage='${id1}']`));
  await b.js(`(() => { const karte = ${sichtbar(`[data-anfrage='${id1}']`)}; const spalte = ${sichtbar("section[data-status='angebot_erstellen']")}; const dt = new DataTransfer();
    karte.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
    spalte.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    spalte.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt })); })()`);
  let gezogen = false;
  for (let i = 0; i < 20 && !gezogen; i++) { await sleep(300); gezogen = (await dbAbfrage("select status from public.anfrage where id = $1", [id1]))[0].status === "angebot_erstellen"; }
  pruefe("Ziehen nach „Angebot erstellen“ speichert den Status", gezogen);
  if (fotos) await b.foto(path.join(fotos, "anfragen-board.png"));
  await b.gehe(`/anfragen?q=${lauf}`);
  pruefe("Board bleibt gemerkt", await b.da(`[data-anfrage='${id1}']`));
  (await dbAbfrage("select e.id from public.benutzer_einstellung e where e.benutzer_id = $1", [admin.id])).forEach((x) => merken("benutzer_einstellung", x.id));
  await b.klickText("button", "Liste");
  await b.warte("!document.querySelector('[data-anfrage]') || [...document.querySelectorAll('[data-anfrage]')].every((e) => !e.getClientRects().length)");

  // 5. Zweite Anfrage mit neuem Kunden direkt im Dialog; verloren, Archiv, wiederherstellen, löschen
  await b.gehe("/anfragen");
  await b.klickText("button", "Neue Anfrage");
  await b.tippe("[role=dialog] [name=titel]", `Garagentor ${lauf}`);
  await b.klickText("[role=dialog] button", "Neuer Kunde");
  await b.warte("document.querySelectorAll('[role=dialog]').length === 2");
  await b.tippe("[role=dialog]:last-of-type [name=name]", `Neukunde ${lauf}`);
  await b.klickText("[role=dialog] button", "Kunde anlegen");
  pruefe("neuer Kunde im Anfrage-Dialog gewählt", await b.warte(`document.querySelectorAll('[role=dialog]').length === 1 && document.querySelector('[role=dialog]').innerText.includes("Neukunde ${lauf}")`));
  const [neukunde] = await dbAbfrage("select id from public.kunde where name = $1", [`Neukunde ${lauf}`]);
  if (neukunde) merken("kunde", neukunde.id);
  await b.klickText("[role=dialog] button", "Anfrage anlegen");
  await b.warte("/^\\/anfragen\\/[0-9a-f-]{36}$/.test(location.pathname)");
  const id2 = await anfrageIdAusPfad();
  merken("anfrage", id2);
  pruefe("zweite Anfrage beim neuen Kunden", (await dbAbfrage("select kunde_id from public.anfrage where id = $1", [id2]))[0]?.kunde_id === neukunde?.id);
  await b.klickText("main button", "Verloren");
  await b.tippe("[role=dialog] [name=grund]", "Zu teuer");
  await b.klickText("[role=dialog] button", "Als verloren archivieren");
  pruefe("verloren mit Grund", await b.enthaelt("Verloren · Grund: Zu teuer"));
  await b.gehe(`/anfragen?ansicht=archiv&q=${lauf}`);
  pruefe("Archiv zeigt verloren mit Grund", (await b.enthaelt(`Garagentor ${lauf}`)) && (await b.text()).includes("Zu teuer"));
  await b.gehe(`/anfragen/${id2}`);
  await b.klickText("main button", "Wiederherstellen");
  pruefe("wiederhergestellt", await b.warte("!!document.querySelector('button[aria-label=\"Status ändern\"]')"));
  await b.klickText("main button", "Löschen");
  await b.klickText("[role=dialog] button", "Löschen");
  pruefe("Löschen führt zur Liste", await b.warte("location.pathname === '/anfragen'"));
  pruefe("nur als gelöscht markiert", !!(await dbAbfrage("select deleted_at from public.anfrage where id = $1", [id2]))[0]?.deleted_at);

  // 6. Gewonnen – Auftrag anlegen
  await b.gehe(`/anfragen/${id1}`);
  await b.klickText("main button", "Gewonnen – Auftrag anlegen");
  await b.klickText("[role=dialog] button", "Auftrag anlegen");
  pruefe("Auftrag angelegt, Hinweis mit AB-Nummer", await b.warte("/Auftrag AB2\\d{6} angelegt/.test(document.body.innerText)"));
  const [auftrag] = await dbAbfrage("select id, nummer from public.auftrag where anfrage_id = $1", [id1]);
  if (auftrag) merken("auftrag", auftrag.id);
  pruefe("Seite zeigt „Gewonnen“ mit Auftragsnummer", await b.enthaelt("Gewonnen · Auftrag"));
  pruefe("Löschen nach Auftrag nicht mehr angeboten", await b.warte("![...document.querySelectorAll('main button')].some((x) => x.getClientRects().length && x.textContent.trim() === 'Löschen')"));
  await b.gehe(`/kunden/${kunde.id}`);
  pruefe("Kundenseite zeigt Auftrag und Anfrage", (await b.enthaelt(auftrag?.nummer ?? "AB")) && (await b.text()).includes(`Haustür und Fenster ${lauf}`) && (await b.text()).includes("Gewonnen"));
  await b.klickText("main button", "Neue Anfrage");
  pruefe("„Neue Anfrage“ auf der Kundenseite mit vorbelegtem Kunden", await b.warte(`document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(kunde.name)})`));
  if (fotos) await b.foto(path.join(fotos, "kunde-mit-anfragen.png"));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
