// End-to-End-Test Modul Mitarbeiter mit einem vorübergehenden Test-Admin.
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:mitarbeiter
// Optional FOTOS=<Ordner> für Bildschirmfotos.
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const kz = (p) => p + lauf.replace(/[^a-f]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
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
const idAusPfad = () => b.js("location.pathname.split('/').pop()");

try {
  const admin = await testAdmin();
  b = await browser();
  await b.anmelden(admin);
  await b.warte("location.pathname === '/kunden'");

  // 1. Monteur anlegen mit eigenem Urlaubsanspruch → Detailseite
  await b.gehe("/mitarbeiter");
  pruefe("Navigation zeigt Mitarbeiter", await b.js("[...document.querySelectorAll('aside a[href]')].some((a) => a.getAttribute('href') === '/mitarbeiter')"));
  await b.klickText("main button", "Mitarbeiter anlegen");
  await b.tippe("[role=dialog] [name=name]", `Max Monteur ${lauf}`);
  await b.tippe("[role=dialog] [name=kuerzel]", kz("M"));
  await b.tippe("[role=dialog] [name=rolle]", "Monteur");
  await b.tippe("[role=dialog] [name=telefon]", "0171 2345678");
  await b.tippe("[role=dialog] [name=urlaubsanspruch_tage]", "25");
  await b.klickText("[role=dialog] button", "Mitarbeiter anlegen");
  await b.warte("/^\\/mitarbeiter\\/[0-9a-f-]{36}$/.test(location.pathname)");
  const max = await idAusPfad();
  merken("mitarbeiter", max);
  const [r1] = await dbAbfrage("select kuerzel, rolle, telefon, ist_monteur, urlaubsanspruch_tage from public.mitarbeiter where id = $1", [max]);
  pruefe("gespeichert: Kürzel groß, Monteur, 25 Tage", r1?.kuerzel === kz("M") && r1?.ist_monteur === true && r1?.urlaubsanspruch_tage === 25 && r1?.telefon === "0171 2345678");
  pruefe("Detailseite: Name, Monteur, Anspruch 25", await b.warte(`document.querySelector('main h1')?.textContent.includes("Max Monteur ${lauf}") && document.querySelector('main').innerText.includes("25 Tage")`));

  // 2. Bürokraft ohne Monteur-Kennzeichen; doppeltes Kürzel wird abgelehnt
  await b.gehe("/mitarbeiter");
  await b.klickText("main button", "Mitarbeiter anlegen");
  await b.tippe("[role=dialog] [name=name]", `Bea Büro ${lauf}`);
  await b.tippe("[role=dialog] [name=kuerzel]", kz("M"));
  await b.klick("[role=dialog] [name=ist_monteur]");
  await b.klickText("[role=dialog] button", "Mitarbeiter anlegen");
  pruefe("doppeltes Kürzel abgelehnt", await b.warte(`document.querySelector('[role=dialog]')?.innerText.includes("schon vergeben")`));
  await b.tippe("[role=dialog] [name=kuerzel]", kz("B"));
  await b.klickText("[role=dialog] button", "Mitarbeiter anlegen");
  await b.warte("/^\\/mitarbeiter\\/[0-9a-f-]{36}$/.test(location.pathname)");
  const bea = await idAusPfad();
  merken("mitarbeiter", bea);
  pruefe("Bürokraft ohne Monteur-Kennzeichen", (await dbAbfrage("select ist_monteur from public.mitarbeiter where id = $1", [bea]))[0]?.ist_monteur === false);

  // 3. Plantafel: nur der Monteur hat eine Zeile
  await b.gehe("/montageplan");
  pruefe("Monteur als Zeile in der Plantafel, Bürokraft nicht", (await b.da(`[data-zeile='${max}']`)) && !(await b.js(`!!document.querySelector("[data-zeile='${bea}']")`)));

  // 4. Abwesenheiten: heute krank, Urlaub im Dezember (5 Arbeitstage, genehmigt)
  await dbAbfrage("insert into public.abwesenheit (mitarbeiter_id, art, von, bis, status) values ($1, 'krank', $2, $2, 'genehmigt'), ($1, 'urlaub', '2026-12-14', '2026-12-18', 'genehmigt')", [max, heute]);
  (await dbAbfrage("select id from public.abwesenheit where mitarbeiter_id = $1", [max])).forEach((x) => merken("abwesenheit", x.id));
  await b.gehe(`/mitarbeiter?q=${lauf}`);
  pruefe("Liste: beide, Max heute krank", await b.warte(`(() => { const t = document.querySelector('main table')?.innerText ?? ""; return t.includes("Max Monteur ${lauf}") && t.includes("Bea Büro ${lauf}") && t.includes("Krank"); })()`));
  await b.gehe(`/mitarbeiter?q=${lauf}&monteure=1`);
  pruefe("Filter Monteure blendet die Bürokraft aus", await b.warte(`!document.querySelector('main table')?.innerText.includes("Bea Büro ${lauf}") && document.querySelector('main table')?.innerText.includes("Max Monteur ${lauf}")`));
  if (fotos) await b.foto(path.join(fotos, "mitarbeiter-liste.png"));
  await b.gehe(`/mitarbeiter/${max}`);
  pruefe("Detail: Abwesenheiten und Urlaubskonto (5 genehmigt, Rest 20)", await b.warte(`(() => { const t = document.querySelector('main').innerText; return t.includes("14.12.2026 – 18.12.2026") && t.includes("5 Arbeitstage") && /Rest\\s*20 Tage/.test(t); })()`));
  if (fotos) await b.foto(path.join(fotos, "mitarbeiter-detail.png"));

  // 5. Bearbeiten
  await b.klickText("main button", "Bearbeiten");
  await b.tippe("[role=dialog] [name=rolle]", "Vorarbeiter");
  await b.klickText("[role=dialog] button", "Speichern");
  await b.warte("!document.querySelector('[role=dialog]')");
  pruefe("Rolle geändert", await warteDb("select rolle from public.mitarbeiter where id = $1", [max], (r) => r[0]?.rolle === "Vorarbeiter"));

  // 6. Mit Geschichte: Löschen abgelehnt, Deaktivieren und wieder Aktivieren
  await b.klickText("main button", "Löschen");
  await imLetztenDialog("Löschen");
  pruefe("Löschen mit Abwesenheiten abgelehnt, Hinweis auf Deaktivieren", await b.warte(`document.body.innerText.includes("nur deaktiviert werden")`));
  await b.gehe(`/mitarbeiter/${max}`);
  await b.klickText("main button", "Deaktivieren");
  await imLetztenDialog("Deaktivieren");
  pruefe("deaktiviert", await warteDb("select aktiv from public.mitarbeiter where id = $1", [max], (r) => r[0]?.aktiv === false));
  await b.gehe(`/mitarbeiter?q=${lauf}`);
  pruefe("inaktiv nicht in der Liste", await b.warte(`!document.querySelector('main')?.innerText.includes("Max Monteur ${lauf}")`));
  await b.gehe(`/mitarbeiter?q=${lauf}&inaktive=1`);
  pruefe("mit „Inaktive zeigen“ sichtbar", await b.warte(`document.querySelector('main table')?.innerText.includes("Max Monteur ${lauf}") && document.querySelector('main table').innerText.includes("Inaktiv")`));
  await b.gehe("/montageplan");
  pruefe("inaktiver Monteur nicht in der Plantafel", await b.warte(`!!document.querySelector('[data-tafel]') && !document.querySelector("[data-zeile='${max}']")`));
  await b.gehe(`/mitarbeiter/${max}`);
  await b.klickText("main button", "Aktivieren");
  pruefe("wieder aktiv", await warteDb("select aktiv from public.mitarbeiter where id = $1", [max], (r) => r[0]?.aktiv === true));

  // 7. Ohne Geschichte: Löschen nur als Markierung
  await b.gehe(`/mitarbeiter/${bea}`);
  await b.klickText("main button", "Löschen");
  pruefe("Löschen fragt nach", await b.enthaelt("Mitarbeiter löschen?"));
  await imLetztenDialog("Löschen");
  await b.warte("location.pathname === '/mitarbeiter'");
  pruefe("nur als gelöscht markiert", await warteDb("select deleted_at from public.mitarbeiter where id = $1", [bea], (r) => !!r[0]?.deleted_at));
  pruefe("nicht mehr in der Liste", await b.warte(`!document.querySelector('main')?.innerText.includes("Bea Büro ${lauf}")`));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
