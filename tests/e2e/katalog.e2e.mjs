// End-to-End-Test Artikelkatalog, Textvorlagen und formatierte Beschreibungen (ohne Lexware):
// Einstellungen › Belege & Artikel: Artikel mit formatierter Beschreibung und Stern, Textvorlage als Standard;
// neues Angebot: Einleitung aus der Standard-Vorlage, Artikel per Schnellauswahl und aus dem Katalog, Beschreibung
// formatieren (kursiv, Aufzählung, Farbe), andere Vorlage wählen, Speichern (bereinigtes HTML), PDF.
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:katalog   (optional FOTOS=<Ordner>)
import path from "node:path";
import { aufraeumen, belegeAufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;
let kunde;
const artikelName = `Haustür Test ${lauf}`;
const artikel2 = `Montage Test ${lauf}`;
const vorlageName = `Einleitung Test ${lauf}`;
const vorlageText = `Guten Tag, Vorlage ${lauf}.`;

/** Text in ein formatierbares Feld (TipTap) tippen: Fokus setzen, alles markieren, ersetzen */
async function richTippen(sel, text) {
  await b.klick(`${sel} .ProseMirror`);
  await b.js(`(() => { const el = document.querySelector(${JSON.stringify(`${sel} .ProseMirror`)}); el.focus(); document.getSelection().selectAllChildren(el); })()`);
  await sleep(80);
  await b.cdp("Input.insertText", { text });
  await sleep(150);
}
/** Ganzen Inhalt des Felds markieren und einen Knopf der Format-Leiste drücken */
async function formatieren(sel, format) {
  await b.js(`(() => { const el = document.querySelector(${JSON.stringify(`${sel} .ProseMirror`)}); el.focus(); document.getSelection().selectAllChildren(el); })()`);
  await sleep(80);
  await b.klick(`${sel} [data-format=${format}]`);
  await sleep(120);
}

try {
  const admin = await testAdmin();
  const { data: k } = await service.from("kunde").insert({ name: `Katalogkunde ${lauf}`, strasse: "Weg 1", plz: "38518", ort: "Gifhorn" }).select("id").single();
  kunde = k;
  merken("kunde", k.id);

  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // 1. Artikel mit formatierter Beschreibung und Stern
  await b.gehe("/einstellungen/belege");
  pruefe("Reiter „Belege & Artikel“ mit Katalog", await b.warte("document.body.innerText.includes('Belege & Artikel') && !!document.querySelector('[data-artikelkatalog]')"));
  await b.klick("[data-neuer-artikel]");
  await b.da("[data-artikel-formular]");
  await b.tippe("[data-artikel-formular] [name=bezeichnung]", artikelName);
  await b.tippe("[data-artikel-formular] [name=einheit]", "Stk");
  await b.tippe("[data-artikel-formular] [name=preis_netto]", "1.250,00");
  await richTippen("[data-artikel-formular] [data-richtext]", "RC2 Sicherheitsbeschlag");
  await formatieren("[data-artikel-formular] [data-richtext]", "bold");
  await b.js("document.querySelector('[data-artikel-formular] [name=schnellauswahl]').click()");
  await b.klickText("[data-artikel-formular] button", "Speichern");
  pruefe("Artikel angelegt", await b.warte(`!!document.querySelector('[data-artikel="${artikelName}"]')`));
  const [a1] = await dbAbfrage("select id, preis_netto::float preis, beschreibung_html, schnellauswahl from public.artikel where bezeichnung = $1", [artikelName]);
  if (a1) merken("artikel", a1.id);
  pruefe("Artikel: Preis, Stern, fette Beschreibung als bereinigtes HTML", a1?.preis === 1250 && a1.schnellauswahl && /^<p><strong>RC2 Sicherheitsbeschlag<\/strong><\/p>$/.test(a1.beschreibung_html ?? ""), JSON.stringify(a1));
  // zweiter Artikel ohne Stern (nur über den Katalog)
  await b.klick("[data-neuer-artikel]");
  await b.da("[data-artikel-formular]");
  await b.tippe("[data-artikel-formular] [name=bezeichnung]", artikel2);
  await b.tippe("[data-artikel-formular] [name=einheit]", "Std");
  await b.tippe("[data-artikel-formular] [name=preis_netto]", "68");
  await b.klickText("[data-artikel-formular] button", "Speichern");
  await b.warte(`!!document.querySelector('[data-artikel="${artikel2}"]')`);
  const [a2] = await dbAbfrage("select id from public.artikel where bezeichnung = $1", [artikel2]);
  if (a2) merken("artikel", a2.id);

  // 2. Textvorlage Einleitung für Angebote, Standard
  await b.klick("[data-neue-textvorlage]");
  await b.da("[data-textvorlage-formular]");
  await b.tippe("[data-textvorlage-formular] [name=name]", vorlageName);
  await b.tippe("[data-textvorlage-formular] [name=text]", vorlageText);
  await b.js("document.querySelector('[data-textvorlage-formular] input[name=belegarten][value=angebot]').click(); document.querySelector('[data-textvorlage-formular] [name=standard]').click()");
  await b.klickText("[data-textvorlage-formular] button", "Speichern");
  pruefe("Textvorlage angelegt", await b.warte(`!!document.querySelector('[data-textvorlage="${vorlageName}"]')`));
  const [v1] = await dbAbfrage("select id, standard, belegarten from public.textvorlage where name = $1", [vorlageName]);
  if (v1) merken("textvorlage", v1.id);
  // Standard-Vorlagen anderer Tests nicht stören: zweite (nicht Standard) Vorlage zum Wechseln
  const { data: v2 } = await service.from("textvorlage").insert({ feld: "einleitung", name: `Zweite ${lauf}`, text: `Zweite Einleitung ${lauf}`, belegarten: ["angebot"], standard: false }).select("id").single();
  merken("textvorlage", v2.id);
  if (fotos) await b.foto(path.join(fotos, "katalog-01-einstellungen.png"));

  // 3. Neues Angebot: Einleitung aus der Standard-Vorlage, Schnellauswahl, Katalog
  await b.gehe(`/beleg/neu?art=angebot&kunde=${k.id}`);
  await b.da("[data-beleg-editor=angebot]");
  pruefe("Einleitung aus der Standard-Vorlage", await b.warte(`document.querySelector('[name=einleitung]').value === ${JSON.stringify(vorlageText)}`), await b.js("document.querySelector('[name=einleitung]').value"));
  pruefe("Schnellauswahl zeigt nur den Artikel mit Stern", await b.warte(`!!document.querySelector('[data-artikel-knopf="${artikelName}"]') && !document.querySelector('[data-artikel-knopf="${artikel2}"]')`));
  await b.klick(`[data-artikel-knopf="${artikelName}"]`);
  pruefe(
    "Artikel ersetzt die leere erste Position (Titel, Preis, Einheit, Beschreibung)",
    await b.warte(`document.querySelectorAll('[data-position]').length === 1 && document.querySelector("[data-position='0'] [data-feld=titel]").value === ${JSON.stringify(artikelName)} && document.querySelector("[data-position='0'] [data-feld=preis]").value === '1250' && document.querySelector("[data-position='0'] .ProseMirror strong")?.textContent === 'RC2 Sicherheitsbeschlag'`),
    await b.js("document.querySelector(\"[data-position='0'] [data-feld=preis]\")?.value"),
  );
  await b.klick("[data-katalog]");
  await b.da("[data-katalog-liste]");
  await b.js(`[...document.querySelectorAll('[data-katalog-liste] button')].find((x) => x.innerText.includes(${JSON.stringify(artikel2)})).click()`);
  pruefe("Artikel aus dem Katalog angefügt", await b.warte(`document.querySelectorAll('[data-position]').length === 2 && document.querySelector("[data-position='1'] [data-feld=titel]").value === ${JSON.stringify(artikel2)}`));
  pruefe("Summe 1.318 € netto → 1.568,42 € brutto", await b.warte("document.querySelector('[data-gesamtbetrag]').textContent.includes('1.568,42')"), await b.js("document.querySelector('[data-gesamtbetrag]').textContent"));

  // 4. Beschreibung der zweiten Position formatieren: kursiv, Aufzählung, Farbe
  const sel2 = "[data-position='1'] [data-richtext]";
  await richTippen(sel2, "Montage inkl. Abdichtung");
  await formatieren(sel2, "italic");
  await formatieren(sel2, "bulletList");
  await formatieren(sel2, "farbe-rot");
  pruefe("Format-Leiste schwebt beim Fokus über dem Feld", await b.js(`!!document.querySelector(${JSON.stringify(`${sel2} [role=toolbar]`)})`));
  if (fotos) await b.foto(path.join(fotos, "katalog-02-editor.png"));

  // 5. Andere Vorlage wählen
  await b.klick("[data-vorlage-wahl=Einleitung]");
  await b.klickText("button", `Zweite ${lauf}`);
  pruefe("Vorlage gewählt: Einleitung ersetzt", await b.warte(`document.querySelector('[name=einleitung]').value === ${JSON.stringify(`Zweite Einleitung ${lauf}`)}`));

  // 6. Speichern: bereinigtes HTML, PDF
  await b.klick("[data-aktion=speichern]");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname)");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}/.test(location.pathname)", 20000);
  const id = await b.js("location.pathname.split('/')[2]");
  const pos = await dbAbfrage("select titel, beschreibung_html from public.beleg_position where beleg_id = $1 and deleted_at is null order by reihenfolge", [id]);
  pruefe("Gespeichert: Beschreibung 1 fett, Beschreibung 2 kursiv, Aufzählung, Farbe", pos.length === 2 && /<strong>/.test(pos[0].beschreibung_html) && /<ul><li><p>.*<em>.*Montage inkl\. Abdichtung/.test(pos[1].beschreibung_html) && /color:(#a33a2e|rgb\(163, 58, 46\))/.test(pos[1].beschreibung_html), JSON.stringify(pos));
  const pdf = await b.js(`fetch('/pdf/beleg/${id}').then(async (r) => r.status + ' ' + r.headers.get('content-type') + ' ' + (await r.arrayBuffer()).byteLength)`);
  pruefe("PDF mit formatierter Beschreibung erzeugt", /^200 application\/pdf \d{4,}/.test(pdf), pdf);
  if (fotos) {
    const b64 = await b.js(`fetch('/pdf/beleg/${id}').then((r) => r.arrayBuffer()).then((x) => { let s = ''; new Uint8Array(x).forEach((c) => (s += String.fromCharCode(c))); return btoa(s); })`);
    (await import("node:fs")).writeFileSync(path.join(fotos, "katalog-03-angebot.pdf"), Buffer.from(b64, "base64"));
  }
  // nach dem Neuladen bleibt die Formatierung im Editor
  await b.gehe(`/beleg/${id}`);
  pruefe("Nach dem Neuladen: Formatierung im Editor", await b.warte("!!document.querySelector(\"[data-position='1'] .ProseMirror ul li em\")"));
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  try {
    if (kunde) await belegeAufraeumen(kunde.id);
  } catch (e) {
    console.error("Aufräumen Katalog:", e.message);
  }
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
