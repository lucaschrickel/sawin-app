// End-to-End-Test Belege (Schritt 1, ohne Lexware): Einstellungen Firma und Zahlungsbedingung, Angebot im Editor
// (Kunde, Positionen, optional, Summen, Vorschau), Fertigstellen mit PDF, Angenommen, AB aus dem Angebot (legt den
// Auftrag an, Nummer = AB-Nummer), Lieferschein aus der AB, Kette und Sprünge, Versionen („Als übergeben markieren“,
// Bearbeiten → Version 2), Ablehnen, Listen mit Vorschau-Leiste, Entwurf verwerfen, Abfrage bei ungespeicherten Änderungen.
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:belege   (optional FOTOS=<Ordner>)
import { writeFileSync } from "node:fs";
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin, belegeAufraeumen } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
const foto = async (name) => fotos && (await b.foto(path.join(fotos, `${name}.png`)));
/** PDF eines Belegs in den Fotoordner speichern (zur Sichtprüfung) */
const pdfSichern = async (id, name) => {
  if (!fotos) return;
  const b64 = await b.js(`fetch('/pdf/beleg/${id}').then((r) => r.arrayBuffer()).then((x) => { let s = ''; new Uint8Array(x).forEach((c) => (s += String.fromCharCode(c))); return btoa(s); })`);
  writeFileSync(path.join(fotos, `${name}.pdf`), Buffer.from(b64, "base64"));
};
let b;
let kunde;
let firmaVorher;
const kundeName = `Belegkunde ${lauf}`;
const zbName = `E2E 14 Tage ${lauf}`;
const beleg = async (id) => (await dbAbfrage("select * from public.beleg where id = $1", [id]))[0];
const belegId = async () => {
  // Erst nach dem Wechsel von /beleg/neu auf den gespeicherten Beleg (sonst „neu“ statt der ID)
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}/.test(location.pathname)", 20000);
  return b.js("location.pathname.split('/')[2]");
};
const text = () => b.js("document.querySelector('main').innerText");
const eingeben = async (sel, wert) => {
  await b.tippe(sel, wert);
  await sleep(60);
};

try {
  const admin = await testAdmin();
  [firmaVorher] = await dbAbfrage("select firma_name, strasse, plz, ort, telefon, email, website, iban, bic, bank_name, ust_id, steuernummer, geschaeftsfuehrung from public.einstellung");
  const { data: k } = await service.from("kunde").insert({ name: kundeName, strasse: "Teststraße 5", plz: "38524", ort: "Sassenburg", herkunft: "Website" }).select("id, nummer").single();
  kunde = k;
  merken("kunde", k.id);
  const { data: la } = await service.from("kunde_lieferadresse").insert({ kunde_id: k.id, bezeichnung: "Objekt", strasse: "Baustelle 9", plz: "38518", ort: "Gifhorn" }).select("id").single();
  merken("kunde_lieferadresse", la.id);

  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");
  pruefe("Seitenleiste: Alle Belege, Angebote, Lieferscheine sind Links", await b.warte("['/belege', '/belege/angebote', '/belege/lieferscheine'].every((h) => !!document.querySelector(`aside a[href=\"${h}\"]`))"));

  // 1. Einstellungen › Firma (Daten für den PDF-Fuß)
  await b.gehe("/einstellungen/firma");
  await b.da("[data-firma-formular]");
  await eingeben("[name=firma_name]", `Testfirma ${lauf}`);
  await eingeben("[name=strasse]", "Werkstraße 1");
  await eingeben("[name=plz]", "38524");
  await eingeben("[name=ort]", "Sassenburg");
  await eingeben("[name=iban]", "de02 1203 0000 0000 2020 51");
  await b.klickText("button", "Speichern");
  const firmaGespeichert = await b.warte("document.body.innerText.includes('Gespeichert.')");
  const [firma] = await dbAbfrage("select firma_name, iban from public.einstellung");
  pruefe("Firma gespeichert (IBAN normalisiert)", firmaGespeichert && firma.firma_name === `Testfirma ${lauf}` && firma.iban === "DE02 1203 0000 0000 2020 51", JSON.stringify(firma));

  // 2. Einstellungen › Belege: Zahlungsbedingung mit Platzhaltern, Standard für Angebot und AB
  await b.gehe("/einstellungen/belege");
  await b.klick("[data-neue-zahlungsbedingung]");
  await b.da("[role=dialog] [name=name]");
  await eingeben("[role=dialog] [name=name]", zbName);
  await b.js("document.querySelectorAll('[role=dialog] input[name=standard_fuer]').forEach((c) => { if (['angebot', 'auftragsbestaetigung'].includes(c.value)) c.click(); })");
  await b.klickText("[role=dialog] button", "Speichern");
  pruefe("Zahlungsbedingung angelegt", await b.warte(`!!document.querySelector('[data-zahlungsbedingung="${zbName}"]')`));
  const [zb] = await dbAbfrage("select id, standard_fuer from public.zahlungsbedingung where name = $1", [zbName]);
  if (zb) merken("zahlungsbedingung", zb.id);
  pruefe("Standard für Angebot und AB", zb && zb.standard_fuer.includes("angebot") && zb.standard_fuer.includes("auftragsbestaetigung"), JSON.stringify(zb));

  // 3. Neues Angebot: Editor direkt, Kunde wählen, Adresse und Objekt übernommen
  await b.gehe("/belege/angebote");
  await b.klick("[data-neu=angebot]");
  pruefe("„Neues Angebot“ öffnet direkt den Editor", await b.warte("location.pathname === '/beleg/neu' && !!document.querySelector('[data-beleg-editor=angebot]')"));
  pruefe("Zahlungsbedingung vorbelegt (Standard)", await b.js(`document.querySelector('[name=zahlungsbedingung]').selectedOptions[0]?.textContent === ${JSON.stringify(zbName)}`));
  await b.tippe("[data-kunde-suche]", kundeName.slice(0, 14));
  await b.warte(`[...document.querySelectorAll('#beleg-kunden button')].some((x) => x.innerText.includes(${JSON.stringify(kundeName)}))`);
  await b.js(`[...document.querySelectorAll('#beleg-kunden button')].find((x) => x.innerText.includes(${JSON.stringify(kundeName)})).click()`);
  pruefe(
    "Kunde gewählt: Adresse, Objekt aus Lieferadresse",
    await b.warte("document.querySelector('[name=adresse_strasse]').value === 'Teststraße 5' && document.querySelector('[name=objekt]').value === 'Baustelle 9, 38518 Gifhorn'"),
  );
  await eingeben("[name=titel]", "Haustür Familie Test");
  // Positionen: Haustür 2.500 €, Montage 4 Std × 65 €, optional Vordach 300 €
  await eingeben("[data-position='0'] [data-feld=titel]", "Haustür RC2");
  await eingeben("[data-position='0'] [data-feld=preis]", "2500");
  await b.klick("[data-neue-position]");
  await eingeben("[data-position='1'] [data-feld=titel]", "Montage");
  await eingeben("[data-position='1'] [data-feld=menge]", "4");
  await eingeben("[data-position='1'] [data-feld=preis]", "65");
  await b.klick("[data-neue-position]");
  await eingeben("[data-position='2'] [data-feld=titel]", "Vordach");
  await eingeben("[data-position='2'] [data-feld=preis]", "300");
  await b.js("document.querySelector(\"[data-position='2'] input[type=checkbox]\").click()");
  pruefe("Summen: optional zählt nicht (3.284,40 €)", await b.warte("document.querySelector('[data-gesamtbetrag]').textContent.includes('3.284,40')"), await b.js("document.querySelector('[data-gesamtbetrag]').textContent"));
  pruefe("ungespeicherte Änderungen angezeigt", (await b.js("document.querySelector('[data-speicherstand]').textContent")).includes("ungespeichert"));

  // 4. Abfrage beim Verlassen mit ungespeicherten Änderungen
  await b.js("document.querySelector('aside a[href=\"/kunden\"]').click()");
  pruefe("Verlassen fragt: Speichern | Verwerfen | Abbrechen", await b.warte("document.querySelector('[role=dialog]')?.innerText.includes('Ungespeicherte Änderungen')"));
  await b.klickText("[role=dialog] button", "Abbrechen");
  pruefe("Abbrechen bleibt im Editor", await b.warte("!document.querySelector('[role=dialog]') && location.pathname === '/beleg/neu'"));

  // 5. Vorschau (ungespeichert) und Entwurf speichern → Nummer, Anfrage im Hintergrund
  await b.klick("[data-aktion=vorschau]");
  pruefe("Vorschau zeigt das PDF", await b.warte("!!document.querySelector('[role=dialog] iframe[src^=\"blob:\"]')"));
  await b.taste("Escape", "Escape", 27);
  await b.warte("!document.querySelector('[role=dialog]')");
  await b.klick("[data-aktion=speichern]");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname)");
  const agId = await belegId();
  merken("beleg", agId);
  let ag = await beleg(agId);
  pruefe("Angebot hat schon als Entwurf seine Nummer (AG1…)", /^AG1\d{6}$/.test(ag?.nummer ?? ""), ag?.nummer);
  const [anfrage] = await dbAbfrage("select id, status, kunde_id from public.anfrage where id = $1", [ag.anfrage_id]);
  if (anfrage) merken("anfrage", anfrage.id);
  pruefe("Anfrage im Hintergrund angelegt (Angebot erstellen)", anfrage?.status === "angebot_erstellen" && anfrage.kunde_id === k.id, JSON.stringify(anfrage));
  const pos = await dbAbfrage("select titel, optional, menge::float, einzelpreis::float from public.beleg_position where beleg_id = $1 and deleted_at is null order by reihenfolge", [agId]);
  pruefe("3 Positionen gespeichert, Vordach optional", pos.length === 3 && pos[2].optional && Number(ag.summe_brutto) === 3284.4, JSON.stringify(pos));

  // 6. Fertigstellen → Offen, PDF abgelegt, Anfrage „Angebot versendet“
  await b.klick("[data-aktion=fertigstellen]");
  pruefe("Fertigstellen: Belegseite mit Status Offen", await b.warte("document.querySelector('[data-status]')?.dataset.status === 'offen'"));
  ag = await beleg(agId);
  pruefe("PDF abgelegt", !!ag.pdf_pfad && ag.pdf_pfad.startsWith(`${agId}/${ag.nummer}_Angebot`), ag.pdf_pfad);
  const pdfTyp = await b.js(`fetch('/pdf/beleg/${agId}').then((r) => r.headers.get('content-type') + ' ' + r.status)`);
  pruefe("PDF wird ausgeliefert", pdfTyp === "application/pdf 200", pdfTyp);
  const [q2] = await dbAbfrage("select status from public.anfrage where id = $1", [ag.anfrage_id]);
  pruefe("Anfrage: Angebot versendet", q2.status === "angebot_versendet");
  await foto("beleg-angebot");
  await pdfSichern(agId, "angebot");

  // 7. Angenommen → Auftragsbestätigung erstellen (Positionen übernommen, optionale nicht)
  await b.klick("[data-schritt=angenommen]");
  await b.warte("document.querySelector('[data-status]')?.dataset.status === 'angenommen'");
  pruefe("Angenommen", (await beleg(agId)).status === "angenommen");
  await b.klickText("[data-naechster-schritt] a", "Auftragsbestätigung erstellen");
  pruefe("AB-Editor aus dem Angebot", await b.warte("!!document.querySelector('[data-beleg-editor=auftragsbestaetigung]')"));
  pruefe("Hinweis: optionale Position nicht übernommen, 2 Positionen", (await text()).includes("optionale Position wurde nicht übernommen") && (await b.js("document.querySelectorAll('[data-position]').length")) === 2);
  await b.js("(() => { const i = document.querySelector('[name=leistung_von]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, '2026-12-07'); i.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await b.klick("[data-aktion=fertigstellen]");
  pruefe("AB fertiggestellt: Status Bestätigt", await b.warte("document.querySelector('[data-status]')?.dataset.status === 'bestaetigt'", 20000), await b.js("document.querySelector('[role=alert]')?.innerText ?? location.pathname"));
  const abId = await belegId();
  merken("beleg", abId);
  const ab = await beleg(abId);
  const [auftrag] = await dbAbfrage("select id, nummer, anfrage_id, kunde_id from public.auftrag where id = $1", [ab.auftrag_id]);
  if (auftrag) merken("auftrag", auftrag.id);
  pruefe("Auftrag entsteht mit der AB, Nummer = AB-Nummer (AB2…)", /^AB2\d{6}$/.test(ab.nummer) && auftrag?.nummer === ab.nummer && auftrag.anfrage_id === anfrage.id, `${ab.nummer} / ${auftrag?.nummer}`);
  const [q3] = await dbAbfrage("select archiv from public.anfrage where id = $1", [anfrage.id]);
  ag = await beleg(agId);
  pruefe("Kette wandert in den Auftrag, Anfrage gewonnen", ag.auftrag_id === auftrag.id && !ag.anfrage_id && q3.archiv === "gewonnen" && ag.kette_id === ab.kette_id);
  pruefe("Sprungleiste der Kette: AG › AB", await b.js(`[...document.querySelectorAll('[data-kette] a')].map((a) => a.textContent).join('|') === 'AG ${ag.nummer}|AB ${ab.nummer}'`));
  pruefe("AB bleibt bearbeitbar (kein Folgebeleg)", await b.js("!!document.querySelector('[data-aktion=bearbeiten]')"));

  // 8. Auftrag: Belege in Kettenfolge, Nächster Schritt Lieferschein, Auftragswert
  await b.klick("[data-sprung=auftrag]");
  await b.warte(`location.pathname === '/auftraege/${auftrag.id}'`);
  await b.da("[data-belege-kompakt]");
  pruefe("Auftrag zeigt AG und AB", await b.js(`[...document.querySelectorAll('[data-belege-kompakt] [data-beleg]')].map((x) => x.dataset.beleg).join() === '${agId},${abId}'`));
  pruefe("Auftragswert = AB (3.284,40 €)", (await b.js("document.querySelector('[data-auftragswert]').textContent")).includes("3.284,40"));
  await b.klickText("[data-schritte] a", "Lieferschein");
  pruefe("Lieferschein-Editor ohne Preise", await b.warte("!!document.querySelector('[data-beleg-editor=lieferschein]') && !document.querySelector('[data-summenleiste]')"));
  await b.klick("[data-aktion=fertigstellen]");
  pruefe("Lieferschein fertiggestellt (LS…)", await b.warte("document.querySelector('[data-status]')?.dataset.status === 'erstellt'", 20000));
  const lsId = await belegId();
  merken("beleg", lsId);
  const ls = await beleg(lsId);
  await pdfSichern(lsId, "lieferschein");
  pruefe("LS hängt an Auftrag und Kette", /^LS\d{4,}$/.test(ls.nummer) && ls.auftrag_id === auftrag.id && ls.kette_id === ab.kette_id, ls.nummer);
  await b.gehe(`/beleg/${abId}`);
  pruefe("AB jetzt „In Abwicklung“ und gesperrt", await b.warte("document.querySelector('[data-status]')?.dataset.status === 'in_abwicklung' && !document.querySelector('[data-aktion=bearbeiten]')"));

  // 9. Zweites Angebot: übergeben → Bearbeiten legt Version 2 an (Nummer bleibt), dann Ablehnen
  await b.gehe(`/beleg/neu?art=angebot&kunde=${k.id}`);
  await b.da("[data-beleg-editor=angebot]");
  await eingeben("[data-position='0'] [data-feld=titel]", "Fenster");
  await eingeben("[data-position='0'] [data-feld=preis]", "1000");
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("document.querySelector('[data-status]')?.dataset.status === 'offen'", 20000);
  const ag2Id = await belegId();
  merken("beleg", ag2Id);
  const ag2 = await beleg(ag2Id);
  const [anfrage2] = await dbAbfrage("select id from public.anfrage where id = $1", [ag2.anfrage_id]);
  if (anfrage2) merken("anfrage", anfrage2.id);
  await b.klick("[data-aktion=uebergeben]");
  await b.warte("document.body.innerText.includes('Version 1 als übergeben markiert')");
  pruefe("Als übergeben markiert: Version 1 eingefroren", (await dbAbfrage("select count(*)::int n from public.beleg_version where beleg_id = $1", [ag2Id]))[0].n === 1);
  await b.klick("[data-aktion=bearbeiten]");
  await b.warte("!!document.querySelector('[data-aktion=aenderungen-speichern]')");
  pruefe("Hinweis auf Version 2", (await text()).includes("Speichern legt Version 2 an"));
  await eingeben("[data-position='0'] [data-feld=preis]", "1100");
  await b.klick("[data-aktion=aenderungen-speichern]");
  await b.warte(`location.pathname === '/beleg/${ag2Id}'`);
  await b.warte("!!document.querySelector('[data-versionen]')");
  const ag2b = await beleg(ag2Id);
  pruefe("Version 2, gleiche Nummer, neuer Betrag", ag2b.version === 2 && ag2b.nummer === ag2.nummer && Number(ag2b.summe_brutto) === 1309, `${ag2b.version} ${ag2b.nummer} ${ag2b.summe_brutto}`);
  pruefe("Versionen: V2 offen, V1 übergeben", (await b.js("document.querySelector('[data-versionen]').innerText")).includes("noch nicht übergeben"));
  await b.klick("[data-schritt=abgelehnt]");
  pruefe("Abgelehnt: Vorschlag, die Anfrage als verloren zu archivieren", await b.warte("document.querySelector('[role=dialog]')?.innerText.includes('Alle Angebote abgelehnt')"));
  await b.klickText("[role=dialog] button", "Nein");
  pruefe("Status abgelehnt", (await beleg(ag2Id)).status === "abgelehnt");

  // 10. Listen: Alle Belege mit Art-Filter, Klick wählt, Vorschau-Leiste mit zugehörigen Belegen, Doppelklick öffnet
  await b.gehe(`/belege?q=${encodeURIComponent(kundeName)}`);
  await b.da("[data-belegliste]");
  pruefe("Alle Belege: Schnellfilter mit Anzahl", await b.js("[...document.querySelectorAll('[data-art-filter] button')].some((x) => x.innerText.startsWith('Angebot'))"));
  pruefe("Liste zeigt die 4 Belege des Kunden", (await b.js("document.querySelectorAll('[data-beleg-zeile]').length")) === 4);
  await b.klick(`[data-beleg-zeile="${abId}"]`);
  pruefe("Klick wählt: Vorschau-Leiste der AB mit Zugehörigen Belegen", await b.warte(`!!document.querySelector('[data-vorschau="${abId}"] [data-zugehoerig]') && document.querySelector('[data-vorschau="${abId}"] [data-zugehoerig]').innerText.includes('${ls.nummer}')`));
  pruefe("verkleinerte PDF-Vorschau", await b.js("!!document.querySelector('[data-pdf-kachel] iframe')"));
  // AB mit Lieferschein ist gesperrt: Kachel zeigt das an, Klick nur mit Hinweis
  const kachel = `[data-vorschau="${abId}"] [data-pdf-kachel]`;
  pruefe(
    "Kachel gesperrt: Sperr-Mauszeiger und Tooltip „Nicht mehr bearbeitbar“",
    await b.js(`(() => { const k = document.querySelector('${kachel}'); return k.dataset.bearbeitbar === 'nein' && k.title === 'Nicht mehr bearbeitbar' && getComputedStyle(k).cursor === 'not-allowed'; })()`),
  );
  await b.klick(kachel);
  pruefe("Klick auf gesperrte Kachel: Hinweis, keine Bearbeitung", await b.warte("document.querySelector('[data-kachel-hinweis]')?.innerText === 'Nicht mehr bearbeitbar'") && (await b.js("location.pathname")) === "/belege");
  await foto("belege-liste");
  // Spaltenbreiten der Belegliste: per Tastatur ändern, je Benutzer gespeichert, zurücksetzen
  const listenGriff = "[data-belegliste] [data-spalten-griff='Betrag']";
  await b.js(`document.querySelector("${listenGriff}").focus()`);
  await b.taste("ArrowRight", "ArrowRight", 39);
  await b.taste("ArrowRight", "ArrowRight", 39);
  pruefe("Belegliste: Betrag 136 px", (await b.js(`document.querySelector("${listenGriff}").getAttribute('aria-valuenow')`)) === "136");
  const listenBreite = async () => (await dbAbfrage("select spaltenbreiten->'beleg_liste'->>'betrag' v from public.benutzer_einstellung where benutzer_id = $1", [admin.id]))[0]?.v;
  let lb = null;
  for (let i = 0; i < 40 && lb !== "136"; i++) {
    lb = await listenBreite();
    if (lb !== "136") await sleep(250);
  }
  pruefe("Belegliste: Breite je Benutzer gespeichert", lb === "136", String(lb));
  await b.klick("[data-spalten-zuruecksetzen]");
  pruefe("Belegliste: Spalten zurückgesetzt", await b.warte(`document.querySelector("${listenGriff}").getAttribute('aria-valuenow') === '120'`));
  await b.js(`document.querySelector('[data-beleg-zeile="${lsId}"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  pruefe("Doppelklick öffnet den Beleg", await b.warte(`location.pathname === '/beleg/${lsId}'`));

  // 11. Entwurf verwerfen (Markierung, Nummer wird nicht wiederverwendet)
  await b.gehe(`/beleg/neu?art=angebot&kunde=${k.id}`);
  await b.da("[data-beleg-editor=angebot]");
  await eingeben("[data-position='0'] [data-feld=titel]", "Wird verworfen");
  await b.klick("[data-aktion=speichern]");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname)");
  const entwurfId = await belegId();
  merken("beleg", entwurfId);

  // Spaltenbreiten der Positionstabelle: per Tastatur ändern, je Benutzer gespeichert, nach dem Neuladen erhalten, zurücksetzen
  const griff = "[data-spalten-griff='Menge']";
  // Nach dem Speichern lädt die Belegseite; der alte Editor bleibt versteckt im DOM
  await b.warte(`[...document.querySelectorAll("${griff}")].some((x) => x.getClientRects().length)`, 30000);
  pruefe("Spaltengriff: Trenner mit Wert 64", (await b.js(`[...document.querySelectorAll("${griff}")].find((x) => x.getClientRects().length).getAttribute('aria-valuenow')`)) === "64");
  await b.js(`[...document.querySelectorAll("${griff}")].find((x) => x.getClientRects().length).focus()`);
  for (let i = 0; i < 3; i++) await b.taste("ArrowRight", "ArrowRight", 39);
  pruefe("Pfeil rechts: Menge 88 px", (await b.js(`[...document.querySelectorAll("${griff}")].find((x) => x.getClientRects().length).getAttribute('aria-valuenow')`)) === "88");
  const spalten = async () => (await dbAbfrage("select spaltenbreiten from public.benutzer_einstellung where benutzer_id = $1", [admin.id]))[0]?.spaltenbreiten?.beleg_positionen;
  let gemerkt = null;
  for (let i = 0; i < 40 && gemerkt?.menge !== 88; i++) {
    gemerkt = await spalten();
    if (gemerkt?.menge !== 88) await sleep(250);
  }
  pruefe("Breite je Benutzer gespeichert", gemerkt?.menge === 88, JSON.stringify(gemerkt));
  await b.js(`[...document.querySelectorAll("[data-spalten-griff='Einheit']")].find((x) => x.getClientRects().length).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  pruefe("Doppelklick: Einheit passend (innerhalb der Grenzen)", await b.warte(`(() => { const v = Number([...document.querySelectorAll("[data-spalten-griff='Einheit']")].find((x) => x.getClientRects().length).getAttribute('aria-valuenow')); return v >= 56 && v <= 220 && v !== 84; })()`));
  await b.gehe(`/beleg/${entwurfId}`);
  await b.da("[data-beleg-editor=angebot]");
  pruefe("nach dem Neuladen: Menge weiter 88 px", (await b.js(`[...document.querySelectorAll("${griff}")].find((x) => x.getClientRects().length).getAttribute('aria-valuenow')`)) === "88");
  await b.klick("[data-spalten-zuruecksetzen]");
  pruefe("Spalten zurücksetzen: Standard, Eintrag entfernt", await b.warte(`[...document.querySelectorAll("${griff}")].find((x) => x.getClientRects().length).getAttribute('aria-valuenow') === '64' && !document.querySelector('[data-spalten-zuruecksetzen]')`));
  gemerkt = 1;
  for (let i = 0; i < 40 && gemerkt; i++) {
    gemerkt = await spalten();
    if (gemerkt) await sleep(250);
  }
  pruefe("gespeicherte Breiten entfernt", !gemerkt, JSON.stringify(gemerkt));

  // Kachel des Entwurfs in der Liste: Klick öffnet die Bearbeitung
  await b.gehe(`/belege/angebote?q=${encodeURIComponent(kundeName)}&id=${entwurfId}`);
  const kachelEntwurf = `[data-vorschau="${entwurfId}"] [data-pdf-kachel]`;
  await b.da(kachelEntwurf);
  pruefe("Kachel bearbeitbar: Hand-Mauszeiger und Tooltip", await b.js(`(() => { const k = document.querySelector('${kachelEntwurf}'); return k.dataset.bearbeitbar === 'ja' && k.title === 'Klicken zum Bearbeiten' && getComputedStyle(k).cursor === 'pointer'; })()`));
  await b.klick(kachelEntwurf);
  pruefe("Klick auf die Kachel öffnet die Bearbeitung", await b.warte(`location.pathname === '/beleg/${entwurfId}' && !!document.querySelector('[data-beleg-editor=angebot]')`));
  await b.da("[data-aktion=verwerfen]");
  await b.klick("[data-aktion=verwerfen]");
  await b.warte("document.querySelector('[role=dialog]')?.innerText.includes('nicht wiederverwendet')");
  await b.klickText("[role=dialog] button", "Verwerfen");
  await b.warte("location.pathname === '/belege/angebote'");
  const verworfen = await beleg(entwurfId);
  pruefe("Entwurf verworfen (deleted_at gesetzt)", !!verworfen.deleted_at, String(verworfen.deleted_at));
  const [q4] = await dbAbfrage("select id from public.anfrage where id = $1", [verworfen.anfrage_id]);
  if (q4) merken("anfrage", q4.id);

  // 12. Aufträge: Liste mit AB-Vorschau, Anfrage-Seite zeigt Hinweis
  await b.gehe(`/auftraege?q=${encodeURIComponent(kundeName)}`);
  pruefe("Aufträge: Spaltengriffe in der Liste", await b.warte("!!document.querySelector(\"[data-spalten-griff='Wert']\") && !!document.querySelector(\"[data-spalten-griff='Status']\")"));
  pruefe("Aufträge: Wert aus der AB und AB in der Vorschau", await b.warte(`(document.querySelector('[data-wert]')?.textContent ?? '').includes('3.284,40') && !!document.querySelector('[data-vorschau="${abId}"]')`));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  // Aufräumen: Belege des Testkunden mit Positionen, Versionen, Versand und PDFs; Firmendaten zurücksetzen
  try {
    // gemeinsame Hilfe: Belege, PDFs, OneDrive-Ablage bzw. Zwischenspeicher, Aufträge, Anfragen des Testkunden
    if (kunde) await belegeAufraeumen(kunde.id).catch((e) => console.error("Aufräumen Belege:", e.message));
    if (firmaVorher) await service.from("einstellung").update(firmaVorher).eq("einzig", true);
  } catch (e) {
    console.error("Aufräumen Belege:", e.message);
  }
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
