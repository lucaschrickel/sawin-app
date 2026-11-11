// End-to-End-Test Formulare & Protokolle: Aufmaßblatt an der Anfrage (automatisch speichern, Zeilen, Abschließen,
// PDF, „In Angebot übernehmen“, PDF wartet auf den Ordner des ersten Angebots), mit der AB in den Auftrag, Reiter
// „Formulare & Protokolle“ am Auftrag (Protokoll drucken, Scan hochladen, Nachtragsangebot aus dem Aufmaß, Entfernen,
// Wieder öffnen) und am Ticket (Servicebericht zuerst).
// Aufruf: App ohne Microsoft-Zugang starten (Dateien bleiben im Zwischenspeicher), z. B.
//   MS_GRAPH_TENANT_ID= MS_GRAPH_CLIENT_ID= MS_GRAPH_CLIENT_SECRET= npx next start -p 3100
//   APP_URL=http://localhost:3100 npm run test:formulare
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { aufraeumen, belegeAufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;
let kunde;
const kundeName = `Formularkunde ${lauf}`;

async function warteDb(sql, werte, pruef, versuche = 60) {
  for (let i = 0; i < versuche; i++) {
    const z = await dbAbfrage(sql, werte);
    if (pruef(z)) return z;
    await sleep(250);
  }
  return null;
}
/** Wert in ein Auswahlfeld setzen (React hört auf „change“) */
const waehle = (sel, wert) =>
  b.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(el, ${JSON.stringify(wert)}); el.dispatchEvent(new Event("change", { bubbles: true })); return el.value; })()`);
/** PDF im Browser (mit Sitzung) abrufen: Typ und Anfang */
const pdfHolen = async (id, datei) => {
  const r = await b.js(`fetch("/pdf/formular/${id}").then(async (r) => { const t = new Uint8Array(await r.arrayBuffer()); let s = ""; for (const x of t) s += String.fromCharCode(x); return { status: r.status, typ: r.headers.get("content-type"), anfang: s.slice(0, 5), groesse: t.length, b64: btoa(s) }; })`);
  if (fotos && datei && r?.b64) writeFileSync(path.join(fotos, datei), Buffer.from(r.b64, "base64"));
  if (r) delete r.b64;
  return r;
};
const gespeichert = () => b.warte("document.querySelector('[data-speicherstand]')?.dataset.speicherstand === 'ok' && document.querySelector('[data-speicherstand]').innerText.startsWith('Gespeichert')", 20000);

try {
  const admin = await testAdmin();
  ({ data: kunde } = await service.from("kunde").insert({ name: kundeName, telefon: "0511 123456", strasse: "Testweg 1", plz: "30159", ort: "Hannover" }).select("id").single());
  merken("kunde", kunde.id);
  const { data: anfrage } = await service.from("anfrage").insert({ titel: `Fenster ${lauf}`, kunde_id: kunde.id, objekt: "Testweg 1, 30159 Hannover", produkte: ["Fenster", "Haustür"] }).select("id, nummer").single();
  for (const a of [
    { bezeichnung: "Kunststofffenster 3-fach verglast", einheit: "Stk", preis_netto: 480, beschreibung_html: "<p>Uw 0,9</p>" },
    { bezeichnung: "Montage pauschal", einheit: "Pauschal", preis_netto: 350 },
  ]) {
    const { data } = await service.from("artikel").insert(a).select("id").single();
    merken("artikel", data.id);
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), "formulare-"));
  const scan = path.join(tmp, `Scan ${lauf}.pdf`);
  writeFileSync(scan, Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(3000, 65)]));

  b = await browser();
  await b.anmelden(admin);

  // 1. Anfrage: Karte „Aufmaßblatt“ → Aufmaß erfassen öffnet den Editor
  await b.gehe(`/anfragen/${anfrage.id}`);
  pruefe("Anfrage: Karte Aufmaßblatt ohne Aufmaß", await b.enthaelt("Noch kein Aufmaß."));
  await b.klick("[data-aufmass-neu]");
  pruefe("Editor öffnet direkt", await b.warte("/^\\/formulare\\/[0-9a-f-]{36}$/.test(location.pathname) && !!document.querySelector('[data-aufmass-editor]')"));
  const fid = await b.js("location.pathname.split('/')[2]");
  pruefe("… mit einer leeren Zeile (Fenster)", await b.warte("document.querySelectorAll('[data-aufmass-zeile]').length === 1 && document.querySelector('[data-aufmass-zeile] [name=element]').value === 'Fenster'"));

  // 2. Eingaben speichern automatisch
  await b.tippe("[data-aufmass-zeile] [name=raum]", "Küche");
  await b.tippe("[data-aufmass-zeile] [name=breite]", "1230");
  await b.tippe("[data-aufmass-zeile] [name=hoehe]", "1480");
  await b.tippe("[data-aufmass-zeile] [name=anzahl]", "2");
  await waehle("[data-aufmass-zeile] [name=anschlag]", "DIN links");
  await b.klick("[data-aufmass-zeile-neu]");
  pruefe("Neue Zeile übernimmt den Raum, Fokus im Raum", await b.warte("document.querySelectorAll('[data-aufmass-zeile]').length === 2 && document.activeElement?.name === 'raum' && document.activeElement.value === 'Küche'"));
  await b.tippe("[data-aufmass-zeile]:nth-child(2) [name=raum]", "Flur");
  await waehle("[data-aufmass-zeile]:nth-child(2) [name=element]", "Haustür");
  await b.tippe("[data-aufmass-zeile]:nth-child(2) [name=breite]", "1100");
  await b.tippe("[data-aufmass-zeile]:nth-child(2) [name=hoehe]", "2100");
  await b.klick("[data-aufmass-zeile-neu]");
  await b.tippe("[data-aufmass-zeile]:nth-child(3) [name=bemerkung]", "wird wieder entfernt");
  await b.tippe("[name=hinweise]", "Zugang nur über den Garten");
  pruefe("Speicherstand „Gespeichert hh:mm“", await gespeichert());
  const z1 = await warteDb("select raum, element, breite_mm, hoehe_mm, anzahl, anschlag, bemerkung from public.aufmass_zeile where formular_id = $1 and deleted_at is null order by reihenfolge", [fid], (r) => r.length === 3 && r[1].hoehe_mm === 2100);
  pruefe("Zeilen in der Datenbank", !!z1 && z1[0].raum === "Küche" && z1[0].breite_mm === 1230 && z1[0].anzahl === 2 && z1[0].anschlag === "DIN links" && z1[1].element === "Haustür", JSON.stringify(z1));
  pruefe("Summe der Elemente", await b.warte("document.querySelector('[data-aufmass-summe]')?.dataset.aufmassSumme === '4'"));
  await b.klick("[data-aufmass-zeile]:nth-child(3) [data-aufmass-zeile-weg]");
  pruefe("Zeile entfernt: nur als gelöscht markiert", !!(await warteDb("select count(*) filter (where deleted_at is null)::int n, count(*)::int alle from public.aufmass_zeile where formular_id = $1", [fid], (r) => r[0].n === 2 && r[0].alle === 3)));
  await gespeichert();
  await b.gehe(`/formulare/${fid}`);
  pruefe("Nach dem Neuladen: Eingaben da", await b.warte("document.querySelectorAll('[data-aufmass-zeile]').length === 2 && document.querySelector('[name=hinweise]').value === 'Zugang nur über den Garten' && document.querySelector('[data-aufmass-zeile]:nth-child(2) [name=hoehe]').value === '2100'"));
  if (fotos) await b.foto(path.join(fotos, "aufmass-editor.png"));

  // 3. PDF (im Entwurf mit Wasserzeichen) und Abschließen
  const pdf1 = await pdfHolen(fid, "aufmass.pdf");
  pruefe("PDF des Aufmaßes", pdf1?.status === 200 && pdf1.typ === "application/pdf" && pdf1.anfang === "%PDF-" && pdf1.groesse > 5000, JSON.stringify(pdf1));
  await b.klick("[data-aufmass-abschliessen]");
  pruefe("Abgeschlossen: Hinweis, dass das PDF mit dem ersten Angebot in den Ordner kommt", await b.warte("document.querySelector('[data-aufmass-meldung]')?.innerText.includes('sobald das erste Angebot')", 20000));
  pruefe("… Status und gesperrte Felder", await b.warte("document.querySelector('[data-formular-status]')?.dataset.formularStatus === 'abgeschlossen' && document.querySelector('[name=raum]').disabled && !document.querySelector('[data-aufmass-zeile-neu]')"));
  await sleep(1500);
  pruefe("Ohne Angebot kein Ordner und kein PDF in der Ablage", (await dbAbfrage("select count(*)::int n from public.ablage_ordner where anfrage_id = $1", [anfrage.id]))[0].n === 0 && (await dbAbfrage("select count(*)::int n from public.ablage_datei where formular_id = $1", [fid]))[0].n === 0);

  // 4. In Angebot übernehmen: Positionen aus dem Katalog mit Maß, Zusatzartikel, Hinweis
  await b.klick("[data-aufmass-angebot]");
  pruefe("Angebots-Editor mit Bezug Aufmaß", await b.warte(`location.search.includes("aufmass=${fid}") && !!document.querySelector("[data-beleg-editor=angebot]")`, 20000));
  pruefe("Position 1: Katalogartikel mit Maß", await b.warte("document.querySelector(\"[data-position='0'] [data-feld=titel]\")?.value === 'Kunststofffenster 3-fach verglast, 1.230 × 1.480 mm'"), await b.js("document.querySelector(\"[data-position='0'] [data-feld=titel]\")?.value"));
  pruefe("Position 2: Element ohne Katalogartikel", await b.js("document.querySelector(\"[data-position='1'] [data-feld=titel]\")?.value === 'Haustür, 1.100 × 2.100 mm'"));
  pruefe("Position 3: Montage pauschal", await b.js("document.querySelector(\"[data-position='2'] [data-feld=titel]\")?.value === 'Montage pauschal'"));
  pruefe("Hinweis „Preise prüfen“", await b.enthaelt("Bitte Preise prüfen"));
  await b.klick("[data-aktion=speichern]");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname)", 20000);
  const agId = await b.js("location.pathname.split('/')[2]");
  const [ag] = await dbAbfrage("select nummer, anfrage_id, kommentar_intern from public.beleg where id = $1", [agId]);
  pruefe("Angebot an der Anfrage, Kommentar mit Herkunft", ag?.anfrage_id === anfrage.id && /Aufmaß vom/.test(ag.kommentar_intern ?? ""), JSON.stringify(ag));
  const datei = await warteDb("select name, unterordner, quelle, status from public.ablage_datei where formular_id = $1 and deleted_at is null", [fid], (r) => r.length === 1, 80);
  pruefe("Mit dem Ordner des ersten Angebots: Aufmaß-PDF nach „03 Aufmaß - Freigabe“", !!datei && datei[0].unterordner === "03 Aufmaß - Freigabe" && datei[0].quelle === "formular" && datei[0].name === `${ag.nummer}_Aufmassblatt_Formularkunde_${lauf}.pdf`, JSON.stringify(datei));

  // 5. Angebot fertig, AB: Auftrag entsteht, das Aufmaß wandert mit
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("document.querySelector('[data-status]')?.dataset.status === 'offen'", 30000);
  await b.klick("[data-schritt=angenommen]");
  await b.klickText("[data-naechster-schritt] a", "Auftragsbestätigung erstellen");
  await b.da("[data-beleg-editor=auftragsbestaetigung]");
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("!!document.querySelector('[data-sprung=auftrag]')", 30000);
  const [ab] = await dbAbfrage("select nummer, auftrag_id from public.beleg where art = 'auftragsbestaetigung' and kunde_id = $1", [kunde.id]);
  const [fz] = await dbAbfrage("select anfrage_id, auftrag_id from public.formular where id = $1", [fid]);
  pruefe("Mit der AB wandert das Aufmaß in den Auftrag", fz.auftrag_id === ab.auftrag_id && fz.anfrage_id === null, JSON.stringify(fz));
  await b.gehe(`/anfragen/${anfrage.id}`);
  pruefe("Anfrage verweist auf das Aufmaß im Auftrag", await b.enthaelt(`Das Aufmaß liegt jetzt im Auftrag ${ab.nummer}`));

  // 6. Auftrag: Reiter „Formulare & Protokolle“
  await b.gehe(`/auftraege/${ab.auftrag_id}`);
  await b.klickText("nav[aria-label=Bereiche] a", "Formulare & Protokolle");
  pruefe("Reiter zeigt Knöpfe in Reihenfolge Aufmaß, Montage, Übergabe, Service", await b.warte("JSON.stringify([...document.querySelectorAll('[data-formular-knoepfe] button')].map((x) => x.dataset.protokollDrucken ?? 'aufmass')) === JSON.stringify(['aufmass', 'montageprotokoll', 'uebergabeprotokoll', 'servicebericht'])"));
  pruefe("… und das Aufmaß mit Status und Ablage", await b.warte(`document.querySelector('[data-formular="${fid}"] [data-formular-status]')?.dataset.formularStatus === 'abgeschlossen' && document.querySelector('[data-formular="${fid}"]').innerText.includes('3 Elemente')`));
  await b.klick("[data-protokoll-drucken=montageprotokoll]");
  const prot = await warteDb("select id, status from public.formular where auftrag_id = $1 and typ = 'montageprotokoll' and deleted_at is null", [ab.auftrag_id], (r) => r.length === 1);
  pruefe("Montageprotokoll drucken: Formular „Gedruckt“", prot?.[0].status === "gedruckt");
  const pid = prot[0].id;
  pruefe("… erscheint in der Liste", await b.warte(`document.querySelector('[data-formular="${pid}"] [data-formular-status]')?.dataset.formularStatus === 'gedruckt'`, 20000));
  const pdf2 = await pdfHolen(pid, "montageprotokoll.pdf");
  pruefe("Vorlage als PDF", pdf2?.status === 200 && pdf2.anfang === "%PDF-" && pdf2.groesse > 5000, JSON.stringify(pdf2));

  // Scan hochladen: Name und Unterordner bestimmt der Server, Status „Scan abgelegt“
  const { root } = (await b.cdp("DOM.getDocument", { depth: 1 })).result;
  const { nodeId } = (await b.cdp("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-scan-datei="${pid}"]` })).result;
  await b.cdp("DOM.setFileInputFiles", { nodeId, files: [scan] });
  const scanDatei = await warteDb("select name, unterordner, quelle, status from public.ablage_datei where formular_id = $1 and deleted_at is null", [pid], (r) => r.length === 1 && r[0].status !== "upload", 120);
  pruefe("Scan in „04 Auftrag“ als <AB>_Montageprotokoll_<Kunde>_unterschrieben.pdf", !!scanDatei && scanDatei[0].unterordner === "04 Auftrag" && scanDatei[0].name === `${ab.nummer}_Montageprotokoll_Formularkunde_${lauf}_unterschrieben.pdf`, JSON.stringify(scanDatei));
  pruefe("… Status „Scan abgelegt“", !!(await warteDb("select status from public.formular where id = $1", [pid], (r) => r[0].status === "scan_abgelegt")));
  pruefe("… Liste ohne Knopf „Scan hochladen“", await b.warte(`document.querySelector('[data-formular="${pid}"] [data-formular-status]')?.dataset.formularStatus === 'scan_abgelegt' && !document.querySelector('[data-scan-hochladen="${pid}"]')`, 20000));

  // Übergabeprotokoll drucken und wieder entfernen (Markierung, mit Nachfrage)
  await b.klick("[data-protokoll-drucken=uebergabeprotokoll]");
  const ueb = await warteDb("select id from public.formular where auftrag_id = $1 and typ = 'uebergabeprotokoll' and deleted_at is null", [ab.auftrag_id], (r) => r.length === 1);
  await b.da(`[data-formular-entfernen="${ueb[0].id}"]`);
  await b.klick(`[data-formular-entfernen="${ueb[0].id}"]`);
  await b.klickText("[role=dialog] button", "Entfernen");
  pruefe("Gedrucktes Protokoll entfernen: nur markiert", !!(await warteDb("select deleted_at from public.formular where id = $1", [ueb[0].id], (r) => !!r[0].deleted_at)));
  pruefe("… aus der Liste verschwunden", await b.warte(`!document.querySelector('[data-formular="${ueb[0].id}"]')`, 20000));
  if (fotos) await b.foto(path.join(fotos, "formulare-auftrag.png"));

  // 7. Aufmaß am Auftrag wieder öffnen, ändern, abschließen: PDF ersetzt (eine Datei je Aufmaß)
  await b.gehe(`/formulare/${fid}`);
  await b.klick("[data-aufmass-oeffnen]");
  pruefe("Wieder geöffnet", await b.warte("document.querySelector('[data-formular-status]')?.dataset.formularStatus === 'entwurf' && !document.querySelector('[name=raum]').disabled", 20000));
  await b.tippe("[data-aufmass-zeile] [name=bemerkung]", "Rollladen bleibt");
  await gespeichert();
  await b.klick("[data-aufmass-abschliessen]");
  pruefe("Erneut abgeschlossen (Ordner des Auftrags)", await b.warte("document.querySelector('[data-aufmass-meldung]')?.innerText.includes('03 Aufmaß - Freigabe')", 20000));
  await sleep(2500);
  pruefe("… weiterhin genau eine PDF-Datei zum Aufmaß", (await dbAbfrage("select count(*)::int n from public.ablage_datei where formular_id = $1 and quelle = 'formular' and deleted_at is null", [fid]))[0].n === 1);

  // 8. Nachtragsangebot aus dem Aufmaß des Auftrags
  await b.klick("[data-aufmass-angebot]");
  pruefe("Am Auftrag: Nachtragsangebot mit eigener Anfrage", await b.warte(`location.search.includes("aufmass=${fid}") && !!document.querySelector("[data-beleg-editor=angebot]")`, 20000));
  const nachtragId = await b.js("new URLSearchParams(location.search).get('anfrage')");
  const [nq] = await dbAbfrage("select nachtrag_zu from public.anfrage where id = $1", [nachtragId]);
  pruefe("… Anfrage mit Verweis auf den Ursprungsauftrag", nq?.nachtrag_zu === ab.auftrag_id);

  // 9. Ticket: Servicebericht zuerst; kein Angebot aus dem Aufmaß
  const { data: ticket } = await service.from("service_ticket").insert({ kunde_id: kunde.id, thema: `Tür klemmt ${lauf}`, problem: "Tür schließt schwer" }).select("id").single();
  merken("service_ticket", ticket.id);
  await b.gehe(`/service/${ticket.id}?reiter=formulare`);
  pruefe("Ticket: Servicebericht zuerst", await b.warte("document.querySelector('[data-formular-knoepfe] button')?.dataset.protokollDrucken === 'servicebericht'"));
  await b.klick("[data-protokoll-drucken=servicebericht]");
  const sb = await warteDb("select id from public.formular where ticket_id = $1 and typ = 'servicebericht'", [ticket.id], (r) => r.length === 1);
  const pdf3 = sb ? await pdfHolen(sb[0].id, "servicebericht.pdf") : null;
  pruefe("Servicebericht gedruckt (PDF)", pdf3?.anfang === "%PDF-", JSON.stringify(pdf3));
  await b.klick("[data-formular-knoepfe] [data-aufmass-neu]");
  await b.warte("/^\\/formulare\\//.test(location.pathname)");
  pruefe("Aufmaß am Ticket ohne „In Angebot übernehmen“", await b.warte("!!document.querySelector('[data-aufmass-editor]') && !document.querySelector('[data-aufmass-angebot]')"));
} catch (e) {
  pruefe("Ablauf ohne Fehler", false, e.stack ?? e.message);
} finally {
  b?.ende();
  await belegeAufraeumen(kunde?.id).catch((e) => console.error("Aufräumen Belege:", e.message));
  await aufraeumen();
}
bilanz();
