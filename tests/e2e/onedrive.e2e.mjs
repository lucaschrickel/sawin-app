// End-to-End-Test OneDrive-Ablage gegen einen nachgebauten Graph-Server (tests/e2e/graph-mock.mjs), nie gegen Sawins
// Microsoft 365: Verbindung prüfen (Basisordner _App-Test), Ordner ab dem ersten Angebot mit Unterordnern, PDF in
// „02 Angebot“, mit der AB derselbe Ordner umbenannt, AB-PDF in „05 ABs“, Upload (auch groß, in Teilen), abgelehnter
// Dateityp, Ausfall → Zwischenspeicher → Nachladen per Cron.
// Aufruf: App mit den Test-Variablen starten (siehe unten), dann APP_URL=http://localhost:3100 npm run test:onedrive
//   MS_GRAPH_BASIS=http://127.0.0.1:3990/v1.0 MS_LOGIN_BASIS=http://127.0.0.1:3990/login MS_GRAPH_TENANT_ID=test
//   MS_GRAPH_CLIENT_ID=test MS_GRAPH_CLIENT_SECRET=test MS_TOKEN_SCHLUESSEL=<32 Byte base64> CRON_SECRET=<mind. 16 Zeichen>
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP, aufraeumen, belegeAufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";
import { MOCK, startGraphMock } from "./graph-mock.mjs";

const PORT = Number(process.env.MOCK_PORT ?? 3990);
const fotos = process.env.FOTOS;
let b;
let mock;
let kunde;
let einstellungVorher;
const kundeName = `Ablagekunde ${lauf}`;
const ordnerIn = (z, pfad) => z.some((x) => x.pfad === pfad);

async function warteDb(sql, werte, pruef, versuche = 60) {
  for (let i = 0; i < versuche; i++) {
    const z = await dbAbfrage(sql, werte);
    if (pruef(z)) return true;
    await sleep(250);
  }
  return false;
}
async function warteMock(pruef, versuche = 60) {
  for (let i = 0; i < versuche; i++) {
    if (pruef(mock.zustand())) return true;
    await sleep(250);
  }
  return false;
}
/** Datei in das Upload-Feld der Ablage-Karte legen (CDP) */
async function dateiWaehlen(datei) {
  // erst wenn der vorige Upload samt Neuladen der Karte fertig ist
  await b.warte("!!document.querySelector('[data-ablage-hochladen]') && !document.querySelector('[data-ablage-hochladen]').disabled", 120000);
  const { root } = (await b.cdp("DOM.getDocument", { depth: 1 })).result;
  const { nodeId } = (await b.cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-ablage-upload] input[type=file]" })).result;
  await b.cdp("DOM.setFileInputFiles", { nodeId, files: [datei] });
}

try {
  // Schutz: Während des Tests zeigt Staging auf den Test-Server. Wartende echte Dateien oder Ordner würden sonst dorthin
  // „übertragen“ und mit falschen Verknüpfungen als abgelegt markiert.
  const [w] = await dbAbfrage("select (select count(*) from public.ablage_datei where status in ('wartet', 'fehler', 'upload') and deleted_at is null)::int d, (select count(*) from public.ablage_ordner where status in ('wartet', 'fehler') and deleted_at is null)::int o");
  if (w.d || w.o) throw new Error(`Auf Staging warten ${w.d} Dateien und ${w.o} Ordner auf OneDrive. Der Test läuft nur mit leerem Zwischenspeicher (sonst würden sie an den Test-Server übertragen).`);
  mock = await startGraphMock(PORT);
  const admin = await testAdmin();
  [einstellungVorher] = await dbAbfrage("select onedrive_site_id, onedrive_liste_id, onedrive_drive_id, onedrive_basis_pfad, onedrive_basis_id, onedrive_basis_url, onedrive_geprueft_am from public.einstellung");
  ({ data: kunde } = await service.from("kunde").insert({ name: kundeName, email: `ablage-${lauf}@example.com` }).select("id").single());
  merken("kunde", kunde.id);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ablage-"));
  const pdfKlein = path.join(tmp, `Aufmass ${lauf}.pdf`);
  writeFileSync(pdfKlein, Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(2000, 65)]));
  const pdfGross = path.join(tmp, `Scan gross ${lauf}.pdf`);
  writeFileSync(pdfGross, Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024, 66)]));
  const falsch = path.join(tmp, `boese ${lauf}.pdf`);
  writeFileSync(falsch, "<html><script>alert(1)</script></html>");

  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  // 1. Verbindung: Bibliothek und Basisordner _App-Test (wird angelegt)
  await b.gehe("/einstellungen/verbindungen");
  pruefe("Verbindungen: Zugangsdaten gesetzt, Bibliothek noch zu wählen", await b.warte("['offen', 'verbunden'].includes(document.querySelector('[data-onedrive-status]')?.dataset.onedriveStatus)"));
  await b.tippe("[data-onedrive-formular] [name=site_id]", MOCK.site);
  await b.tippe("[data-onedrive-formular] [name=liste_id]", MOCK.liste);
  await b.tippe("[data-onedrive-formular] [name=basis_pfad]", "_App-Test");
  await b.klickText("[data-onedrive-formular] button", "Prüfen und speichern");
  pruefe("Verbindung gespeichert, Basisordner _App-Test angelegt", (await warteDb("select onedrive_drive_id d, onedrive_basis_pfad p from public.einstellung", [], (r) => r[0]?.d === MOCK.drive && r[0]?.p === "_App-Test")) && ordnerIn(mock.zustand(), "_App-Test"));
  pruefe("Status „verbunden“", await b.warte("document.querySelector('[data-onedrive-status]')?.dataset.onedriveStatus === 'verbunden'"));
  if (fotos) await b.foto(path.join(fotos, "verbindungen.png"));

  // 2. Erstes Angebot: Ordner <AG>_<Kunde> mit sechs Unterordnern
  await b.gehe(`/beleg/neu?art=angebot&kunde=${kunde.id}`);
  await b.da("[data-beleg-editor=angebot]");
  await b.tippe("[name=titel]", `Haustür ${lauf}`);
  await b.tippe("[data-position='0'] [data-feld=titel]", "Haustür RC2");
  await b.tippe("[data-position='0'] [data-feld=preis]", "3000");
  await b.klick("[data-aktion=speichern]");
  await b.warte("/^\\/beleg\\/[0-9a-f-]{36}$/.test(location.pathname)");
  const agId = await b.js("location.pathname.split('/')[2]");
  const [ag] = await dbAbfrage("select nummer, anfrage_id from public.beleg where id = $1", [agId]);
  const agOrdner = `_App-Test/${ag.nummer}_${kundeName}`;
  pruefe("Ordner ab dem ersten Angebot: <AG-Nummer>_<Kunde>", await warteMock((z) => ordnerIn(z, agOrdner)), JSON.stringify(mock.zustand().map((x) => x.pfad)));
  pruefe("… mit den sechs Unterordnern wie im Make-Szenario", await warteMock((z) => ["01 Anfrage", "02 Angebot", "03 Aufmaß - Freigabe", "04 Auftrag", "05 ABs", "06 Abnahme - Rechnung - Sonstiges"].every((u) => ordnerIn(z, `${agOrdner}/${u}`))));
  pruefe("Verknüpfung gespeichert (Drive-ID, Item-ID)", await warteDb("select status, drive_id, item_id from public.ablage_ordner where anfrage_id = $1", [ag.anfrage_id], (r) => r[0]?.status === "angelegt" && r[0].drive_id === MOCK.drive && !!r[0].item_id));

  // 3. Fertigstellen: Angebots-PDF in „02 Angebot“
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("document.querySelector('[data-status]')?.dataset.status === 'offen'", 30000);
  const agPdf = `${agOrdner}/02 Angebot/${ag.nummer}_Angebot_Ablagekunde_${lauf}.pdf`;
  pruefe("Angebots-PDF in „02 Angebot“", await warteMock((z) => z.some((x) => x.pfad === agPdf && x.size > 1000)), JSON.stringify(mock.zustand().map((x) => x.pfad)));
  await b.gehe(`/beleg/${agId}`);
  pruefe("Belegseite zeigt die Ablage", (await b.warte("document.querySelector('[data-beleg-ablage]')?.dataset.belegAblage === 'abgelegt'")));

  // 4. AB aus dem Angebot: derselbe Ordner, umbenannt auf <AB>_<Kunde>; AB-PDF in „05 ABs“
  await b.klick("[data-schritt=angenommen]");
  await b.klickText("[data-naechster-schritt] a", "Auftragsbestätigung erstellen");
  await b.da("[data-beleg-editor=auftragsbestaetigung]");
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("document.querySelector('[data-status]')?.dataset.status === 'bestaetigt' || !!document.querySelector('[data-sprung=auftrag]')", 30000);
  const [ab] = await dbAbfrage("select id, nummer, auftrag_id from public.beleg where art = 'auftragsbestaetigung' and kunde_id = $1", [kunde.id]);
  const abOrdner = `_App-Test/${ab.nummer}_${kundeName}`;
  pruefe("Mit der AB: Ordner umbenannt auf <AB-Nummer>_<Kunde>", await warteMock((z) => ordnerIn(z, abOrdner) && !ordnerIn(z, agOrdner)), JSON.stringify(mock.zustand().map((x) => x.pfad)));
  pruefe("… derselbe Ordner (Angebots-PDF bleibt darin)", mock.zustand().some((x) => x.pfad === `${abOrdner}/02 Angebot/${ag.nummer}_Angebot_Ablagekunde_${lauf}.pdf`));
  pruefe("… Ordnerzeile gehört jetzt auch zum Auftrag", await warteDb("select auftrag_id, anfrage_id, name from public.ablage_ordner where anfrage_id = $1", [ag.anfrage_id], (r) => r[0]?.auftrag_id === ab.auftrag_id && r[0].name === `${ab.nummer}_${kundeName}`));
  pruefe("AB-PDF in „05 ABs“", await warteMock((z) => z.some((x) => x.pfad.startsWith(`${abOrdner}/05 ABs/${ab.nummer}_Auftragsbestaetigung`))));

  // 5. Upload am Auftrag: klein nach „04 Auftrag“, groß in Teilen, falscher Typ abgelehnt
  await b.gehe(`/auftraege/${ab.auftrag_id}`);
  pruefe("Auftrag: Karte „OneDrive-Ordner“ mit Link", await b.warte(`document.querySelector("[data-ablage-ordner]")?.innerText === ${JSON.stringify(`${ab.nummer}_${kundeName}`)}`));
  await dateiWaehlen(pdfKlein);
  await b.klick("[data-ablage-hochladen]");
  pruefe("Upload in „04 Auftrag“", await warteMock((z) => z.some((x) => x.pfad === `${abOrdner}/04 Auftrag/Aufmass ${lauf}.pdf`)));
  pruefe("Meldung: liegt im OneDrive-Ordner", await b.warte("document.querySelector('[data-ablage-upload] [role=status]')?.innerText.includes('liegt im OneDrive-Ordner')"));
  await dateiWaehlen(pdfGross);
  await b.klick("[data-ablage-hochladen]");
  await b.warte("!!document.querySelector('[data-ablage-upload] [role=status], [data-ablage-upload] [role=alert]') && !document.querySelector('[data-ablage-hochladen]').disabled", 120000);
  const meldungGross = await b.js("document.querySelector('[data-ablage-upload] [role=status], [data-ablage-upload] [role=alert]')?.innerText");
  pruefe("Große Datei (5 MB) in Teilen hochgeladen", await warteMock((z) => z.some((x) => x.pfad === `${abOrdner}/04 Auftrag/Scan gross ${lauf}.pdf` && x.size === 5 * 1024 * 1024 + 9), 120), meldungGross);
  await dateiWaehlen(falsch);
  await b.klick("[data-ablage-hochladen]");
  pruefe("Falscher Dateityp (HTML als .pdf) abgelehnt", await b.warte("document.querySelector('[data-ablage-upload] [role=alert]')?.innerText.includes('Erlaubt sind')", 60000), (await b.js("JSON.stringify(document.querySelector('[data-ablage-upload]')?.innerText)")) + JSON.stringify(await dbAbfrage("select status, fehler, deleted_at from public.ablage_datei where name = $1", [`boese ${lauf}.pdf`])));
  pruefe("… nur als gelöscht markiert, nichts in OneDrive", (await warteDb("select deleted_at from public.ablage_datei where name = $1", [`boese ${lauf}.pdf`], (r) => r.length === 1 && !!r[0].deleted_at)) && !mock.zustand().some((x) => x.pfad.includes(`boese ${lauf}`)));
  if (fotos) await b.foto(path.join(fotos, "ablage-auftrag.png"));

  // 6. Microsoft nicht erreichbar: Zwischenspeicher, danach Nachladen per Cron
  mock.setOffline(true);
  writeFileSync(pdfKlein.replace("Aufmass", "Aufmass2"), Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(1500, 67)]));
  await dateiWaehlen(pdfKlein.replace("Aufmass", "Aufmass2"));
  await b.klick("[data-ablage-hochladen]");
  pruefe("Ausfall: Datei zwischengespeichert", await b.warte("document.querySelector('[data-ablage-upload] [role=status]')?.innerText.includes('zwischengespeichert')", 30000));
  const [puffer] = await dbAbfrage("select id, status, puffer_pfad from public.ablage_datei where name = $1", [`Aufmass2 ${lauf}.pdf`]);
  pruefe("… Status wartet/fehler mit Zwischenspeicher", ["wartet", "fehler"].includes(puffer?.status) && !!puffer.puffer_pfad, JSON.stringify(puffer));
  mock.setOffline(false);
  const ohne = await fetch(`${APP}/api/cron/ablage`).then((r) => r.status);
  pruefe("Cron ohne Geheimnis: 401", ohne === 401);
  const cron = await fetch(`${APP}/api/cron/ablage`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  // Nachgeladen wird per Cron oder schon beim Öffnen der Auftragsseite im Hintergrund
  pruefe("Cron läuft und meldet nichts mehr offen", cron.status === "ok" && cron.offen === 0, JSON.stringify(cron));
  pruefe("… Datei in OneDrive, Zwischenspeicher geleert", mock.zustand().some((x) => x.pfad === `${abOrdner}/04 Auftrag/Aufmass2 ${lauf}.pdf`) && (await warteDb("select status, puffer_pfad from public.ablage_datei where id = $1", [puffer.id], (r) => r[0]?.status === "abgelegt" && !r[0].puffer_pfad)));
  const { data: rest } = await service.storage.from("ablage-puffer").list(puffer.puffer_pfad.split("/")[0]);
  pruefe("… Objekt im Zwischenspeicher entfernt", !(rest ?? []).length);
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  try {
    if (kunde) await belegeAufraeumen(kunde.id);
    if (einstellungVorher) {
      const v = einstellungVorher;
      await dbAbfrage("update public.einstellung set onedrive_site_id = $1, onedrive_liste_id = $2, onedrive_drive_id = $3, onedrive_basis_pfad = $4, onedrive_basis_id = $5, onedrive_basis_url = $6, onedrive_geprueft_am = $7", [v.onedrive_site_id, v.onedrive_liste_id, v.onedrive_drive_id, v.onedrive_basis_pfad, v.onedrive_basis_id, v.onedrive_basis_url, v.onedrive_geprueft_am]);
    }
    // Token des Test-Servers entfernen (mit dem Testschlüssel verschlüsselt)
    await dbAbfrage("delete from public.ms_token");
  } catch (e) {
    console.error("Aufräumen OneDrive:", e.message);
  }
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
  await mock?.stop();
}
process.exit(bilanz() ? 1 : 0);
