// End-to-End-Test Lexware (Belege Schritt 2) gegen das Lexware-Testkonto (LEXWARE_API_KEY, nie Sawins echtes Konto):
// Angebot → AB → Auftrag, 1. Abschlag (Prozent), Teil-AB → Lieferschein → Teilrechnung, 2. Abschlag (Betrag) als
// Lexware-Rechnungen, Schlussrechnung mit Abzug beider Abschläge und der Teilrechnung, Gutschrift aus der Schlussrechnung, Rechnung am Service-Ticket (erst mit Fehler von Lexware,
// dann erfolgreich wiederholt). Prüft jeden Betrag zusätzlich direkt über die Lexware-API und gibt die Beträge aus.
// Jeder Lauf legt im Testkonto endgültige Belege an (dort nicht löschbar).
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:lexware   (optional FOTOS=<Ordner>, BEHALTEN=1)
import { writeFileSync } from "node:fs";
import path from "node:path";
import { aufraeumen, belegeAufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
const behalten = process.env.BEHALTEN === "1";
const foto = async (name) => fotos && (await b.foto(path.join(fotos, `${name}.png`)));
let b;
let kunde;
let ticket;
const kundeName = `Lexware-Durchlauf ${lauf}`;
const beleg = async (id) => (await dbAbfrage("select * from public.beleg where id = $1", [id]))[0];
const belegId = () => b.js("location.pathname.split('/')[2]");
const euro = (n) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n));
const rund = (n) => Math.round(Number(n) * 100) / 100;

// Lexware direkt (nur lesend, gedrosselt) zur unabhängigen Kontrolle der Beträge
let letzte = 0;
async function lex(pfad) {
  for (let v = 0; v < 6; v++) {
    const warte = letzte + 600 - Date.now();
    if (warte > 0) await sleep(warte);
    letzte = Date.now();
    const r = await fetch(`https://api.lexware.io${pfad}`, { headers: { Authorization: `Bearer ${process.env.LEXWARE_API_KEY}`, Accept: "application/json" } });
    if (r.status === 429) { await sleep(1000 * 2 ** v); continue; }
    if (!r.ok) throw new Error(`Lexware ${r.status} bei ${pfad}`);
    return r.json();
  }
  throw new Error("Lexware 429");
}
const pdfSichern = async (id, name) => {
  if (!fotos) return;
  const b64 = await b.js(`fetch('/pdf/beleg/${id}').then((r) => r.arrayBuffer()).then((x) => { let s = ''; new Uint8Array(x).forEach((c) => (s += String.fromCharCode(c))); return btoa(s); })`);
  writeFileSync(path.join(fotos, `${name}.pdf`), Buffer.from(b64, "base64"));
};

/** Fertigstellen eines Lexware-Belegs: Bestätigungsdialog, dann Warten auf die Belegseite */
async function inLexwareAnlegen(name) {
  await b.klick("[data-aktion=fertigstellen]");
  const dialog = await b.warte("!!document.querySelector('[data-lexware-bestaetigung]')");
  const text = await b.js("document.querySelector('[role=dialog]')?.innerText ?? ''");
  pruefe(`${name}: Bestätigungsdialog (endgültig, nicht löschbar, nur Lexware-PDF)`, dialog && text.includes("endgültig und nicht löschbar") && text.includes("nur das Lexware-PDF"), text.slice(0, 200));
  await b.klickText("[role=dialog] button", "In Lexware anlegen");
  return b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname) && !!document.querySelector('[data-status]')", 60000);
}

const zeilen = [];
try {
  if (!process.env.LEXWARE_API_KEY) throw new Error("LEXWARE_API_KEY fehlt (nur Testkonto)");
  const admin = await testAdmin();
  const { data: k } = await service
    .from("kunde")
    .insert({ name: kundeName, strasse: "Rechnungsweg 1", plz: "38518", ort: "Gifhorn", telefon: "05371 1111", herkunft: "Website" })
    .select("id, nummer")
    .single();
  kunde = k;
  if (!behalten) merken("kunde", k.id);

  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");
  pruefe("Seitenleiste: Lexware verbunden, Abschläge/Rechnungen/Gutschriften sind Links", await b.warte("document.querySelector('[data-lexware-status]')?.dataset.lexwareStatus === 'verbunden' && ['/belege/abschlaege', '/belege/rechnungen', '/belege/gutschriften'].every((h) => !!document.querySelector(`aside a[href=\"${h}\"]`))"));

  // 1. Angebot mit drei Positionen, fertigstellen
  await b.gehe(`/beleg/neu?art=angebot&kunde=${k.id}`);
  await b.da("[data-beleg-editor=angebot]");
  await b.tippe("[name=titel]", "Fenster und Haustür");
  await b.tippe("[name=bauvorhaben]", "Modernisierung EFH");
  await b.tippe("[data-position='0'] [data-feld=titel]", "Kunststofffenster 2-flg.");
  await b.tippe("[data-position='0'] [data-feld=menge]", "3");
  await b.tippe("[data-position='0'] [data-feld=preis]", "1249,90");
  await b.klick("[data-neue-position]");
  await b.tippe("[data-position='1'] [data-feld=titel]", "Haustür RC2");
  await b.tippe("[data-position='1'] [data-feld=preis]", "3850");
  await b.klick("[data-neue-position]");
  await b.tippe("[data-position='2'] [data-feld=titel]", "Montage");
  await b.tippe("[data-position='2'] [data-feld=menge]", "12");
  await b.tippe("[data-position='2'] [data-feld=preis]", "68");
  pruefe("Angebot: 10.014,68 € brutto (8.415,70 € netto)", await b.warte("document.querySelector('[data-gesamtbetrag]').textContent.includes('10.014,68')"), await b.js("document.querySelector('[data-gesamtbetrag]').textContent"));
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname) && !!document.querySelector('[data-status]')");
  const agId = await belegId();
  const ag = await beleg(agId);
  pruefe("Angebot fertiggestellt (offen)", ag?.status === "offen", ag?.status);

  // 2. AB aus dem Angebot → Auftrag
  await b.gehe(`/beleg/neu?art=auftragsbestaetigung&vorgaenger=${agId}`);
  await b.da("[data-beleg-editor=auftragsbestaetigung]");
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname) && !!document.querySelector('[data-status]')");
  const abId = await belegId();
  const ab = await beleg(abId);
  const auftragId = ab?.auftrag_id;
  pruefe("AB fertiggestellt, Auftrag angelegt", !!auftragId && Number(ab.summe_brutto) === 10014.68, `${ab?.nummer} ${ab?.summe_brutto}`);
  zeilen.push(["Auftragsbestätigung", ab.nummer, ab.summe_netto, rund(ab.summe_brutto - ab.summe_netto), ab.summe_brutto]);
  pruefe("AB: nächster Schritt bietet Rechnung und Abschlag", await b.warte("['Rechnung erstellen', 'Abschlagsrechnung'].every((t) => document.querySelector('[data-naechster-schritt]')?.innerText.includes(t))"));

  // 3. 1. Abschlag: 30 % vom Auftragswert
  await b.gehe(`/beleg/neu?art=abschlagsrechnung&auftrag=${auftragId}`);
  await b.da("[data-beleg-editor=abschlagsrechnung]");
  pruefe("Abschlag-Editor: Auftragswert und Vorschlag 50 %", await b.warte("document.querySelector('[data-abschlag-uebersicht]')?.innerText.includes('10.014,68') && document.querySelector('[name=abschlag_wert]').value === '50'"));
  await b.tippe("[name=abschlag_wert]", "30");
  pruefe("1. Abschlag: 30 % = 3.004,40 € brutto", await b.warte("document.querySelector('[data-abschlag-brutto]')?.textContent.includes('3.004,40')"), await b.js("document.querySelector('[data-abschlag-brutto]')?.textContent"));
  await foto("lex-01-abschlag-editor");
  pruefe("1. Abschlag in Lexware angelegt", await inLexwareAnlegen("1. Abschlag"));
  const a1Id = await belegId();
  const a1 = await beleg(a1Id);
  pruefe("1. Abschlag: Nummer von Lexware, Status offen, Titel „1. Abschlagsrechnung“", /^RE\d+/.test(a1?.nummer ?? "") && a1.status === "offen" && a1.abschlag_nr === 1 && a1.titel === "1. Abschlagsrechnung" && !!a1.lexware_id, JSON.stringify({ n: a1?.nummer, s: a1?.status, t: a1?.titel }));
  pruefe("1. Abschlag: Original-PDF von Lexware abgelegt", !!a1.pdf_pfad && a1.lexware_status === "fertig", `${a1.pdf_pfad} ${a1.lexware_status}`);
  const [kd1] = await dbAbfrage("select lexware_kontakt_id, lexware_hash from public.kunde where id = $1", [k.id]);
  pruefe("Kunde beim ersten Lexware-Beleg übertragen (Kontakt-ID gespeichert)", !!kd1?.lexware_kontakt_id, kd1?.lexware_kontakt_id);
  const l1 = await lex(`/v1/invoices/${a1.lexware_id}`);
  pruefe("Lexware: 1. Abschlag 2.524,71 netto + 479,69 USt = 3.004,40", rund(l1.totalPrice.totalGrossAmount) === 3004.4 && rund(l1.totalPrice.totalGrossAmount) === rund(a1.summe_brutto) && rund(l1.totalPrice.totalNetAmount) === rund(a1.summe_netto), JSON.stringify(l1.totalPrice));
  zeilen.push(["1. Abschlag (30 %)", a1.nummer, l1.totalPrice.totalNetAmount, l1.totalPrice.totalTaxAmount, l1.totalPrice.totalGrossAmount]);
  await pdfSichern(a1Id, "lex-01-abschlag-1");

  // Teil-AB über ein Fenster (aus der AB), Liefertermin Pflicht → Lieferschein → Teilrechnung in Lexware
  const datumSetzen = (sel, wert) => b.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(wert)}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await b.gehe(`/beleg/neu?art=teil_ab&vorgaenger=${abId}`);
  await b.da("[data-beleg-editor=teil_ab]");
  pruefe("Teil-AB: Positionen der AB übernommen, Liefertermin leer", (await b.js("document.querySelectorAll('[data-position]').length")) === 3 && (await b.js("document.querySelector('[name=liefertermin]').value")) === "");
  await b.klick("[data-position='2'] button[aria-label='Position 3 löschen']");
  await b.klick("[data-position='1'] button[aria-label='Position 2 löschen']");
  await b.tippe("[data-position='0'] [data-feld=menge]", "1");
  await datumSetzen("[name=liefertermin]", "2026-12-07");
  pruefe("Teil-AB: 1 Fenster = 1.487,38 €", await b.warte("document.querySelector('[data-gesamtbetrag]').textContent.includes('1.487,38')"), await b.js("document.querySelector('[data-gesamtbetrag]').textContent"));
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname) && !!document.querySelector('[data-status]')");
  const tabId = await belegId();
  const tab = await beleg(tabId);
  const [auftragNachTab] = await dbAbfrage("select liefertermin from public.auftrag where id = $1", [auftragId]);
  pruefe("Teil-AB: Nummer AB…-01, Liefertermin am Auftrag", tab?.nummer === `${ab.nummer}-01` && String(auftragNachTab?.liefertermin).length > 0 && new Date(auftragNachTab.liefertermin).toISOString().startsWith("2026-12-0"), `${tab?.nummer} ${auftragNachTab?.liefertermin}`);
  pruefe("Teil-AB: nächster Schritt Lieferschein", await b.warte("document.querySelector('[data-naechster-schritt]')?.innerText.includes('Lieferschein erstellen')"));
  await b.gehe(`/beleg/neu?art=lieferschein&vorgaenger=${tabId}`);
  await b.da("[data-beleg-editor=lieferschein]");
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname) && !!document.querySelector('[data-status]')");
  const lsId = await belegId();
  pruefe("Lieferschein der Teil-AB: nächster Schritt Teilrechnung", await b.warte("document.querySelector('[data-naechster-schritt]')?.innerText.includes('Teilrechnung erstellen')"));
  await b.gehe(`/beleg/neu?art=rechnung&vorgaenger=${lsId}`);
  await b.da("[data-beleg-editor=rechnung]");
  pruefe("Teilrechnung: Titel, keine Abzüge", await b.warte("document.querySelector('[name=titel]').value === 'Teilrechnung' && !document.querySelector('[data-abzug]')"));
  pruefe("Teilrechnung in Lexware angelegt", await inLexwareAnlegen("Teilrechnung"));
  const teilR = await beleg(await belegId());
  const lt = await lex(`/v1/invoices/${teilR.lexware_id}`);
  pruefe("Lexware: Teilrechnung 1.249,90 + 237,48 = 1.487,38, Titel „Teilrechnung“", teilR.teil && lt.title === "Teilrechnung" && rund(lt.totalPrice.totalGrossAmount) === 1487.38, `${lt.title} ${JSON.stringify(lt.totalPrice)}`);
  zeilen.push(["Teilrechnung (Teil-AB, 1 Fenster)", teilR.nummer, lt.totalPrice.totalNetAmount, lt.totalPrice.totalTaxAmount, lt.totalPrice.totalGrossAmount]);

  // Kundenänderung geht nur App → Lexware (beim nächsten Lexware-Beleg bzw. beim Speichern des Kunden)
  await service.from("kunde").update({ telefon: "05371 2222" }).eq("id", k.id);

  // 4. 2. Abschlag: 4.000 € brutto
  await b.gehe(`/auftraege/${auftragId}`);
  pruefe("Auftrag: Finanzen mit 1. Abschlag", await b.warte(`document.querySelector('[data-finanzen="Abschlagsrechnungen"]')?.innerText.includes(${JSON.stringify(a1.nummer)})`));
  await b.gehe(`/beleg/neu?art=abschlagsrechnung&auftrag=${auftragId}`);
  await b.da("[data-beleg-editor=abschlagsrechnung]");
  await b.klickText("[role=radiogroup] button", "Betrag brutto");
  await b.tippe("[name=abschlag_wert]", "4000");
  await b.warte("!!document.querySelector('[data-abschlag-brutto]')");
  const a2Anzeige = await b.js("document.querySelector('[data-abschlag-brutto]').textContent");
  pruefe("2. Abschlag: Übersicht zeigt 1. Abschlag und Rest", await b.warte(`document.querySelector('[data-abschlag-uebersicht]').innerText.includes(${JSON.stringify(a1.nummer)})`), a2Anzeige);
  pruefe("2. Abschlag in Lexware angelegt", await inLexwareAnlegen("2. Abschlag"));
  const a2Id = await belegId();
  const a2 = await beleg(a2Id);
  const l2 = await lex(`/v1/invoices/${a2.lexware_id}`);
  pruefe("2. Abschlag: Nr. 2, Betrag von Lexware wie angezeigt", a2.abschlag_nr === 2 && a2.titel === "2. Abschlagsrechnung" && a2Anzeige.includes(euro(l2.totalPrice.totalGrossAmount).replace(/\s/g, " ").slice(0, -2)), `${a2Anzeige} / ${l2.totalPrice.totalGrossAmount}`);
  zeilen.push([`2. Abschlag (Betrag 4.000 €${rund(l2.totalPrice.totalGrossAmount) !== 4000 ? ", für centgenaue Schlussrechnung angepasst" : ""})`, a2.nummer, l2.totalPrice.totalNetAmount, l2.totalPrice.totalTaxAmount, l2.totalPrice.totalGrossAmount]);
  const kontakt = await lex(`/v1/contacts/${kd1.lexware_kontakt_id}`);
  pruefe("Lexware-Kontakt aktualisiert (Telefon aus der App)", JSON.stringify(kontakt.phoneNumbers ?? {}).includes("05371 2222"), JSON.stringify(kontakt.phoneNumbers));

  // 5. Schlussrechnung: volle Leistung, beide Abschläge als Minusposition
  await b.gehe(`/beleg/neu?art=rechnung&auftrag=${auftragId}`);
  await b.da("[data-beleg-editor=rechnung]");
  pruefe("Schlussrechnung: Titel und drei Abzüge (2 Abschläge, Teilrechnung; nicht abwählbar)", await b.warte("document.querySelector('[name=titel]').value === 'Schlussrechnung' && document.querySelectorAll('[data-abzug]').length === 3"));
  const erwartetRest = rund(10014.68 - l1.totalPrice.totalGrossAmount - l2.totalPrice.totalGrossAmount - lt.totalPrice.totalGrossAmount);
  pruefe(`Schlussrechnung: Rest ${euro(erwartetRest)}`, await b.warte(`document.querySelector('[data-gesamtbetrag]').textContent.includes(${JSON.stringify(euro(erwartetRest).replace(/\s/g, " ").slice(0, -2))})`), await b.js("document.querySelector('[data-gesamtbetrag]').textContent"));
  pruefe("Schlussrechnung: keine Rundungsabweichung", !(await b.js("!!document.querySelector('[data-rundung]')")));
  await foto("lex-02-schlussrechnung-editor");
  pruefe("Schlussrechnung in Lexware angelegt", await inLexwareAnlegen("Schlussrechnung"));
  const srId = await belegId();
  const sr = await beleg(srId);
  const ls = await lex(`/v1/invoices/${sr.lexware_id}`);
  const t19 = (x) => x.taxAmounts.find((t) => t.taxRatePercentage === 19);
  const netto = rund(8415.7 - l1.totalPrice.totalNetAmount - l2.totalPrice.totalNetAmount - lt.totalPrice.totalNetAmount);
  const steuer = rund(1598.98 - l1.totalPrice.totalTaxAmount - l2.totalPrice.totalTaxAmount - lt.totalPrice.totalTaxAmount);
  pruefe(
    "Lexware: Schlussrechnung exakt (Netto, USt und Rest = AB − Abschläge)",
    rund(ls.totalPrice.totalNetAmount) === netto && rund(t19(ls).taxAmount) === steuer && rund(ls.totalPrice.totalGrossAmount) === erwartetRest,
    `${JSON.stringify(ls.totalPrice)} erwartet netto ${netto}, USt ${steuer}, brutto ${erwartetRest}`,
  );
  pruefe("Lexware: Schlussrechnung hat 3 Leistungen + 3 Minuspositionen", ls.lineItems.filter((x) => x.unitPrice?.netAmount < 0).length === 3 && ls.lineItems.length === 6, String(ls.lineItems.length));
  zeilen.push(["Schlussrechnung (Rest)", sr.nummer, ls.totalPrice.totalNetAmount, ls.totalPrice.totalTaxAmount, ls.totalPrice.totalGrossAmount]);
  await pdfSichern(srId, "lex-03-schlussrechnung");
  await foto("lex-03-schlussrechnung");

  // 6. AB ist abgerechnet, Auftrag ohne Bestand, nach der Schlussrechnung nur noch Gutschrift
  pruefe("AB: Status „Abgerechnet“", (await b.gehe(`/beleg/${abId}`), await b.warte("document.querySelector('[data-status]')?.dataset.status === 'abgerechnet'")));
  await b.gehe(`/auftraege/${auftragId}`);
  pruefe("Auftrag: noch nicht berechnet 0,00 €, offen = Summe aller Rechnungen", await b.warte(`document.querySelector('[data-auftragsbestand]')?.textContent.includes('0,00') && document.querySelector('[data-offen]')?.textContent.includes('10.014,68')`), await b.js("document.querySelector('[data-auftragsbestand]')?.textContent + ' / ' + document.querySelector('[data-offen]')?.textContent"));
  await b.klick("[data-beleg-erstellen]");
  const menue = await b.js("document.querySelector('[data-beleg-erstellen]').parentElement.innerText");
  pruefe("Beleg-Menü nach der Schlussrechnung: nur Gutschriften und Nachtrag", menue.includes(`Gutschrift zu ${sr.nummer}`) && !menue.includes("Abschlagsrechnung\n") && !menue.includes("Schlussrechnung\n"), menue);
  await b.gehe(`/beleg/neu?art=abschlagsrechnung&auftrag=${auftragId}`);
  pruefe("Kein Abschlag mehr nach der Schlussrechnung", await b.warte("document.body.innerText.includes('schon die Schlussrechnung')"));

  // 7. Gutschrift aus der Schlussrechnung (eine Montagestunde)
  await b.gehe(`/beleg/neu?art=gutschrift&vorgaenger=${srId}`);
  await b.da("[data-beleg-editor=gutschrift]");
  const n = await b.js("document.querySelectorAll('[data-position]').length");
  for (let i = n - 1; i >= 1; i--) await b.klick(`[data-position='${i}'] button[aria-label^='Position']`);
  await b.tippe("[data-position='0'] [data-feld=titel]", "Gutschrift Montage (1 Std.)");
  await b.tippe("[data-position='0'] [data-feld=menge]", "1");
  await b.tippe("[data-position='0'] [data-feld=preis]", "68");
  pruefe("Gutschrift: 80,92 €", await b.warte("document.querySelector('[data-gesamtbetrag]').textContent.includes('80,92')"));
  pruefe("Gutschrift in Lexware angelegt", await inLexwareAnlegen("Gutschrift"));
  const gs = await beleg(await belegId());
  const lg = await lex(`/v1/credit-notes/${gs.lexware_id}`);
  pruefe("Lexware: Gutschrift verweist auf die Schlussrechnung", (lg.relatedVouchers ?? []).some((v) => v.id === sr.lexware_id) && rund(lg.totalPrice.totalGrossAmount) === 80.92, JSON.stringify(lg.relatedVouchers));
  zeilen.push(["Gutschrift", gs.nummer, -lg.totalPrice.totalNetAmount, -lg.totalPrice.totalTaxAmount, -lg.totalPrice.totalGrossAmount]);

  // 8. Rechnung am Service-Ticket: Fehler von Lexware wird angezeigt, Wiederholen gelingt, Ticket „Abgerechnet“
  const { data: t } = await service.from("service_ticket").insert({ kunde_id: k.id, thema: `Reparatur ${lauf}`, art: "reparatur", status: "erledigt" }).select("id, nummer").single();
  ticket = t;
  await b.gehe(`/service/${t.id}`);
  await b.klickText("[data-ticket-rechnung] a", "Rechnung erstellen");
  await b.da("[data-beleg-editor=rechnung]");
  await b.tippe("[data-position='0'] [data-feld=titel]", "Beschlag nachgestellt");
  await b.tippe("[data-position='0'] [data-feld=preis]", "95");
  await b.js("(() => { const s = document.querySelector('[name=steuerart]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'steuerfrei'); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("!!document.querySelector('[data-lexware-bestaetigung]')");
  await b.klickText("[role=dialog] button", "In Lexware anlegen");
  pruefe(
    "Fehler von Lexware wird angezeigt (steuerfrei nicht erlaubt)",
    await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname) && !!document.querySelector('[role=alert]')?.innerText.includes('Lexware')", 60000),
    await b.js("document.querySelector('[role=alert]')?.innerText"),
  );
  const trId = await b.js("location.pathname.split('/')[2]");
  await b.da("[name=steuerart]");
  const trFehler = await beleg(trId);
  pruefe("Fehler am Beleg gespeichert, Beleg bleibt Entwurf", trFehler?.status === "entwurf" && trFehler.lexware_status === "fehler" && !!trFehler.lexware_fehler, `${trFehler?.lexware_status}: ${trFehler?.lexware_fehler}`);
  await b.js("(() => { const s = document.querySelector('[name=steuerart]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'standard'); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  pruefe("Wiederholen gelingt", await inLexwareAnlegen("Ticket-Rechnung"));
  const tr = await beleg(trId);
  const [t2] = await dbAbfrage("select status from public.service_ticket where id = $1", [t.id]);
  pruefe("Ticket-Rechnung in Lexware (113,05 €), Ticket „Abgerechnet“", tr.status === "offen" && Number(tr.summe_brutto) === 113.05 && t2.status === "abgerechnet", `${tr.status} ${tr.summe_brutto} ${t2.status}`);

  // 9. Listen und Dashboard
  await b.gehe("/belege/abschlaege");
  pruefe("Liste Abschlagsrechnungen zeigt beide Abschläge", await b.warte(`[${JSON.stringify(a1.nummer)}, ${JSON.stringify(a2.nummer)}].every((x) => document.querySelector('[data-belegliste]')?.innerText.includes(x))`));
  await b.gehe("/belege/forderungen");
  pruefe("Offene Forderungen enthalten die Schlussrechnung", await b.warte(`document.querySelector('[data-belegliste]')?.innerText.includes(${JSON.stringify(sr.nummer)})`));
  await b.gehe("/");
  pruefe("Dashboard: Forderungen und Angebotsquote statt Platzhalter", await b.warte("!document.querySelector('[data-platzhalter]') && !!document.querySelector('[data-angebotsquote]')"));
  await foto("lex-04-dashboard");

  console.log("\nBeträge (laut Lexware):");
  console.log(["Beleg", "Nummer", "Netto", "USt", "Brutto"].join("\t"));
  for (const [name, nr, nt, st, br] of zeilen) console.log([name, nr, euro(nt), euro(st), euro(br)].join("\t"));
  console.log(`Kontrolle: Abschläge + Teilrechnung + Schlussrechnung = ${euro(rund(zeilen[1][4] + zeilen[2][4] + zeilen[3][4] + zeilen[4][4]))} (AB ${euro(zeilen[0][4])})`);
  if (behalten) console.log(`\nBehalten: Kunde „${kundeName}“, Auftrag ${ab.nummer} (in der App unter /auftraege/${auftragId})`);
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  if (!behalten) {
    try {
      if (ticket) {
        await dbAbfrage("delete from public.beleg_position where beleg_id in (select id from public.beleg where ticket_id = $1)", [ticket.id]);
        const tb = await dbAbfrage("select id from public.beleg where ticket_id = $1", [ticket.id]);
        const pfade = (await dbAbfrage("select name from storage.objects where bucket_id = 'belege' and split_part(name, '/', 1) = any($1)", [tb.map((x) => x.id)])).map((x) => x.name);
        if (pfade.length) await service.storage.from("belege").remove(pfade);
        await dbAbfrage("delete from public.beleg where ticket_id = $1", [ticket.id]);
        await dbAbfrage("delete from public.service_ticket where id = $1", [ticket.id]);
      }
      await belegeAufraeumen(kunde?.id);
    } catch (e) {
      console.error("Aufräumen Lexware:", e.message);
    }
  }
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
