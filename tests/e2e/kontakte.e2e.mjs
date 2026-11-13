// End-to-End-Test „keine doppelten Kunden in Lexware“ gegen das Lexware-Testkonto (nie Sawins echtes Konto):
// 1. eindeutiger Treffer (Name und E-Mail): die Rechnung nutzt den vorhandenen Lexware-Kontakt
// 2. zwei mögliche Treffer (nur Name): das Büro wählt einen davon, „Fertigstellen“ läuft weiter
// 3. „Neuen Kontakt anlegen“: eigener, neuer Kontakt
// Jeder Lauf legt im Testkonto Kontakte und endgültige Rechnungen an (dort nicht löschbar).
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:kontakte
import { aufraeumen, belegeAufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

let b;
const kunden = [];
let letzte = 0;
async function lex(methode, pfad, body) {
  for (let v = 0; v < 6; v++) {
    const warte = letzte + 600 - Date.now();
    if (warte > 0) await sleep(warte);
    letzte = Date.now();
    const r = await fetch(`https://api.lexware.io${pfad}`, {
      method: methode,
      headers: { Authorization: `Bearer ${process.env.LEXWARE_API_KEY}`, Accept: "application/json", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429) {
      await sleep(1000 * 2 ** v);
      continue;
    }
    if (!r.ok) throw new Error(`Lexware ${r.status} bei ${pfad}: ${await r.text()}`);
    return r.json();
  }
}
const person = (vor, nach, email) => ({
  version: 0,
  roles: { customer: {} },
  person: { firstName: vor, lastName: nach },
  addresses: { billing: [{ street: "Teststraße 1", zip: "38550", city: "Isenbüttel", countryCode: "DE" }] },
  ...(email ? { emailAddresses: { business: [email] } } : {}),
  note: "E2E-Test Kontaktabgleich",
});

/** Kunde mit erledigtem Ticket anlegen und dort eine Rechnung bis zum Bestätigungsdialog bringen */
async function rechnungStarten(name, email) {
  const { data: k } = await service.from("kunde").insert({ name, email, strasse: "Andere Straße 9", plz: "10115", ort: "Berlin" }).select("id").single();
  kunden.push(k.id);
  merken("kunde", k.id);
  const { data: t } = await service.from("service_ticket").insert({ kunde_id: k.id, thema: `Kontakt ${lauf}`, art: "reparatur", status: "erledigt" }).select("id").single();
  await b.gehe(`/service/${t.id}`);
  await b.klickText("[data-ticket-rechnung] a", "Rechnung erstellen");
  await b.da("[data-beleg-editor=rechnung]");
  await b.tippe("[data-position='0'] [data-feld=titel]", "Einstellarbeiten");
  await b.tippe("[data-position='0'] [data-feld=preis]", "80");
  await b.klick("[data-aktion=fertigstellen]");
  await b.warte("!!document.querySelector('[data-lexware-bestaetigung]')");
  await b.klickText("[role=dialog] button", "In Lexware anlegen");
  return k.id;
}
const kontaktVon = async (id) => (await dbAbfrage("select lexware_kontakt_id from public.kunde where id = $1", [id]))[0]?.lexware_kontakt_id;
/** Rechnung des Kunden in Lexware fertiggestellt? (bis zu 60 Sekunden) */
const fertig = async (kundeId) => {
  for (let i = 0; i < 120; i++) {
    const [r] = await dbAbfrage("select count(*)::int n from public.beleg where kunde_id = $1 and art = 'rechnung' and status <> 'entwurf'", [kundeId]);
    if (r.n > 0) return true;
    await sleep(500);
  }
  return false;
};

try {
  if (!process.env.LEXWARE_API_KEY) throw new Error("LEXWARE_API_KEY fehlt (nur Testkonto)");
  const profil = await lex("GET", "/v1/profile");
  if (process.env.LEXWARE_ALTBESTAND?.trim() === "aktiv") throw new Error("Nur gegen das Testkonto (LEXWARE_ALTBESTAND nicht aktiv)");
  pruefe("Lexware-Testkonto", !!profil.companyName, profil.companyName);
  const admin = await testAdmin();
  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);

  // 1. Eindeutig: gleicher Name und gleiche E-Mail
  const email = `eindeutig-${lauf}@example.org`;
  const a = await lex("POST", "/v1/contacts", person("Erika", `Eindeutig${lauf}`, email));
  const k1 = await rechnungStarten(`Erika Eindeutig${lauf}`, email);
  pruefe("eindeutiger Treffer: Rechnung ohne Rückfrage fertig", (await fertig(k1)) && !(await b.js("!!document.querySelector('[data-kontakt-wahl]')")), JSON.stringify(await dbAbfrage("select status, lexware_status, lexware_fehler from public.beleg where kunde_id = $1", [k1])));
  pruefe("eindeutiger Treffer: vorhandener Lexware-Kontakt übernommen", (await kontaktVon(k1)) === a.id, `${await kontaktVon(k1)} / ${a.id}`);

  // 2. Unsicher: zwei Kontakte mit gleichem Namen, Kunde ohne E-Mail
  const d1 = await lex("POST", "/v1/contacts", person("Doris", `Doppelt${lauf}`, `d1-${lauf}@example.org`));
  const d2 = await lex("POST", "/v1/contacts", person("Doris", `Doppelt${lauf}`, `d2-${lauf}@example.org`));
  const k2 = await rechnungStarten(`Doris Doppelt${lauf}`, null);
  pruefe("unsicher: Auswahl mit beiden Kandidaten", await b.warte(`!!document.querySelector('[data-kontakt-wahl] [data-kandidat="${d1.id}"]') && !!document.querySelector('[data-kontakt-wahl] [data-kandidat="${d2.id}"]')`, 60000));
  await b.klick(`[data-kandidat="${d2.id}"] button`);
  pruefe("unsicher: nach der Wahl fertiggestellt", await fertig(k2));
  pruefe("unsicher: gewählter Kontakt übernommen", (await kontaktVon(k2)) === d2.id, `${await kontaktVon(k2)} / ${d2.id}`);

  // 3. Neu anlegen trotz möglicher Treffer
  const k3 = await rechnungStarten(`Doris Doppelt${lauf}`, null);
  const dialog3 = await b.warte("[...document.querySelectorAll('[data-kontakt-neu]')].some((x) => x.getClientRects().length)", 60000);
  if (!dialog3) throw new Error(`Auswahl fehlt: ${JSON.stringify(await dbAbfrage("select b.lexware_fehler from public.beleg b join public.service_ticket t on t.id = b.ticket_id where t.thema = $1 order by b.created_at desc limit 1", [`Kontakt ${lauf}`]))} (${await b.js("location.pathname")}) · ${(await b.js("[...document.querySelectorAll('main')].filter((m) => m.offsetParent).map((m) => m.innerText).join(' ')"))?.replace(/s+/g, " ").slice(0, 500)}`);
  await b.klick("[data-kontakt-neu]");
  pruefe("neu anlegen: fertiggestellt", await fertig(k3));
  const neu = await kontaktVon(k3);
  pruefe("neu anlegen: eigener, neuer Kontakt", !!neu && ![a.id, d1.id, d2.id].includes(neu), neu);
} catch (e) {
  pruefe("Ablauf ohne Ausnahme", false, e.stack ?? String(e));
} finally {
  b?.ende();
  for (const k of kunden) await belegeAufraeumen(k).catch((e) => console.error(e.message));
  await aufraeumen();
  bilanz();
}
