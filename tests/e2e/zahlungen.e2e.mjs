// End-to-End-Test Zahlungen gegen das Lexware-Testkonto (LEXWARE_API_KEY, nie Sawins echtes Konto):
// AB → Abschlag (in Lexware), Gutschrift zum Abschlag (Lexware verringert den offenen Betrag), „Zahlungsstand abrufen“
// übernimmt das; „Als bezahlt markieren“: Teilzahlung bar mit Zahlungsbestätigung (PDF ohne USt), Rest per Karte →
// „Bezahlt“, „in Lexware noch buchen“, Finanzen am Auftrag, Liste „Offene Forderungen“.
// Jeder Lauf legt im Testkonto endgültige Belege an (dort nicht löschbar).
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:zahlungen   (optional FOTOS=<Ordner>)
import { writeFileSync } from "node:fs";
import path from "node:path";
import { aufraeumen, belegeAufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;
let kunde;
const kundeName = `Zahlungskunde ${lauf}`;
const beleg = async (id) => (await dbAbfrage("select * from public.beleg where id = $1", [id]))[0];
const belegId = () => b.js("location.pathname.split('/')[2]");

async function inLexwareAnlegen() {
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("!!document.querySelector('[data-lexware-bestaetigung]')");
  await b.klickText("[role=dialog] button", "In Lexware anlegen");
  return b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname) && !!document.querySelector('[data-status]')", 60000);
}
/** „Als bezahlt markieren“ ausfüllen */
async function bezahlen(betrag, art, bestaetigung) {
  await b.klick("[data-aktion=bezahlt]");
  await b.da("[data-bezahlt-formular]");
  await b.tippe("[data-bezahlt-formular] [name=betrag]", betrag);
  await b.js(`document.querySelector('[data-bezahlt-formular] input[name=zahlungsart][value=${art}]').click()`);
  const an = await b.js("document.querySelector('[data-bezahlt-formular] [name=bestaetigung]').checked");
  if (an !== bestaetigung) await b.js("document.querySelector('[data-bezahlt-formular] [name=bestaetigung]').click()");
  await b.klickText("[data-bezahlt-formular] button", "Zahlung speichern");
}

try {
  if (!process.env.LEXWARE_API_KEY) throw new Error("LEXWARE_API_KEY fehlt (nur Testkonto)");
  const admin = await testAdmin();
  const { data: k } = await service.from("kunde").insert({ name: kundeName, strasse: "Kassenweg 3", plz: "38518", ort: "Gifhorn" }).select("id").single();
  kunde = k;
  merken("kunde", k.id);

  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // AB direkt (ohne Angebot) → Auftrag
  await b.gehe(`/beleg/neu?art=auftragsbestaetigung&kunde=${k.id}`);
  await b.da("[data-beleg-editor=auftragsbestaetigung]");
  await b.tippe("[data-position='0'] [data-feld=titel]", "Haustür");
  await b.tippe("[data-position='0'] [data-feld=preis]", "2000");
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname) && !!document.querySelector('[data-status]')");
  const ab = await beleg(await belegId());
  pruefe("AB fertig, Auftrag angelegt (2.380,00 €)", !!ab?.auftrag_id && Number(ab.summe_brutto) === 2380, ab?.summe_brutto);

  // Abschlag 50 % in Lexware
  await b.gehe(`/beleg/neu?art=abschlagsrechnung&auftrag=${ab.auftrag_id}`);
  await b.da("[data-beleg-editor=abschlagsrechnung]");
  await b.warte("document.querySelector('[data-abschlag-brutto]')?.textContent.includes('1.190,00')");
  pruefe("Abschlag in Lexware angelegt", await inLexwareAnlegen());
  const aId = await belegId();
  let a = await beleg(aId);
  pruefe("Abschlag offen 1.190,00 €, Zahlungen-Karte da", Number(a.offen_betrag) === 1190 && (await b.warte("!!document.querySelector('[data-zahlungen]') && !!document.querySelector('[data-aktion=bezahlt]')")), a.offen_betrag);

  // Gutschrift über 100 € netto (119 €) zum Abschlag → Lexware verringert den offenen Betrag
  await b.gehe(`/beleg/neu?art=gutschrift&vorgaenger=${aId}`);
  await b.da("[data-beleg-editor=gutschrift]");
  await b.tippe("[data-position='0'] [data-feld=titel]", "Nachlass");
  await b.tippe("[data-position='0'] [data-feld=preis]", "100");
  pruefe("Gutschrift in Lexware angelegt", await inLexwareAnlegen());

  // Zahlungsstand abrufen: offener Betrag laut Lexware 1.071,00 €, Gutschrift ist keine Zahlung
  await b.gehe(`/beleg/${aId}`);
  await b.klick("[data-aktion=zahlungsstand]");
  pruefe("Zahlungsstand abgerufen: offen 1.071,00 € (Gutschrift aus Lexware verrechnet)", await b.warte("document.body.innerText.includes('offen 1.071,00')", 30000), await b.js("document.querySelector('main').innerText.match(/offen [0-9.,]+/)?.[0]"));
  a = await beleg(aId);
  const [{ n: zahlAnzahl }] = await dbAbfrage("select count(*)::int n from public.zahlung where beleg_id = $1", [aId]);
  pruefe("Gutschrift erscheint nicht als Zahlung", zahlAnzahl === 0 && Number(a.lexware_offen) === 1071, `${zahlAnzahl} ${a.lexware_offen}`);

  // Teilzahlung bar 500 € mit Zahlungsbestätigung
  await bezahlen("500", "bar", true);
  pruefe("Teilzahlung: weiter zur Zahlungsbestätigung", await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname) && document.querySelector('h1')?.textContent.includes('Zahlungsbestätigung')", 30000), await b.js("document.querySelector('[role=dialog]')?.innerText ?? 'kein Dialog'"));
  const zbId = await belegId();
  const zb = await beleg(zbId);
  merken("beleg", zbId);
  pruefe("Zahlungsbestätigung: ZB-Nummer, 500 €, Rest 571 €, in der Kette hinter dem Abschlag", /^ZB1\d{6}$/.test(zb?.nummer ?? "") && Number(zb.summe_brutto) === 500 && Number(zb.offen_betrag) === 571 && zb.vorgaenger_id === aId && zb.kette_id === a.kette_id, JSON.stringify({ n: zb?.nummer, b: zb?.summe_brutto, o: zb?.offen_betrag }));
  const pdfText = await b.js(`fetch('/pdf/beleg/${zbId}').then((r) => r.arrayBuffer()).then((x) => new TextDecoder('latin1').decode(x).length)`);
  pruefe("Zahlungsbestätigung: PDF abgelegt", !!zb.pdf_pfad && pdfText > 1000, `${zb.pdf_pfad} ${pdfText}`);
  if (fotos) {
    const b64 = await b.js(`fetch('/pdf/beleg/${zbId}').then((r) => r.arrayBuffer()).then((x) => { let s = ''; new Uint8Array(x).forEach((c) => (s += String.fromCharCode(c))); return btoa(s); })`);
    writeFileSync(path.join(fotos, "zahlung-01-bestaetigung.pdf"), Buffer.from(b64, "base64"));
  }
  a = await beleg(aId);
  pruefe("Abschlag: offen 571 €, Status offen", Number(a.offen_betrag) === 571 && a.status === "offen", `${a.offen_betrag} ${a.status}`);

  // Liste „Offene Forderungen“: Hinweis „in Lexware noch buchen“
  await b.gehe("/belege/forderungen");
  pruefe("Forderungen: Abschlag mit „in Lexware noch buchen“", await b.warte(`[...document.querySelectorAll('[data-beleg-zeile]')].some((z) => z.innerText.includes(${JSON.stringify(a.nummer)}) && z.innerText.includes('in Lexware noch buchen'))`));

  // Rest per Karte ohne Bestätigung → bezahlt
  await b.gehe(`/beleg/${aId}`);
  await bezahlen("571", "karte", false);
  pruefe("Restzahlung: Abschlag „Bezahlt“", await b.warte("document.querySelector('[data-status]')?.dataset.status === 'bezahlt'", 30000), await b.js("document.querySelector('[data-status]')?.dataset.status"));
  pruefe("Beide App-Buchungen „in Lexware noch buchen“, Knopf „Als bezahlt markieren“ weg", (await b.js("document.querySelectorAll('[data-lex-buchen]').length")) === 2 && !(await b.js("!!document.querySelector('[data-aktion=bezahlt]')")));
  pruefe("Nächster Schritt: Zahlungsbestätigung für die Kartenzahlung", await b.warte("document.querySelector('[data-naechster-schritt]')?.innerText.includes('Zahlungsbestätigung erstellen')"));
  if (fotos) await b.foto(path.join(fotos, "zahlung-02-abschlag-bezahlt.png"));

  // Erneuter Abgleich: Lexware kennt die App-Zahlungen nicht; der Abschlag bleibt bezahlt, nichts doppelt
  await b.klick("[data-aktion=zahlungsstand]");
  await b.warte("document.readyState === 'complete'");
  a = await beleg(aId);
  const [{ n: nach }] = await dbAbfrage("select count(*)::int n from public.zahlung where beleg_id = $1 and deleted_at is null", [aId]);
  pruefe("Erneuter Abgleich: bezahlt, 2 Zahlungen, nichts doppelt", a.status === "bezahlt" && Number(a.offen_betrag) === 0 && nach === 2, `${a.status} ${a.offen_betrag} ${nach}`);

  // Auftrag: Finanzen „1 von 1 bezahlt“
  await b.gehe(`/auftraege/${ab.auftrag_id}`);
  pruefe("Auftrag: Abschläge „1 von 1 bezahlt“", await b.warte("document.querySelector('[data-finanzen=\"Abschlagsrechnungen\"]')?.innerText.includes('1 von 1 bezahlt')"));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  try {
    if (kunde) {
      await dbAbfrage("delete from public.zahlung where beleg_id in (select id from public.beleg where kunde_id = $1)", [kunde.id]);
      await belegeAufraeumen(kunde.id);
    }
  } catch (e) {
    console.error("Aufräumen Zahlungen:", e.message);
  }
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
