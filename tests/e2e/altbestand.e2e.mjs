// End-to-End-Test Altbestand aus der Airtable-Übernahme (docs/airtable-uebernahme.md) bei LEXWARE_ALTBESTAND nicht aktiv
// (Staging mit dem Lexware-Testkonto): Kopfbeleg (ohne Positionen) zeigt die Kopfdaten-Seite, lässt sich weder bearbeiten
// noch herunterladen; „Storniert“ zählt weder als Folgebeleg noch als Forderung noch als Abzug; Altbeleg nur am Kunden;
// kein Lexware-Abruf mit übernommenen IDs; eine neue Rechnung für einen übernommenen Kunden legt im Testkonto einen
// eigenen Kontakt an (die übernommene ID wird nie benutzt); Gutschrift zu einem Altbeleg wird abgelehnt.
// Jeder Lauf legt im Testkonto eine endgültige Rechnung an (dort nicht löschbar).
// Aufruf: App starten (ohne LEXWARE_ALTBESTAND), dann APP_URL=http://localhost:3100 npm run test:altbestand
import { aufraeumen, belegeAufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, testAdmin } from "./hilfen.mjs";

let b;
let kunde;
let kunde2;
const ALT_KONTAKT = `00000000-0000-4000-8000-${lauf.padStart(12, "0")}`;
const beleg = async (id) => (await dbAbfrage("select * from public.beleg where id = $1", [id]))[0];
const belegId = () => b.js("location.pathname.split('/')[2]");
const fake = (n) => `00000000-0000-4000-9000-${(lauf + n).padStart(12, "0")}`;

try {
  if (process.env.LEXWARE_ALTBESTAND?.trim() === "aktiv") throw new Error("Nur ohne LEXWARE_ALTBESTAND (Staging)");
  const admin = await testAdmin();
  // Übernommener Kunde mit (nicht existierender) Lexware-ID, Auftrag mit Kopf-AB, storniertem Abschlag und Altrechnung
  const { data: k, error: ke } = await service
    .from("kunde")
    .insert({ name: `Altkunde ${lauf}`, strasse: "Altweg 1", plz: "49074", ort: "Osnabrück", lexware_kontakt_id: ALT_KONTAKT, lexware_hash: "alt", altbestand: true, airtable_id: `test-${lauf}` })
    .select("id")
    .single();
  if (ke) throw ke;
  kunde = k;
  merken("kunde", k.id);
  // Zweiter übernommener Kunde für die Altrechnung (Gutschrift dazu darf keinen Kontakt anlegen)
  const { data: k2 } = await service
    .from("kunde")
    .insert({ name: `Altkunde 2 ${lauf}`, lexware_kontakt_id: `${ALT_KONTAKT.slice(0, -1)}2`, lexware_hash: "alt", altbestand: true, airtable_id: `test2-${lauf}` })
    .select("id")
    .single();
  kunde2 = k2;
  merken("kunde", k2.id);
  const { data: a, error: ae } = await service.from("auftrag").insert({ nummer: `AB2ALT${lauf}`, kunde_id: k.id, phase: "bestellung", airtable_id: `test-a-${lauf}` }).select("id").single();
  if (ae) throw ae;
  const gemeinsam = { kunde_id: k.id, altbestand: true, datum: "2026-10-01", adresse_name: `Altkunde ${lauf}`, steuerart: "standard", version: 1, fertiggestellt_am: "2026-10-01T12:00:00Z" };
  const { data: ab } = await service.from("beleg").insert({ ...gemeinsam, art: "auftragsbestaetigung", status: "fertiggestellt", nummer: `AB2ALT${lauf}`, auftrag_id: a.id, summe_netto: 1000, summe_brutto: 1190, steuern: [{ satz: 19, netto: 1000, steuer: 190, brutto: 1190 }], lexware_id: fake("1"), lexware_link: "https://app.lexware.de/permalink/order-confirmations/view/x" }).select("id, kette_id").single();
  const { data: storno } = await service.from("beleg").insert({ ...gemeinsam, art: "abschlagsrechnung", status: "storniert", nummer: `REALT${lauf}`, auftrag_id: a.id, kette_id: ab.kette_id, vorgaenger_id: ab.id, abschlag_nr: 1, summe_netto: 500, summe_brutto: 595, offen_betrag: 0, steuern: [{ satz: 19, netto: 500, steuer: 95, brutto: 595 }], lexware_id: fake("2"), lexware_status: "fertig" }).select("id").single();
  const { data: alt, error: re } = await service.from("beleg").insert({ ...gemeinsam, kunde_id: k2.id, art: "rechnung", status: "offen", nummer: `REALTK${lauf}`, summe_netto: 420.17, summe_brutto: 500, offen_betrag: 500, lexware_offen: 500, steuern: [{ satz: 19, netto: 420.17, steuer: 79.83, brutto: 500 }], lexware_id: fake("3"), lexware_status: "fertig", lexware_link: "https://app.lexware.de/permalink/invoices/view/y" }).select("id").single();
  pruefe("Altbelege angelegt (Rechnung nur am Kunden zulässig)", !!ab && !!storno && !!alt && !re, re?.message);

  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // Kopf-AB: Status „Bestätigt“ (Storno zählt nicht als Folgebeleg), kein „Bearbeiten“, PDF = Kopfdaten-Seite
  await b.gehe(`/beleg/${ab.id}`);
  pruefe("Kopf-AB: Bestätigt trotz storniertem Abschlag", await b.warte("document.querySelector('main [data-status]')?.getAttribute('data-status') === 'bestaetigt'"), await b.js("document.querySelector('main [data-status]')?.getAttribute('data-status')"));
  pruefe("Kopf-AB: nicht bearbeitbar", !(await b.js("!!document.querySelector('main [data-aktion=bearbeiten]')")));
  const pdf = await b.js(`fetch('/pdf/beleg/${ab.id}').then(async (r) => ({ s: r.status, t: r.headers.get('content-type'), n: (await r.arrayBuffer()).byteLength }))`);
  pruefe("Kopf-AB: PDF mit Kopfdaten (eine Seite)", pdf.s === 200 && pdf.t === "application/pdf" && pdf.n > 1000, JSON.stringify(pdf));
  const dl = await b.js(`fetch('/pdf/beleg/${ab.id}?download=1').then((r) => r.status)`);
  pruefe("Kopf-AB: kein Download (Original in Lexware)", dl === 409, String(dl));
  const [{ n: posVorher }] = await dbAbfrage("select count(*)::int n from public.beleg_position where beleg_id = $1", [ab.id]);
  pruefe("Kopf-AB: keine Positionen erzeugt, kein PDF abgelegt", posVorher === 0 && !(await beleg(ab.id)).pdf_pfad);

  // Storno
  await b.gehe(`/beleg/${storno.id}`);
  pruefe("Abschlag zeigt „Storniert“", await b.warte("document.querySelector('main [data-status]')?.getAttribute('data-status') === 'storniert'"));

  // Altrechnung nur am Kunden: Seite, Forderungen, Zahlungsstand ohne Lexware
  await b.gehe(`/beleg/${alt.id}`);
  pruefe("Altrechnung ohne Vorgang: Seite offen", await b.warte("document.querySelector('main [data-status]')?.getAttribute('data-status') === 'offen'"));
  if (await b.js("!!document.querySelector('[data-aktion=zahlungsstand]')")) {
    await b.klick("[data-aktion=zahlungsstand]");
    pruefe("Zahlungsstand abrufen: abgelehnt (nicht in diesem Lexware-Konto)", await b.warte("document.body.innerText.includes('nicht in diesem Lexware-Konto')", 15000));
  } else pruefe("Zahlungsstand abrufen: Knopf vorhanden", false);
  pruefe("Altrechnung: offener Betrag unverändert", Number((await beleg(alt.id)).lexware_offen) === 500);
  await b.gehe("/belege/forderungen");
  pruefe(
    "Offene Forderungen: Altrechnung ja, stornierter Abschlag nein",
    await b.warte(`!!document.querySelector('[data-beleg-zeile="${alt.id}"]')`, 20000) && !(await b.js(`!!document.querySelector('[data-beleg-zeile="${storno.id}"]')`)),
    await b.js(`location.pathname + location.search + ' Zeilen: ' + document.querySelectorAll('[data-beleg-zeile]').length + ' Storno: ' + !!document.querySelector('[data-beleg-zeile="${storno.id}"]')`),
  );

  // Rechnung am Auftrag: kein Abzug (Abschlag storniert); neuer Kontakt im Testkonto statt der übernommenen ID
  await b.gehe(`/beleg/neu?art=rechnung&auftrag=${a.id}`);
  await b.da("[data-beleg-editor=rechnung]");
  pruefe("Rechnung: kein Abzug für den stornierten Abschlag", (await b.js("document.querySelectorAll('[data-abzug]').length")) === 0);
  await b.tippe("[data-position='0'] [data-feld=titel]", "Montage");
  await b.tippe("[data-position='0'] [data-feld=preis]", "100");
  if (process.env.FOTOS) await b.foto(process.env.FOTOS + "/alt-1-rechnung.png");
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("!!document.querySelector('[data-lexware-bestaetigung]')");
  if (process.env.FOTOS) await b.foto(process.env.FOTOS + "/alt-2-dialog.png");
  await b.klickText("[role=dialog] button", "In Lexware anlegen");
  pruefe(
    "Rechnung in Lexware (Testkonto) angelegt",
    await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname) && !!document.querySelector('main [data-status]')", 60000),
    await b.js("location.pathname + ' ' + [...document.querySelectorAll('main')].filter((m) => m.offsetParent).map((m) => m.innerText).join(' ').replace(/\s+/g, ' ').slice(0, 900)"),
  );
  const r = await beleg(await belegId());
  const [kd] = await dbAbfrage("select lexware_kontakt_id, altbestand from public.kunde where id = $1", [k.id]);
  pruefe("Rechnung hat Nummer aus Lexware", !!r?.nummer && !!r.lexware_id, JSON.stringify({ nummer: r?.nummer, status: r?.status, lexware_status: r?.lexware_status, fehler: r?.lexware_fehler, auftrag: !!r?.auftrag_id, kunde: r?.kunde_id }));
  pruefe("Kunde: eigener Kontakt im Testkonto, kein Altbestand mehr", !!kd.lexware_kontakt_id && kd.lexware_kontakt_id !== ALT_KONTAKT && kd.altbestand === false, JSON.stringify(kd));

  // Gutschrift zur Altrechnung: wird beim Fertigstellen abgelehnt, ohne Lexware-Beleg
  await b.gehe(`/beleg/neu?art=gutschrift&vorgaenger=${alt.id}`);
  await b.da("[data-beleg-editor=gutschrift]");
  await b.tippe("[data-position='0'] [data-feld=titel]", "Nachlass");
  await b.tippe("[data-position='0'] [data-feld=preis]", "10");
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("!!document.querySelector('[data-lexware-bestaetigung]')");
  await b.klickText("[role=dialog] button", "In Lexware anlegen");
  pruefe("Gutschrift zum Altbeleg: abgelehnt", await b.warte("document.querySelector('[data-lexware-fehler]')?.innerText.includes('übernommener Beleg')", 60000), await b.js("document.querySelector('[data-lexware-fehler]')?.innerText"));
  const [{ lexware_kontakt_id: kontaktNachGutschrift, altbestand: altNachGutschrift }] = await dbAbfrage("select lexware_kontakt_id, altbestand from public.kunde where id = $1", [k2.id]);
  pruefe("Gutschrift zum Altbeleg: Kunde unverändert (kein Kontakt angelegt)", kontaktNachGutschrift === `${ALT_KONTAKT.slice(0, -1)}2` && altNachGutschrift === true);
} catch (e) {
  pruefe("Ablauf ohne Ausnahme", false, e.stack ?? String(e));
} finally {
  b?.ende();
  try {
    if (kunde) await belegeAufraeumen(kunde.id);
    if (kunde2) await belegeAufraeumen(kunde2.id);
  } catch (e) {
    console.error("Aufräumen:", e.message);
  }
  await aufraeumen();
  bilanz();
}
