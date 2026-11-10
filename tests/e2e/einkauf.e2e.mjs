// End-to-End-Test Einkauf: Lieferanten (Ansprechpartner, Konditionen), Bestellungen über mehrere Aufträge,
// „Noch nicht bestellt“, Lieferung je Zeile, „Ware eingetroffen“ am Auftrag, Löschen nur als Markierung.
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:einkauf
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

let b;
async function warteDb(sql, werte, pruef) {
  for (let i = 0; i < 40; i++) {
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
/** Wert in einem nativen <select> setzen (uncontrolled, FormData liest den DOM-Wert) */
const waehleNativ = (sel, wert) => b.js(`(() => { const s = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getClientRects().length).at(-1); s.value = ${JSON.stringify(wert)}; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
const berlinHeute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
function kw(d) {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
const KW = Math.min(kw(berlinHeute) + 2, 52);
const LIEFERANT = `Fensterbau ${lauf}`;

try {
  const admin = await testAdmin();
  const { data: kunde } = await service.from("kunde").insert({ name: `Einkaufskunde ${lauf}`, strasse: "Am Markt 2", plz: "29221", ort: "Celle" }).select("id, name").single();
  merken("kunde", kunde.id);
  const { data: a1 } = await service.from("auftrag").insert({ nummer: `EA${lauf}`, kunde_id: kunde.id, titel: "Haustür und Rollladen", phase: "bestellung", noch_nicht_bestellt: "Haustür RC2, Rollladen links" }).select("id, nummer").single();
  merken("auftrag", a1.id);
  const { data: a2 } = await service.from("auftrag").insert({ nummer: `EB${lauf}`, kunde_id: kunde.id, titel: "Fensterbänke", phase: "bestellung" }).select("id, nummer").single();
  merken("auftrag", a2.id);

  b = await browser();
  await b.anmelden(admin);
  await b.warte("!location.pathname.startsWith('/anmelden')");

  // 1. Lieferant anlegen mit zwei Ansprechpartnern
  await b.gehe("/lieferanten");
  pruefe("Seitenleiste: Lieferanten und Bestellungen anklickbar", await b.js("['/lieferanten', '/bestellungen'].every((h) => [...document.querySelectorAll('aside a[href]')].some((a) => a.getAttribute('href') === h))"));
  await b.klickText("main button", "Lieferant");
  await b.tippe("[role=dialog] [name=name]", LIEFERANT);
  await b.tippe("[role=dialog] [name=produktgruppen]", "Fenster, Haustür");
  await b.tippe("[role=dialog] [name=unsere_kundennummer]", "K-4711");
  await b.tippe("[role=dialog] [name=lieferzeit]", "4–6 Wochen");
  await b.tippe("[role=dialog] [data-kontakt-zeile='0'] [name=k_name]", "Anna Außendienst");
  await b.tippe("[role=dialog] [data-kontakt-zeile='0'] [name=k_handy]", "0171 1234567");
  await b.klickText("[role=dialog] button", "Ansprechpartner");
  await b.tippe("[role=dialog] [data-kontakt-zeile='1'] [name=k_name]", "Bert Innendienst");
  await b.klickText("[role=dialog] button", "Lieferant anlegen");
  await b.warte("/^\\/lieferanten\\/[0-9a-f-]{36}$/.test(location.pathname)");
  const lid = await b.js("location.pathname.split('/').pop()");
  merken("lieferant", lid);
  const [l] = await dbAbfrage("select produktgruppen, unsere_kundennummer, (select array_agg(name order by reihenfolge) from public.lieferant_kontakt where lieferant_id = l.id and deleted_at is null) kontakte from public.lieferant l where id = $1", [lid]);
  pruefe("Lieferant mit Produktgruppen, Kundennummer und zwei Ansprechpartnern", l?.unsere_kundennummer === "K-4711" && l?.produktgruppen?.join() === "Fenster,Haustür" && l?.kontakte?.join() === "Anna Außendienst,Bert Innendienst", JSON.stringify(l));

  // 2. Konditionen (Admin hat das Recht „Konditionen sehen“)
  await b.tippe("main textarea[aria-label=Konditionen]", "12 % Händlerrabatt, 3 % Skonto");
  await b.klickText("main button", "Speichern");
  pruefe("Konditionen gespeichert", await warteDb("select text from public.lieferant_kondition where lieferant_id = $1 and deleted_at is null", [lid], (r) => r[0]?.text === "12 % Händlerrabatt, 3 % Skonto"));
  await b.gehe("/lieferanten");
  pruefe("Lieferantenkarte zeigt Ansprechpartner und Konditionen", await b.warte(`(() => { const k = document.querySelector('[data-lieferant="${lid}"]'); return k && k.innerText.includes('Anna Außendienst') && k.querySelector('[data-kondition]')?.innerText.includes('12 % Händlerrabatt'); })()`));

  // 3. Ansprechpartner entfernen: nur als gelöscht markiert
  await b.gehe(`/lieferanten/${lid}`);
  await b.klickText("main button", "Bearbeiten");
  await b.da("[role=dialog] [data-kontakt-zeile='1']");
  await b.klick("[role=dialog] [data-kontakt-zeile='1'] button[aria-label='Ansprechpartner entfernen']");
  await b.klickText("[role=dialog] button", "Speichern");
  pruefe("entfernter Ansprechpartner nur markiert", await warteDb("select name, deleted_at from public.lieferant_kontakt where lieferant_id = $1 order by reihenfolge", [lid], (r) => r.length === 2 && !r[0].deleted_at && !!r.find((x) => x.name === "Bert Innendienst")?.deleted_at));

  // 4. Bestellung vom Auftrag aus: vorbelegt aus „Noch nicht bestellt“, zweite Zeile für einen anderen Auftrag
  await b.gehe(`/auftraege/${a1.id}`);
  pruefe("Auftrag ohne Bestellung: Bestellstatus Offen", await b.warte("document.querySelector('[data-bestellstatus]')?.dataset.bestellstatus === 'offen'"));
  await b.klick("main button[data-neue-bestellung]");
  await b.da("[role=dialog] [data-zeile='1']");
  const vorbelegt = await b.js(`[...document.querySelectorAll('[role=dialog] [data-zeile]')].map((z) => z.querySelector('[name=z_auftrag]').value + '|' + z.querySelector('[name=z_text]').value).join(';')`);
  pruefe("Positionen aus „Noch nicht bestellt“ vorbelegt", vorbelegt === `${a1.id}|Haustür RC2;${a1.id}|Rollladen links`, vorbelegt);
  await waehleNativ("[role=dialog] [name=lieferant_id]", lid);
  await b.tippe("[role=dialog] [name=liefer_kw]", String(KW));
  await b.tippe("[role=dialog] [name=lieferanten_ab_nummer]", "AB-99");
  await b.klickText("[role=dialog] button", "Weitere Zeile, auch für einen anderen Auftrag");
  await b.da("[role=dialog] [data-zeile='2']");
  await waehleNativ("[role=dialog] [data-zeile='2'] [name=z_auftrag]", a2.id);
  await b.tippe("[role=dialog] [data-zeile='2'] [name=z_text]", "Fensterbank innen");
  await b.tippe("[role=dialog] [data-zeile='2'] [name=z_menge]", "3");
  await b.klickText("[role=dialog] button", "Bestellung anlegen");
  await b.warte("/^\\/bestellungen\\/[0-9a-f-]{36}$/.test(location.pathname)");
  const bid = await b.js("location.pathname.split('/').pop()");
  merken("bestellung", bid);
  const zeilen = await dbAbfrage("select id, auftrag_id, artikeltext, menge::float m, geliefert from public.bestellzeile where bestellung_id = $1 order by reihenfolge", [bid]);
  zeilen.forEach((z) => merken("bestellzeile", z.id));
  const [best] = await dbAbfrage("select nummer, liefer_kw, lieferanten_ab_nummer, status from public.bestellung where id = $1", [bid]);
  pruefe("Bestellung BE-JJ-NNN mit drei Zeilen über zwei Aufträge", /^BE-\d{2}-\d{3}$/.test(best?.nummer ?? "") && best?.liefer_kw === KW && best?.lieferanten_ab_nummer === "AB-99" && zeilen.length === 3 && zeilen[2].auftrag_id === a2.id && zeilen[2].m === 3, JSON.stringify({ best, zeilen }));
  const [nn] = await dbAbfrage("select noch_nicht_bestellt from public.auftrag where id = $1", [a1.id]);
  pruefe("„Noch nicht bestellt“ des Auftrags geleert", nn?.noch_nicht_bestellt === null, JSON.stringify(nn));
  pruefe("Bestellseite: Status Bestellt, Positionen", await b.warte(`document.querySelector('[data-bestellstatus]')?.dataset.bestellstatus === 'bestellt' && document.querySelectorAll('[data-bestellzeile]').length === 3`));

  // 5. Auftragsliste und Auftragsseite zeigen den Bestellstatus
  await b.gehe("/auftraege");
  pruefe("Auftragsliste: Bestellstatus „Bestellt“ unter der Phase", await b.warte(`[...document.querySelectorAll('tr')].find((t) => t.innerText.includes(${JSON.stringify(a1.nummer)}))?.querySelector('[data-bestellstatus]')?.dataset.bestellstatus === 'bestellt'`));
  await b.gehe(`/auftraege/${a1.id}`);
  pruefe("Auftragsseite: Bestellzeilen und Liefer-KW", await b.warte(`document.querySelectorAll('[data-bestellzeile]').length === 2 && document.querySelector('[data-liefer-kw]')?.innerText.includes('KW ${KW}/')`));

  // 6. Lieferung: eine Zeile, dann „Alles geliefert“
  await b.gehe(`/bestellungen/${bid}`);
  await b.klick(`input[data-geliefert="${zeilen[2].id}"]`);
  pruefe("Zeile geliefert gespeichert", await warteDb("select geliefert from public.bestellzeile where id = $1", [zeilen[2].id], (r) => r[0]?.geliefert === true));
  pruefe("Status Teilweise geliefert, Löschen gesperrt", await b.warte(`document.querySelector('[data-bestellstatus]')?.dataset.bestellstatus === 'teilweise_geliefert' && ![...document.querySelectorAll('main button')].some((x) => x.textContent.trim() === 'Löschen')`));
  await b.gehe(`/auftraege/${a1.id}`);
  pruefe("Auftrag ohne gelieferte eigene Zeile bleibt „Bestellt“", await b.warte("document.querySelector('[data-bestellstatus]')?.dataset.bestellstatus === 'bestellt' && !document.querySelector('[data-ware-eingetroffen]')"));
  await b.gehe(`/bestellungen/${bid}`);
  await b.klickText("main button", "Alles geliefert");
  pruefe("alle Zeilen geliefert", await warteDb("select bool_and(geliefert) g from public.bestellzeile where bestellung_id = $1", [bid], (r) => r[0]?.g === true));
  pruefe("Status Geliefert", await b.warte("document.querySelector('[data-bestellstatus]')?.dataset.bestellstatus === 'geliefert'"));

  // 7. „Ware eingetroffen“: Hinweis am Auftrag, Phase nur von Hand
  await b.gehe(`/auftraege/${a1.id}`);
  pruefe("Hinweis „Ware vollständig eingetroffen“, Phase noch Bestellung", await b.warte("!!document.querySelector('[data-ware-eingetroffen]') && document.querySelector('[data-bestellstatus]')?.innerText.includes('Ware eingetroffen')"));
  const [p0] = await dbAbfrage("select phase from public.auftrag where id = $1", [a1.id]);
  pruefe("kein automatischer Phasenwechsel", p0?.phase === "bestellung", p0?.phase);
  await b.klickText("main button", "Phase auf Montage setzen");
  pruefe("Phase von Hand auf Montage gesetzt", await warteDb("select phase from public.auftrag where id = $1", [a1.id], (r) => r[0]?.phase === "montage"));
  pruefe("Hinweis verschwindet", await b.warte("!document.querySelector('[data-ware-eingetroffen]')"));

  // 8. Bestellübersicht: Filter und „Noch nicht bestellt“
  await service.from("auftrag").update({ noch_nicht_bestellt: "Insektenschutz" }).eq("id", a2.id);
  await b.gehe("/bestellungen");
  pruefe("„Noch nicht bestellt“ listet den Auftrag", await b.warte(`document.querySelector('[data-noch-nicht-bestellt]')?.innerText.includes(${JSON.stringify(a2.nummer)})`));
  pruefe("Filter Offen ohne die gelieferte Bestellung", await b.warte(`!document.querySelector('main table')?.innerText.includes(${JSON.stringify(best.nummer)})`));
  await b.gehe("/bestellungen?ansicht=geliefert");
  pruefe("Filter Geliefert mit der Bestellung", await b.warte(`!!document.querySelector('main table')?.innerText.includes(${JSON.stringify(best.nummer)})`));

  // 9. Zweite Bestellung über die Lieferantenseite; Lieferant mit offener Bestellung nicht löschbar
  await b.gehe(`/lieferanten/${lid}`);
  await b.klickText("main button", "Neue Bestellung");
  await b.da("[role=dialog] [data-zeile='0']");
  pruefe("Lieferant im Dialog vorbelegt", (await b.js("document.querySelector('[role=dialog] [name=lieferant_id]').value")) === lid);
  await waehleNativ("[role=dialog] [data-zeile='0'] [name=z_auftrag]", a2.id);
  await b.tippe("[role=dialog] [data-zeile='0'] [name=z_text]", "Insektenschutz");
  await b.klickText("[role=dialog] button", "Bestellung anlegen");
  await b.warte(`/^\\/bestellungen\\/[0-9a-f-]{36}$/.test(location.pathname) && location.pathname !== '/bestellungen/${bid}'`);
  const bid2 = await b.js("location.pathname.split('/').pop()");
  merken("bestellung", bid2);
  (await dbAbfrage("select id from public.bestellzeile where bestellung_id = $1", [bid2])).forEach((z) => merken("bestellzeile", z.id));
  await b.gehe(`/lieferanten/${lid}`);
  await b.klickText("main button", "Löschen");
  await imLetztenDialog("Löschen");
  pruefe("Lieferant mit offener Bestellung: Löschen abgelehnt", await b.warte("!!document.querySelector('main [role=alert]')"));
  pruefe("Seitenleiste zählt offene Bestellungen", await b.js(`Number(document.querySelector("aside [data-zaehler='bestellungen']")?.textContent) >= 1`));

  // 10. Ungelieferte Bestellung löschen (nur Markierung), danach Lieferant löschen
  await b.gehe(`/bestellungen/${bid2}`);
  await b.klickText("main button", "Löschen");
  await imLetztenDialog("Löschen");
  await b.warte("location.pathname === '/bestellungen'");
  pruefe("Bestellung samt Zeilen nur als gelöscht markiert", await warteDb("select b.deleted_at b, bool_and(z.deleted_at is not null) z from public.bestellung b join public.bestellzeile z on z.bestellung_id = b.id where b.id = $1 group by b.deleted_at", [bid2], (r) => !!r[0]?.b && r[0]?.z === true));
  await b.gehe(`/lieferanten/${lid}`);
  await b.klickText("main button", "Löschen");
  await imLetztenDialog("Löschen");
  await b.warte("location.pathname === '/lieferanten'");
  pruefe("Lieferant samt Ansprechpartnern und Konditionen nur markiert", await warteDb("select l.deleted_at l, (select bool_and(deleted_at is not null) from public.lieferant_kontakt where lieferant_id = l.id) k, (select bool_and(deleted_at is not null) from public.lieferant_kondition where lieferant_id = l.id) c from public.lieferant l where id = $1", [lid], (r) => !!r[0]?.l && r[0]?.k === true && r[0]?.c === true));
  pruefe("Lieferant aus der Liste verschwunden", await b.warte(`!document.querySelector('[data-lieferant="${lid}"]')`));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  // Vom Browser angelegte Zeilen nachtragen (Reihenfolge: Kinder vor Eltern beim Löschen)
  const kontakte = await dbAbfrage("select k.id from public.lieferant_kontakt k join public.lieferant l on l.id = k.lieferant_id where l.name = $1", [LIEFERANT]).catch(() => []);
  const kond = await dbAbfrage("select k.id from public.lieferant_kondition k join public.lieferant l on l.id = k.lieferant_id where l.name = $1", [LIEFERANT]).catch(() => []);
  kontakte.forEach((x) => merken("lieferant_kontakt", x.id));
  kond.forEach((x) => merken("lieferant_kondition", x.id));
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
