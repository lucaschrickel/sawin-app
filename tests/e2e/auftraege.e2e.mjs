// End-to-End-Test Modul Aufträge mit einem vorübergehenden Test-Admin.
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:auftraege
// Optional FOTOS=<Ordner> für Bildschirmfotos.
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;
const sichtbar = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length > 0)`;
const setzeWert = (sel, wert) => b.js(`(() => { const el = ${sichtbar(sel)}; el.value = ${JSON.stringify(wert)}; el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
async function warteDb(sql, werte, pruef) {
  for (let i = 0; i < 24; i++) {
    const [z] = await dbAbfrage(sql, werte);
    if (z && pruef(z)) return true;
    await sleep(250);
  }
  return false;
}
/** Klickt den Knopf mit diesem Text im zuletzt geöffneten Dialog (z. B. Bestätigung) */
async function imLetztenDialog(text) {
  await b.js(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].at(-1); const k = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); k.setAttribute('data-x', 'los'); })()`);
  await b.klick("[data-x='los']");
}

try {
  const admin = await testAdmin();
  const { data: kunde } = await service.from("kunde").insert({ name: `Auftragstest ${lauf}`, telefon: "05141 1234" }).select("id, name").single();
  merken("kunde", kunde.id);
  const { data: anfrage } = await service.from("anfrage").insert({ titel: `Haustür Müller ${lauf}`, kunde_id: kunde.id, objekt: "Gartenweg 3, Celle", produkte: ["Haustür"] }).select("id").single();
  merken("anfrage", anfrage.id);
  b = await browser();
  await b.anmelden(admin);
  await b.warte("location.pathname === '/kunden'");

  // 1. Auftrag aus der Anfrage; Hinweis verlinkt den Auftrag
  await b.gehe(`/anfragen/${anfrage.id}`);
  await b.klickText("button", "Gewonnen – Auftrag anlegen");
  await imLetztenDialog("Auftrag anlegen");
  pruefe("Anfrage verlinkt den neuen Auftrag", await b.warte(`!!${sichtbar("main a[href^='/auftraege/']")}`));
  const [auftrag] = await dbAbfrage("select id, nummer from public.auftrag where anfrage_id = $1", [anfrage.id]);
  if (auftrag) merken("auftrag", auftrag.id);
  pruefe("Auftrag mit AB-Nummer angelegt", /^AB2\d{6}$/.test(auftrag?.nummer ?? ""), auftrag?.nummer);
  await b.klick(`main a[href='/auftraege/${auftrag.id}']`);
  await b.warte(`location.pathname === '/auftraege/${auftrag.id}' && document.querySelector('main h1')?.textContent.includes(${JSON.stringify(kunde.name)})`);
  pruefe("Auftragsseite: Nummer, Kunde, Objekt, Telefon", await b.enthaelt(auftrag.nummer) && (await b.enthaelt("Gartenweg 3, Celle")) && (await b.enthaelt("05141 1234")));
  pruefe("Anfrage verlinkt, Belege-Bereich vorbereitet", (await b.js(`!!${sichtbar(`a[href='/anfragen/${anfrage.id}']`)}`)) && (await b.enthaelt("Die Belegkette")));

  // 2. Phase über die Phasenleiste und das Auswahlfeld
  await b.klickText("ol[aria-label=Phase] button > span:last-child", "Montage");
  pruefe("Phasenleiste setzt „Montage“", await warteDb("select phase from public.auftrag where id = $1", [auftrag.id], (z) => z.phase === "montage"));
  await b.klick("button[aria-label='Phase ändern']");
  await b.klickText("[role=option]", "Abnahme");
  pruefe("Auswahl setzt „Abnahme“", await warteDb("select phase from public.auftrag where id = $1", [auftrag.id], (z) => z.phase === "abnahme"));
  await b.warte(`document.querySelector("ol[aria-label=Phase] [aria-current=step]")?.textContent.includes("Abnahme")`);

  // 3. Bestellung & Lieferung direkt in der Karte
  await setzeWert("[name=liefertermin]", "2026-12-07");
  await setzeWert("[name=noch_nicht_bestellt]", "Griffstange");
  await b.klickText("main form button", "Speichern");
  pruefe("Liefertermin und „Noch nicht bestellt“ gespeichert", await warteDb("select liefertermin::text l, noch_nicht_bestellt n from public.auftrag where id = $1", [auftrag.id], (z) => z.l === "2026-12-07" && z.n === "Griffstange"));

  // 4. Bearbeiten
  await b.klickText("main button", "Bearbeiten");
  await b.tippe("[role=dialog] [name=titel]", `Haustür RC2 ${lauf}`);
  await b.js(`document.querySelectorAll('[role=dialog] button[role=combobox]')[0].setAttribute('data-e2e-select', '1')`);
  await b.klick("[data-e2e-select='1']");
  await b.klickText("[role=option]", "Bereit");
  await b.klickText("[role=dialog] button", "Speichern");
  await b.warte("!document.querySelector('[role=dialog]')");
  pruefe("Titel und Montagestatus gespeichert", await warteDb("select titel, montagestatus from public.auftrag where id = $1", [auftrag.id], (z) => z.titel === `Haustür RC2 ${lauf}` && z.montagestatus === "bereit"));

  // 5. Aufgabe am Auftrag mit vorbelegtem Bezug
  await b.klickText("main button", "Aufgabe");
  pruefe("Bezug Auftrag vorbelegt", await b.warte(`document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(auftrag.nummer)})`));
  await b.tippe("[role=dialog] [name=titel]", `Griffstange bestellen ${lauf}`);
  await b.klickText("[role=dialog] button", "Aufgabe anlegen");
  await b.warte("!document.querySelector('[role=dialog]')");
  const [aufgabe] = await dbAbfrage("select id, auftrag_id from public.aufgabe where titel = $1", [`Griffstange bestellen ${lauf}`]);
  if (aufgabe) merken("aufgabe", aufgabe.id);
  pruefe("Aufgabe hängt am Auftrag und steht auf der Seite", aufgabe?.auftrag_id === auftrag.id && (await b.enthaelt(`Griffstange bestellen ${lauf}`)));
  if (fotos) await b.foto(path.join(fotos, "auftrag-uebersicht.png"));

  // 6. Historie mit Phasenwechsel und Notiz
  await b.klickText("nav[aria-label=Bereiche] a", "Historie");
  pruefe("Historie zeigt den Phasenwechsel", await b.warte(`document.body.innerText.includes("Phase: Bestellung → Montage") && document.body.innerText.includes("Liefertermin 07.12.2026")`));
  await b.tippe("textarea[aria-label=Notiz]", `Kunde will vorher anrufen ${lauf}`);
  await b.klickText("main button", "Eintragen");
  pruefe("Notiz in der Historie", await b.warte(`document.body.innerText.includes("Kunde will vorher anrufen ${lauf}")`));
  (await dbAbfrage("select id from public.historie_notiz where auftrag_id = $1", [auftrag.id])).forEach((x) => merken("historie_notiz", x.id));

  // 7. Prüfhinweis: Banner, „Geprüft, Hinweis entfernen“
  await service.from("auftrag").update({ pruefhinweis: "Aufmaß und Bestellung weichen ab" }).eq("id", auftrag.id);
  await b.gehe(`/auftraege/${auftrag.id}`);
  pruefe("Prüfhinweis als Banner", await b.enthaelt("Aufmaß und Bestellung weichen ab"));
  await b.klickText("main button", "Geprüft, Hinweis entfernen");
  pruefe("Prüfhinweis entfernt", await warteDb("select pruefhinweis from public.auftrag where id = $1", [auftrag.id], (z) => z.pruefhinweis === null));

  // 8. Liste mit Filtern, Pipeline mit Ziehen
  await b.gehe(`/auftraege?q=${lauf}`);
  pruefe("Navigation zeigt Aufträge", await b.js("[...document.querySelectorAll('aside a[href]')].some((a) => a.getAttribute('href') === '/auftraege')"));
  pruefe("Liste zeigt den Auftrag mit Phase und Liefertermin", await b.warte(`document.querySelector('main table')?.innerText.includes(${JSON.stringify(auftrag.nummer)}) && document.querySelector('main table').innerText.includes("Abnahme") && document.querySelector('main table').innerText.includes("Lieferung 07.12.2026")`));
  await b.gehe(`/auftraege?q=${lauf}&phase=bestellung`);
  pruefe("Phasenfilter „Bestellung“ blendet ihn aus", await b.enthaelt("Keine Aufträge für diese Auswahl"));
  await b.gehe(`/auftraege?q=${lauf}&produkt=Fenster`);
  pruefe("Produktfilter „Fenster“ blendet ihn aus", await b.enthaelt("Keine Aufträge für diese Auswahl"));
  await b.gehe(`/auftraege?q=${lauf}&produkt=Haust%C3%BCr`);
  pruefe("Produktfilter „Haustür“ zeigt ihn", await b.enthaelt(auftrag.nummer));
  if (fotos) await b.foto(path.join(fotos, "auftraege-liste.png"));
  await b.klickText("button", "Board");
  pruefe("Pipeline-Ansicht", await b.da(`[data-auftrag='${auftrag.id}']`));
  (await dbAbfrage("select id from public.benutzer_einstellung where benutzer_id = $1", [admin.id])).forEach((x) => merken("benutzer_einstellung", x.id));
  await b.js(`(() => { const karte = ${sichtbar(`[data-auftrag='${auftrag.id}']`)}; const spalte = ${sichtbar("section[data-phase='baustelle_fertig']")}; const dt = new DataTransfer();
    karte.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
    spalte.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    spalte.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt })); })()`);
  pruefe("Ziehen nach „Baustelle fertig“ speichert die Phase", await warteDb("select phase from public.auftrag where id = $1", [auftrag.id], (z) => z.phase === "baustelle_fertig"));
  if (fotos) await b.foto(path.join(fotos, "auftraege-pipeline.png"));
  await b.gehe(`/auftraege?q=${lauf}`);
  pruefe("Pipeline bleibt gemerkt", await b.da(`[data-auftrag='${auftrag.id}']`));
  pruefe("ohne „Abgeschlossene zeigen“ keine Spalte „Abgeschlossen“", !(await b.js(`!!${sichtbar("section[data-phase='abgeschlossen']")}`)));
  await b.klickText("button", "Liste");
  await b.warte(`!${sichtbar("[data-auftrag]")}`);

  // 9. Kundenseite zeigt den Auftrag mit Phase und Link
  await b.gehe(`/kunden/${kunde.id}`);
  pruefe("Kundenseite: Auftrag mit Phase und Link", await b.warte(`!!${sichtbar(`a[href='/auftraege/${auftrag.id}']`)} && document.querySelector("main").innerText.includes("Baustelle fertig")`));

  // 10. Löschen: mit Einsatz gesperrt, ohne nur als Markierung
  const kz = "E" + lauf.replace(/[^a-z]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
  const { data: monteur } = await service.from("mitarbeiter").insert({ kuerzel: kz, name: `E2E Monteur ${lauf}`, ist_monteur: true }).select("id").single();
  merken("mitarbeiter", monteur.id);
  const { data: einsatz } = await service.from("einsatz").insert({ auftrag_id: auftrag.id, beginn: "2026-12-08T06:00:00Z", ende: "2026-12-08T15:00:00Z" }).select("id").single();
  merken("einsatz", einsatz.id);
  const { data: em } = await service.from("einsatz_monteur").insert({ einsatz_id: einsatz.id, mitarbeiter_id: monteur.id }).select("id").single();
  merken("einsatz_monteur", em.id);
  await b.gehe(`/auftraege/${auftrag.id}`);
  pruefe("Montage-Karte zeigt den Einsatz mit Monteur", await b.enthaelt(`E2E Monteur ${lauf}`));
  await b.klickText("main button", "Löschen");
  pruefe("Löschen fragt nach", await b.enthaelt("Auftrag löschen?"));
  await imLetztenDialog("Löschen");
  pruefe("mit Einsatz: Löschen abgelehnt mit Grund", await b.warte(`document.body.innerText.includes("Der Auftrag hat Einsätze")`));
  await dbAbfrage("update public.einsatz_monteur set deleted_at = now() where id = $1", [em.id]);
  await dbAbfrage("update public.einsatz set deleted_at = now() where id = $1", [einsatz.id]);
  await b.gehe(`/auftraege/${auftrag.id}`);
  await b.klickText("main button", "Löschen");
  await imLetztenDialog("Löschen");
  await b.warte("location.pathname === '/auftraege'");
  pruefe("ohne Einsatz nur als gelöscht markiert", await warteDb("select deleted_at from public.auftrag where id = $1", [auftrag.id], (z) => !!z.deleted_at));
  await b.gehe(`/auftraege?q=${lauf}&abgeschlossene=1`);
  pruefe("gelöschter Auftrag nicht mehr in der Liste", !(await b.text()).includes(auftrag.nummer));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
