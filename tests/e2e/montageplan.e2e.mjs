// End-to-End-Test Modul Montageplan (Plantafel) mit einem vorübergehenden Test-Admin und echten Mausbewegungen.
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:montageplan
// Optional FOTOS=<Ordner> für Bildschirmfotos. Plant in der Woche ab 14.12.2026 (Winterzeit: Berlin = UTC+1).
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
const WOCHE = "2026-12-14";
const SLOT = 26;
let b;
const sichtbar = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length > 0)`;
const rechteck = (sel) => b.js(`(() => { const r = ${sichtbar(sel)}?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const maus = (type, x, y, buttons = 0) => b.cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: type === "mouseMoved" ? 0 : 1 });
async function ziehe(x1, y1, x2, y2) {
  await maus("mouseMoved", x1, y1);
  await sleep(50);
  await maus("mousePressed", x1, y1, 1);
  for (let i = 1; i <= 8; i++) {
    await maus("mouseMoved", x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8, 1);
    await sleep(30);
  }
  await maus("mouseReleased", x2, y2);
  await sleep(200);
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
const einsatzZeit = (id) => dbAbfrage("select to_char(beginn at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') b, to_char(ende at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') e, fest from public.einsatz where id = $1", [id]);
const team = async (id) => (await dbAbfrage("select mitarbeiter_id from public.einsatz_monteur where einsatz_id = $1 and deleted_at is null", [id])).map((x) => x.mitarbeiter_id).sort();

let arbeitszeitVorher, auftragId;
try {
  const admin = await testAdmin();
  [arbeitszeitVorher] = await dbAbfrage("select arbeitszeit_von::text von, arbeitszeit_bis::text bis from public.einstellung");
  await dbAbfrage("update public.einstellung set arbeitszeit_von = '07:00', arbeitszeit_bis = '16:00'");
  const { data: kunde } = await service.from("kunde").insert({ name: `Plantest ${lauf}` }).select("id, name").single();
  merken("kunde", kunde.id);
  const { data: auftrag } = await service.from("auftrag").insert({ nummer: `E2E${lauf}`, kunde_id: kunde.id, titel: `Fenster ${lauf}`, phase: "montage" }).select("id, nummer").single();
  merken("auftrag", auftrag.id);
  auftragId = auftrag.id;
  const kz = (p) => p + lauf.replace(/[^a-f]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
  const { data: anna } = await service.from("mitarbeiter").insert({ kuerzel: kz("A"), name: `Anna Plan ${lauf}`, ist_monteur: true }).select("id, name").single();
  merken("mitarbeiter", anna.id);
  const { data: urlaub } = await service.from("abwesenheit").insert({ mitarbeiter_id: anna.id, art: "urlaub", von: "2026-12-16", bis: "2026-12-16", status: "genehmigt" }).select("id").single();
  merken("abwesenheit", urlaub.id);

  b = await browser();
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // 1. Tafel: Woche, Arbeitszeit, Monteur-Zeile, genehmigte Abwesenheit
  await b.gehe(`/montageplan?woche=${WOCHE}`);
  pruefe("Navigation zeigt Montageplan", await b.warte("[...document.querySelectorAll('aside a[href]')].some((a) => a.getAttribute('href') === '/montageplan')"));
  pruefe("Kopf: KW 51, Arbeitszeit 7 bis 16 Uhr", await b.warte(`document.querySelector('main').innerText.includes("KW 51") && document.querySelector('main').innerText.includes("Arbeitszeit 7 bis 16 Uhr")`));
  pruefe("Zeile für den Monteur", await b.da(`[data-zeile='${anna.id}']`));
  pruefe("genehmigter Urlaub in der Zeile", await b.js(`!!document.querySelector("[data-monteur-zeile='${anna.id}'] [data-abwesenheit='genehmigt']")`));

  // 2. Monteur direkt in der Tafel hinzufügen
  await b.klickText("main button", "Monteur hinzufügen");
  await b.tippe("[role=dialog] [name=name]", `Ben Plan ${lauf}`);
  await b.tippe("[role=dialog] [name=kuerzel]", kz("B"));
  await b.klickText("[role=dialog] button", "Monteur anlegen");
  await b.warte("!document.querySelector('[role=dialog]')");
  const [ben] = await dbAbfrage("select id from public.mitarbeiter where name = $1", [`Ben Plan ${lauf}`]);
  if (ben) merken("mitarbeiter", ben.id);
  pruefe("neuer Monteur als Zeile", !!ben && (await b.da(`[data-zeile='${ben.id}']`)));
  await dbAbfrage("insert into public.abwesenheit (mitarbeiter_id, art, von, bis, status) values ($1, 'schulung', '2026-12-17', '2026-12-17', 'beantragt')", [ben.id]);
  (await dbAbfrage("select id from public.abwesenheit where mitarbeiter_id = $1", [ben.id])).forEach((x) => merken("abwesenheit", x.id));

  // 3. Klick in Annas Zeile am Montag um 8 Uhr plant ein
  let zeile = await rechteck(`[data-zeile='${anna.id}']`);
  await maus("mouseMoved", zeile.x + 1.5 * SLOT, zeile.y + 20);
  await maus("mousePressed", zeile.x + 1.5 * SLOT, zeile.y + 20, 1);
  await maus("mouseReleased", zeile.x + 1.5 * SLOT, zeile.y + 20);
  pruefe("Dialog mit Montag 8 bis 16 Uhr und Anna vorbelegt", await b.warte(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return false; const f = [...d.querySelectorAll('input[type=datetime-local]')].map((x) => x.value); const anna = d.querySelector("input[value='${anna.id}']"); return f[0] === "2026-12-14T08:00" && f[1] === "2026-12-14T16:00" && anna?.checked; })()`));
  await b.tippe("[role=dialog] input[aria-label='Auftrag suchen']", `Plantest ${lauf}`);
  await b.klickText("#auftrag-treffer button span", auftrag.nummer);
  await b.tippe("[role=dialog] textarea", "Schlüssel beim Nachbarn");
  await b.klickText("[role=dialog] button", "Einplanen");
  await b.warte("!document.querySelector('[role=dialog]')");
  const [neu] = await dbAbfrage("select id from public.einsatz where auftrag_id = $1", [auftrag.id]);
  if (neu) merken("einsatz", neu.id);
  const id = neu?.id;
  let [z] = id ? await einsatzZeit(id) : [];
  pruefe("Einsatz gespeichert: Mo 08:00–16:00, Anna, vorgeplant", z?.b === "2026-12-14T08:00" && z?.e === "2026-12-14T16:00" && z?.fest === false && (await team(id)).join() === anna.id);
  pruefe("Balken in Annas Zeile, gestrichelt (vorgeplant)", await b.warte(`!!document.querySelector("[data-monteur-zeile='${anna.id}'] [data-einsatz='${id}']")?.className.includes("border-dashed")`));

  // 4. Am rechten Ende ziehen: bis Dienstag 16 Uhr (über zwei Tage)
  let balken = await rechteck(`[data-monteur-zeile='${anna.id}'] [data-einsatz='${id}']`);
  await ziehe(balken.x + balken.w - 3, balken.y + balken.h / 2, balken.x + balken.w - 3 + 9 * SLOT, balken.y + balken.h / 2);
  pruefe("Verlängern über zwei Tage: Ende Di 16:00", await warteDb("select to_char(ende at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') e from public.einsatz where id = $1", [id], (r) => r[0]?.e === "2026-12-15T16:00"));
  [z] = await einsatzZeit(id);
  pruefe("Beginn bleibt Mo 08:00, kein Termin-Dialog nach dem Griff", z.b === "2026-12-14T08:00" && !(await b.js("!!document.querySelector('[role=dialog]')")));
  if (fotos) await b.foto(path.join(fotos, "montageplan-verlaengert.png"));

  // 5. Am linken Ende ziehen: Beginn Mo 07:00 (verlängern nach vorn), dann Ende zurück auf Di 15:00 (verkürzen)
  balken = await rechteck(`[data-monteur-zeile='${anna.id}'] [data-einsatz='${id}']`);
  await ziehe(balken.x + 3, balken.y + balken.h / 2, balken.x + 3 - SLOT, balken.y + balken.h / 2);
  pruefe("Beginn nach vorn: Mo 07:00", await warteDb("select to_char(beginn at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') b from public.einsatz where id = $1", [id], (r) => r[0]?.b === "2026-12-14T07:00"));
  balken = await rechteck(`[data-monteur-zeile='${anna.id}'] [data-einsatz='${id}']`);
  await ziehe(balken.x + balken.w - 3, balken.y + balken.h / 2, balken.x + balken.w - 3 - SLOT, balken.y + balken.h / 2);
  pruefe("Verkürzen: Ende Di 15:00", await warteDb("select to_char(ende at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') e from public.einsatz where id = $1", [id], (r) => r[0]?.e === "2026-12-15T15:00"));

  // 6. Senkrecht zu Ben ziehen: Monteur wird getauscht, Zeit bleibt
  balken = await rechteck(`[data-monteur-zeile='${anna.id}'] [data-einsatz='${id}']`);
  zeile = await rechteck(`[data-zeile='${ben.id}']`);
  await ziehe(balken.x + 40, balken.y + balken.h / 2, balken.x + 40, zeile.y + zeile.h / 2);
  pruefe("zu Ben verschoben: Team = Ben", await warteDb("select mitarbeiter_id from public.einsatz_monteur where einsatz_id = $1 and deleted_at is null", [id], (r) => r.length === 1 && r[0].mitarbeiter_id === ben.id));
  [z] = await einsatzZeit(id);
  pruefe("Zeit beim Monteurwechsel unverändert", z.b === "2026-12-14T07:00" && z.e === "2026-12-15T15:00");
  pruefe("Balken jetzt in Bens Zeile, nicht mehr bei Anna", await b.warte(`!!document.querySelector("[data-monteur-zeile='${ben.id}'] [data-einsatz='${id}']") && !document.querySelector("[data-monteur-zeile='${anna.id}'] [data-einsatz='${id}']")`));

  // 7. Waagerecht verschieben: einen Tag später (Di 07:00 – Mi 15:00)
  balken = await rechteck(`[data-monteur-zeile='${ben.id}'] [data-einsatz='${id}']`);
  await ziehe(balken.x + 40, balken.y + balken.h / 2, balken.x + 40 + 9 * SLOT, balken.y + balken.h / 2);
  pruefe("verschoben auf Di 07:00 – Mi 15:00", await warteDb("select to_char(beginn at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') b, to_char(ende at time zone 'Europe/Berlin', 'YYYY-MM-DD\"T\"HH24:MI') e from public.einsatz where id = $1", [id], (r) => r[0]?.b === "2026-12-15T07:00" && r[0]?.e === "2026-12-16T15:00"));

  // 8. Termin-Dialog: Anna dazu (Urlaub am Mittwoch) und fest einplanen → Warnung, blockiert nicht
  await b.klick(`[data-monteur-zeile='${ben.id}'] [data-einsatz='${id}']`);
  pruefe("Klick auf den Balken öffnet den Termin-Dialog mit Hinweis", await b.warte(`document.querySelector('[role=dialog]')?.querySelector('textarea')?.value === "Schlüssel beim Nachbarn"`));
  await b.klick(`[role=dialog] input[value='${anna.id}']`);
  await b.klickText("[role=dialog] label", "Fest einplanen und freigeben (sonst vorgeplant)");
  await b.klickText("[role=dialog] button", "Speichern");
  await b.warte("!document.querySelector('[role=dialog]')");
  pruefe("Warnung nennt Annas Urlaub", await b.warte(`[...document.querySelectorAll('[role=alert]')].some((x) => x.innerText.includes("Konflikt") && x.innerText.includes("Anna Plan ${lauf}: Urlaub"))`));
  [z] = await einsatzZeit(id);
  pruefe("trotz Konflikt gespeichert: fest, Team Anna und Ben", z.fest === true && (await team(id)).join() === [anna.id, ben.id].sort().join());
  pruefe("Balken in beiden Zeilen, bei Anna als Konflikt markiert", await b.warte(`!!document.querySelector("[data-monteur-zeile='${ben.id}'] [data-einsatz='${id}']") && document.querySelector("[data-monteur-zeile='${anna.id}'] [data-einsatz='${id}']")?.dataset.konflikt === "1"`));

  // 9. Überschneidung mit einem zweiten Einsatz
  const { data: zweiter } = await service.from("einsatz").insert({ auftrag_id: auftrag.id, beginn: "2026-12-15T11:00:00Z", ende: "2026-12-15T13:00:00Z", fest: true }).select("id").single();
  merken("einsatz", zweiter.id);
  const { data: zm } = await service.from("einsatz_monteur").insert({ einsatz_id: zweiter.id, mitarbeiter_id: ben.id }).select("id").single();
  merken("einsatz_monteur", zm.id);
  await b.gehe(`/montageplan?woche=${WOCHE}`);
  pruefe("Überschneidung: beide Balken markiert, Liste der Konflikte", await b.warte(`document.querySelector("[data-monteur-zeile='${ben.id}'] [data-einsatz='${zweiter.id}']")?.dataset.konflikt === "1" && document.querySelector("[data-monteur-zeile='${ben.id}'] [data-einsatz='${id}']")?.dataset.konflikt === "1" && document.querySelector('main details summary')?.innerText.includes("Konflikte")`));
  pruefe("überlappende Balken in eigenen Spuren", await b.js(`(() => { const a = document.querySelector("[data-monteur-zeile='${ben.id}'] [data-einsatz='${id}']").getBoundingClientRect(); const z = document.querySelector("[data-monteur-zeile='${ben.id}'] [data-einsatz='${zweiter.id}']").getBoundingClientRect(); return a.bottom <= z.top || z.bottom <= a.top; })()`));
  pruefe("beantragte Schulung schraffiert in Bens Zeile", await b.js(`!!document.querySelector("[data-monteur-zeile='${ben.id}'] [data-abwesenheit='beantragt']")`));
  if (fotos) await b.foto(path.join(fotos, "montageplan-konflikte.png"));

  // 10. Einsatz löschen mit Bestätigung (nur Markierung, samt Team)
  await b.klick(`[data-monteur-zeile='${ben.id}'] [data-einsatz='${zweiter.id}']`);
  await b.da("[role=dialog]");
  await b.klickText("[role=dialog] button", "Löschen");
  pruefe("Löschen fragt nach", await b.enthaelt("Einsatz löschen?"));
  await imLetztenDialog("Löschen");
  pruefe("Einsatz und Team nur als gelöscht markiert", await warteDb("select e.deleted_at e, m.deleted_at m from public.einsatz e join public.einsatz_monteur m on m.einsatz_id = e.id where e.id = $1", [zweiter.id], (r) => r.length > 0 && r.every((x) => x.e && x.m)));
  pruefe("Balken verschwunden", await b.warte(`!document.querySelector("[data-einsatz='${zweiter.id}']")`));

  // 11. Vom Auftrag aus: „Weiterer Einsatz“ öffnet den Dialog mit Auftrag vorbelegt; Abbrechen entfernt den Parameter
  await b.gehe(`/auftraege/${auftrag.id}`);
  pruefe("Auftrag zeigt den Einsatz mit Team", await b.warte(`document.querySelector('main').innerText.includes("Anna Plan ${lauf}, Ben Plan ${lauf}") || document.querySelector('main').innerText.includes("Ben Plan ${lauf}, Anna Plan ${lauf}")`));
  await b.klickText("main a", "Weiterer Einsatz");
  pruefe("Dialog mit Auftrag vorbelegt", await b.warte(`location.pathname === '/montageplan' && document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(auftrag.nummer)})`));
  await b.klickText("[role=dialog] button", "Abbrechen");
  pruefe("Abbrechen schließt, Parameter entfernt", await b.warte("!document.querySelector('[role=dialog]') && !location.search.includes('auftrag=')"));

  // 12. Woche vor und zurück
  await b.gehe(`/montageplan?woche=${WOCHE}`);
  await b.klick("a[aria-label='Nächste Woche']");
  pruefe("Nächste Woche: KW 52", await b.warte(`location.search.includes("woche=2026-12-21") && document.querySelector('main').innerText.includes("KW 52")`));
  await b.klick("a[aria-label='Vorige Woche']");
  await b.warte(`location.search.includes("woche=${WOCHE}")`);

  // 13. Arbeitszeit in den Einstellungen ändert das Raster
  await b.gehe("/einstellungen/montageplan");
  // Erst wenn React die Seite übernommen hat, schaltet die Änderung „Speichern“ frei; bis dahin wiederholen
  let frei = false;
  for (let i = 0; i < 20 && !frei; i++) {
    await b.js(`(() => { const s = ${sichtbar("select[name=bis]")}; if (s) { s.value = "17"; s.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
    await sleep(250);
    frei = await b.js(`[...document.querySelectorAll("main button")].some((x) => x.textContent.trim() === "Speichern" && !x.disabled && x.getClientRects().length)`);
  }
  await b.klickText("main button", "Speichern");
  pruefe("Arbeitszeit bis 17 Uhr gespeichert", await warteDb("select arbeitszeit_bis::text bis from public.einstellung", [], (r) => r[0]?.bis === "17:00:00"));
  await b.gehe(`/montageplan?woche=${WOCHE}`);
  pruefe("Tafel zeigt 7 bis 17 Uhr (10 Stunden je Tag)", await b.warte(`document.querySelector('main').innerText.includes("Arbeitszeit 7 bis 17 Uhr") && document.querySelector('[data-zeile]').getBoundingClientRect().width === ${5 * 10 * SLOT}`));
  if (fotos) await b.foto(path.join(fotos, "montageplan.png"));

  // 14. Monteur deaktivieren
  // Zeilenaktionen sind erst beim Überfahren bzw. mit Fokus klickbar (focus-within): Fokus setzen wie mit der Tastatur
  await b.js(`(() => { const k = ${sichtbar(`button[aria-label='Ben Plan ${lauf} deaktivieren']`)}; k.setAttribute('data-x', 'weg'); k.focus(); })()`);
  await b.klick("[data-x='weg']");
  await imLetztenDialog("Deaktivieren");
  pruefe("Ben deaktiviert und aus der Tafel", await warteDb("select aktiv from public.mitarbeiter where id = $1", [ben.id], (r) => r[0]?.aktiv === false) && (await b.warte(`!document.querySelector("[data-zeile='${ben.id}']")`)));

} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  if (auftragId) {
    // Monteur-Zuordnungen der Einsätze (auch markierte) vor den Einsätzen entfernen
    const em = await dbAbfrage("select m.id from public.einsatz_monteur m join public.einsatz e on e.id = m.einsatz_id where e.auftrag_id = $1", [auftragId]).catch(() => []);
    em.forEach((x) => merken("einsatz_monteur", x.id));
  }
  if (arbeitszeitVorher) await dbAbfrage("update public.einstellung set arbeitszeit_von = $1, arbeitszeit_bis = $2", [arbeitszeitVorher.von, arbeitszeitVorher.bis]).catch(() => {});
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
