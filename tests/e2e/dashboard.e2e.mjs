// End-to-End-Test Dashboard: Startseite nach der Anmeldung, drei Ansichten (Geschäftsführung, Montage, Einkauf) mit
// echten Daten aus den Modulen, Belege-Kennzahlen aus den Belegen (Auftragsbestand, Forderungen, Angebotsquote,
// Auftragswert je Monat), Ansicht je Benutzer gemerkt.
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:dashboard
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

let b;
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const plus = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** Berlin-Ortszeit → UTC (Winter- und Sommerzeit) */
function utc(tag, uhr) {
  const probe = new Date(`${tag}T${uhr}:00Z`);
  const berlin = new Date(probe.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const versatz = berlin.getTime() - new Date(probe.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(probe.getTime() - versatz).toISOString();
}
// Der vorgeplante Einsatz läuft bis 23:30, damit er zu jeder Tageszeit noch „zur Freigabe“ steht (vergangene zählen nicht).
const kunde = `Dashkunde ${lauf}`;
const main = () => b.js("document.querySelector('main').innerText");

try {
  const admin = await testAdmin();
  const { data: k } = await service.from("kunde").insert({ name: kunde }).select("id").single();
  merken("kunde", k.id);
  const { data: q } = await service.from("anfrage").insert({ titel: `Dashanfrage ${lauf}`, kunde_id: k.id, herkunft: "Website", wiedervorlage: heute }).select("id").single();
  merken("anfrage", q.id);
  const { data: a } = await service.from("auftrag").insert({ nummer: `DA${lauf}`, kunde_id: k.id, titel: "Haustür", phase: "montage", noch_nicht_bestellt: "Haustür RC2" }).select("id, nummer").single();
  merken("auftrag", a.id);
  const kz = "D" + lauf.replace(/[^a-f]/g, "").toUpperCase().padEnd(3, "X").slice(0, 3);
  const { data: m } = await service.from("mitarbeiter").insert({ kuerzel: kz, name: `Dora Dash ${lauf}`, ist_monteur: true }).select("id").single();
  merken("mitarbeiter", m.id);
  const { data: e } = await service.from("einsatz").insert({ auftrag_id: a.id, beginn: utc(heute, "07:00"), ende: utc(heute, "23:30"), fest: false }).select("id").single();
  merken("einsatz", e.id);
  const { data: em } = await service.from("einsatz_monteur").insert({ einsatz_id: e.id, mitarbeiter_id: m.id }).select("id").single();
  merken("einsatz_monteur", em.id);
  const { data: abw } = await service.from("abwesenheit").insert({ mitarbeiter_id: m.id, art: "urlaub", von: plus(heute, 3), bis: plus(heute, 4) }).select("id").single();
  merken("abwesenheit", abw.id);
  const { data: t } = await service.from("service_ticket").insert({ kunde_id: k.id, thema: `Dashticket ${lauf}` }).select("id, nummer").single();
  merken("service_ticket", t.id);
  const { data: auf } = await service.from("aufgabe").insert({ titel: `Dashaufgabe ${lauf}`, faellig: plus(heute, -1), zustaendig_id: admin.id }).select("id").single();
  merken("aufgabe", auf.id);
  const { data: l } = await service.from("lieferant").insert({ name: `Dashlieferant ${lauf}` }).select("id").single();
  merken("lieferant", l.id);
  const { data: best } = await service.from("bestellung").insert({ lieferant_id: l.id, liefer_kw: 1, liefer_jahr: 2026 }).select("id, nummer").single();
  merken("bestellung", best.id);
  const { data: z } = await service.from("bestellzeile").insert({ bestellung_id: best.id, auftrag_id: a.id, artikeltext: "Seitenteil" }).select("id").single();
  merken("bestellzeile", z.id);

  b = await browser();
  await b.anmelden(admin);
  pruefe("Anmeldung führt zum Dashboard", await b.warte("location.pathname === '/'"), await b.pfad());
  pruefe("Seitenleiste: Dashboard aktiv, nicht mehr „folgt“", await b.warte("[...document.querySelectorAll('aside a[aria-current=page]')].some((x) => x.textContent.trim().startsWith('Dashboard'))"));

  // 1. Geschäftsführung (Standard-Start-Ansicht)
  pruefe("Ansicht Geschäftsführung gewählt", await b.warte("document.querySelector('[role=tab][aria-selected=true]')?.textContent === 'Geschäftsführung'"));
  const gf = await main();
  pruefe("Begrüßung mit Vorname und Datum", /Guten (Morgen|Tag|Abend), E2E/.test(gf), gf.slice(0, 120));
  pruefe("Belege-Kennzahlen aus den Belegen (keine Platzhalter mehr)", await b.warte("!document.querySelector('[data-platzhalter]') && !!document.querySelector('[data-angebotsquote]') && document.body.innerText.includes('Offene Forderungen') && document.body.innerText.includes('Auftragsbestand, noch nicht berechnet')"));
  pruefe("Offene Anfragen mit Wochenbalken", await b.js("(() => { const a = [...document.querySelectorAll('main a[href=\"/anfragen\"]')].find((x) => x.innerText.includes('Offene Anfragen')); return !!a && Number(a.querySelector('.tabular').textContent) >= 1 && a.querySelectorAll('[role=img] i').length === 6; })()"));
  pruefe("Anfragen online: Anteil und Herkunft", await b.js("!!document.querySelector('[data-online-anteil]') && [...document.querySelectorAll('[data-balken] li')].some((x) => x.title.startsWith('Website'))"));
  pruefe("Heute: Einsatz in der Zeitachse (vorgeplant, mit Monteur)", await b.js(`[...document.querySelectorAll('[data-termin=montage]')].some((x) => x.innerText.includes(${JSON.stringify(kunde)}) && x.innerText.includes('vorgeplant') && x.innerText.includes('Dora'))`));
  const hinweise = await b.js("document.querySelector('[data-aufmerksamkeit]').innerText");
  pruefe(
    "Braucht Aufmerksamkeit: Genehmigung, Vorplanung, Aufgabe, Ticket, Bestellung, Wiedervorlage",
    ["zur Genehmigung", "vorgeplant", "fällig", "Service-Ticket", "überfällig", "Wiedervorlage"].every((x) => hinweise.includes(x)) && hinweise.includes(`Dashaufgabe ${lauf}`) && hinweise.includes(t.nummer) && hinweise.includes(best.nummer),
    hinweise.replace(/\s+/g, " ").slice(0, 400),
  );
  pruefe("Aufträge je Status mit Phase Montage", await b.js("(() => { const z = [...document.querySelectorAll('[data-phasen] li')].find((x) => x.title.startsWith('Montage:')); return !!z && Number(z.title.split(': ')[1]) >= 1; })()"));
  pruefe("Abwesenheiten: Antrag wartet", gf.includes("auf Genehmigung"));

  // 2. Montage: Umschalten wird je Benutzer gemerkt
  await b.klickText("[role=tab]", "Montage");
  pruefe("Ansicht Montage", await b.warte("document.querySelector('h1')?.textContent === 'Dashboard · Montage'"));
  pruefe("Wahl gespeichert", await (async () => { for (let i = 0; i < 30; i++) { const [r] = await dbAbfrage("select ansichten->>'dashboard' v from public.benutzer_einstellung where benutzer_id = $1", [admin.id]); if (r?.v === "montage") return true; await sleep(200); } return false; })());
  (await dbAbfrage("select id from public.benutzer_einstellung where benutzer_id = $1", [admin.id])).forEach((x) => merken("benutzer_einstellung", x.id));
  pruefe("Zur Freigabe: vorgeplanter Einsatz", await b.js(`document.querySelector('[data-zur-freigabe]')?.innerText.includes(${JSON.stringify(a.nummer)})`));
  pruefe("Ware für anstehende Montagen: Auftrag ohne Ware", await b.js(`document.querySelector('[data-ware]')?.innerText.includes(${JSON.stringify(a.nummer)})`));
  pruefe("Abwesend nächste 2 Wochen", (await main()).includes("Dora · Urlaub"));
  await b.gehe("/");
  pruefe("nach dem Neuladen weiter Montage", await b.warte("document.querySelector('h1')?.textContent === 'Dashboard · Montage'"));

  // 3. Einkauf
  await b.klickText("[role=tab]", "Einkauf");
  pruefe("Ansicht Einkauf", await b.warte("document.querySelector('h1')?.textContent === 'Dashboard · Einkauf'"));
  pruefe("Erwartete Lieferungen mit der Bestellung", await b.js(`!!document.querySelector('[data-erwartet="${best.id}"]')`));
  pruefe("Liefertermin überschritten rot", await b.js("(() => { const k = [...document.querySelectorAll('main a')].find((x) => x.innerText.includes('Liefertermin überschritten')); return !!k && Number(k.querySelector('.tabular').textContent) >= 1 && k.querySelector('.tabular').className.includes('text-tone-red-fg'); })()"));
  pruefe("AB vom Lieferanten fehlt", await b.js(`document.querySelector('[data-ohne-ab]')?.innerText.includes(${JSON.stringify(best.nummer)})`));
  pruefe("Noch nicht bestellt mit Bestellen-Knopf", (await main()).includes("Haustür RC2"));

  // 4. Ohne gemerkte Wahl gilt die Start-Ansicht aus Einstellungen › Benutzer
  await service.from("benutzer_einstellung").update({ ansichten: {} }).eq("benutzer_id", admin.id);
  await service.from("benutzer").update({ dashboard_start: "montage" }).eq("id", admin.id);
  await b.gehe("/");
  pruefe("Start-Ansicht des Benutzers", await b.warte("document.querySelector('h1')?.textContent === 'Dashboard · Montage'"));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
