// End-to-End-Test Kopfzeile (globale Suche, „Neu“-Menü, Glocke) und vorläufiger Versand (Download, mailto).
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:kopfzeile
// Optional FOTOS=<Ordner> für Bildschirmfotos.
import path from "node:path";
import { aufraeumen, belegeAufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;
let kunde;
const kundeName = `Kopfkunde ${lauf}`;
const foto = async (name) => fotos && b.foto(path.join(fotos, `${name}.png`));

try {
  const admin = await testAdmin();
  ({ data: kunde } = await service.from("kunde").insert({ name: kundeName, email: `kopf-${lauf}@example.com`, strasse: "Am Hang 3", plz: "38518", ort: "Gifhorn" }).select("id, nummer").single());
  merken("kunde", kunde.id);
  const { data: aufgabe } = await service.from("aufgabe").insert({ titel: `Rückruf ${lauf}`, faellig: new Date().toISOString().slice(0, 10) }).select("id").single();
  merken("aufgabe", aufgabe.id);

  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // 1. Angebot über den Editor fertigstellen (Grundlage für Suche und Versand)
  await b.gehe(`/beleg/neu?art=angebot&kunde=${kunde.id}`);
  await b.da("[data-beleg-editor=angebot]");
  await b.tippe("[name=titel]", `Wintergarten ${lauf}`);
  await b.tippe("[data-position='0'] [data-feld=titel]", `Schiebetür HST${lauf}`);
  await b.tippe("[data-position='0'] [data-feld=preis]", "4200");
  await b.klick("[data-aktion=fertigstellen]");
  pruefe("Angebot fertiggestellt", await b.warte("document.querySelector('[data-status]')?.dataset.status === 'offen'", 30000));
  const agId = await b.js("location.pathname.split('/')[2]");
  const [ag] = await dbAbfrage("select nummer from public.beleg where id = $1", [agId]);

  // 2. Versand: Download mit Dateinamen, Dialog vorbelegt, mailto, Version eingefroren, Protokoll
  const dispo = await b.js(`fetch('/pdf/beleg/${agId}?download=1').then((r) => r.status + ' ' + r.headers.get('content-disposition'))`);
  pruefe("Download mit Nummer, Belegart und Kunde im Dateinamen", dispo?.startsWith("200 attachment") && dispo.includes(`${ag.nummer}_Angebot_Kopfkunde_${lauf}.pdf`), dispo);
  await b.klick("[data-aktion=versenden]");
  await b.da("[data-versand-formular]");
  pruefe(
    "Versand-Dialog: Empfänger aus dem Kunden, Betreff mit Nummer, Text",
    await b.warte(`document.querySelector("[data-versand-formular] [name=an]").value === "kopf-${lauf}@example.com" && document.querySelector("[data-versand-formular] [name=betreff]").value.startsWith("Angebot ${ag.nummer}") && document.querySelector("[data-versand-formular] [name=text]").value.includes("unser Angebot ${ag.nummer}")`),
  );
  await b.tippe("[data-versand-formular] [name=bcc]", "angebot-test@example.com");
  await foto("versand-dialog");
  await b.klickText("[data-versand-formular] button", "In Outlook öffnen");
  pruefe("Outlook per mailto mit Empfänger, BCC, Betreff", await b.warte(`(document.documentElement.dataset.mailto ?? "").startsWith("mailto:kopf-${lauf}%40example.com?bcc=angebot-test%40example.com&subject=Angebot%20${ag.nummer}")`));
  pruefe("Hinweis: PDF anhängen", await b.da("[data-versand-fertig]"));
  const [v] = await dbAbfrage("select kanal, empfaenger, bcc, pdfs from public.beleg_versand where beleg_id = $1", [agId]);
  pruefe("Versand protokolliert", v?.kanal === "email" && v.empfaenger[0] === `kopf-${lauf}@example.com` && v.bcc[0] === "angebot-test@example.com" && v.pdfs[0].name.includes(ag.nummer), JSON.stringify(v));
  const [eingefroren] = await dbAbfrage("select eingefroren_version from public.beleg where id = $1", [agId]);
  pruefe("Version 1 eingefroren", eingefroren?.eingefroren_version === 1);
  await b.klickText("[data-versand-fertig] button", "Schließen");

  // 3. Rechnung ohne Lexware-PDF: kein Download, kein Versand
  const [re] = await dbAbfrage("select id from public.beleg where art in ('rechnung','abschlagsrechnung','gutschrift') and status <> 'entwurf' and pdf_pfad is null and deleted_at is null limit 1");
  if (re) {
    const s = await b.js(`fetch('/pdf/beleg/${re.id}?download=1').then((r) => r.status)`);
    pruefe("Lexware-Beleg ohne Original: Download gesperrt (409)", s === 409, String(s));
  }

  // 4. Globale Suche: Vorschläge je Bereich, Fundstelle „Position“, Pfeiltasten und Enter
  await b.gehe("/");
  await b.tippe("[data-globale-suche]", `HST${lauf}`);
  pruefe("Vorschlag: Beleg über die Position gefunden", await b.warte(`[...document.querySelectorAll("[data-such-vorschlaege] [data-treffer=beleg]")].some((x) => x.getAttribute("href") === "/beleg/${agId}" && x.querySelector("[data-fundstelle]")?.innerText.startsWith("Position"))`));
  pruefe("Suchbegriff hervorgehoben", await b.js("!!document.querySelector('[data-such-vorschlaege] mark')"));
  await foto("suche-vorschlaege");
  await b.tippe("[data-globale-suche]", kundeName);
  await b.warte(`[...document.querySelectorAll("[data-such-vorschlaege] [data-treffer=kunde]")].some((x) => x.innerText.includes(${JSON.stringify(kundeName)}))`);
  await b.taste("ArrowDown", "ArrowDown", 40);
  await b.taste("Enter", "Enter", 13);
  pruefe("Pfeil runter und Enter öffnet den ersten Treffer (Kunde)", await b.warte(`location.pathname === "/kunden/${kunde.id}"`));
  await b.tippe("[data-globale-suche]", `Kopfkunde ${lauf}`);
  await b.warte("!!document.querySelector('[data-such-vorschlaege] [data-alle-ergebnisse]')");
  await b.taste("Enter", "Enter", 13);
  pruefe("Enter ohne Auswahl: Ergebnisseite mit Filtern", await b.warte(`location.pathname === "/suche" && !!document.querySelector("[data-such-filter]") && !!document.querySelector("[data-such-bereich=kunde]") && !!document.querySelector("[data-such-bereich=beleg]")`));
  await b.klickText("[data-such-filter] a", "Belege 1");
  pruefe("Filter Belege: nur der Bereich Belege", await b.warte(`location.search.includes("bereich=beleg") && !document.querySelector("[data-such-bereich=kunde]") && !!document.querySelector("[data-such-bereich=beleg]")`));
  await foto("suche-ergebnisse");

  // 5. „Neu“-Menü: Dialog öffnet direkt, Schließen entfernt den Parameter; Angebot öffnet den Editor
  await b.klick("[data-neu-menue]");
  await b.klick("[data-neu='Kunde']");
  pruefe("Neuer Kunde: Liste mit offenem Dialog", await b.warte("location.pathname === '/kunden' && !!document.querySelector('[role=dialog]')"));
  await b.taste("Escape", "Escape", 27);
  pruefe("Schließen entfernt ?neu", await b.warte("!document.querySelector('[role=dialog]') && !location.search.includes('neu=')"));
  await b.klick("[data-neu-menue]");
  await b.klick("[data-neu='Kunde']");
  pruefe("Erneut aus dem Menü: Dialog öffnet wieder", await b.warte("!!document.querySelector('[role=dialog]')"));
  await b.taste("Escape", "Escape", 27);
  await b.warte("!document.querySelector('[role=dialog]')");
  for (const [eintrag, pfad] of [["Anfrage", "/anfragen"], ["Service-Ticket", "/service"], ["Aufgabe", "/aufgaben"], ["Bestellung", "/bestellungen"]]) {
    await b.klick("[data-neu-menue]");
    await b.klick(`[data-neu='${eintrag}']`);
    pruefe(`Neu: ${eintrag} öffnet den Dialog`, await b.warte(`location.pathname === "${pfad}" && !!document.querySelector("[role=dialog]")`));
    await b.taste("Escape", "Escape", 27);
    await b.warte("!document.querySelector('[role=dialog]')");
  }
  await b.klick("[data-neu-menue]");
  await b.klick("[data-neu='Angebot']");
  pruefe("Neu: Angebot öffnet direkt den Editor", await b.warte("location.pathname === '/beleg/neu' && !!document.querySelector('[data-beleg-editor=angebot]')"));
  await b.gehe("/");
  await b.klick("[data-neu-menue]");
  await b.klick("[data-neu='Auftrag']");
  pruefe("Neu: Auftrag öffnet den Editor der AB", await b.warte("location.pathname === '/beleg/neu' && !!document.querySelector('[data-beleg-editor=auftragsbestaetigung]')"));

  // 6. Glocke: Punkt und Liste mit der fälligen Aufgabe und dem nachzufassenden Angebot
  await b.gehe("/kunden");
  pruefe("Glocke zeigt offene Hinweise", await b.warte("Number(document.querySelector('[data-glocke]')?.dataset.glocke) > 0"));
  await b.klick("[data-glocke]");
  pruefe("Liste: fällige Aufgabe", await b.warte("[...document.querySelectorAll('[data-glocke-liste] [data-hinweis]')].some((x) => x.innerText.includes('fällig') && x.innerText.includes('Aufgabe'))"));
  await foto("glocke");
  await b.js("[...document.querySelectorAll('[data-glocke-liste] [data-hinweis]')].find((x) => x.innerText.includes('Aufgabe')).setAttribute('data-x', 'glocke')");
  await b.klick("[data-x='glocke']");
  pruefe("Klick führt zur Stelle (Aufgaben)", await b.warte("location.pathname === '/aufgaben'"));

} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  try {
    if (kunde) await belegeAufraeumen(kunde.id);
  } catch (e) {
    console.error("Aufräumen Belege:", e.message);
  }
  await sleep(10);
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
