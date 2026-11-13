// End-to-End-Test Übergang ab dem Go-live gegen das Lexware-Testkonto (nie Sawins echtes Konto):
// Go-live-Datum in Einstellungen › Verbindungen setzen → ein danach direkt in Lexware angelegtes Angebot erscheint dort
// und als Hinweis im Dashboard; ohne Stichtag verschwindet der Hinweis. Der Lauf legt im Testkonto einen
// Angebots-Entwurf an (dort nicht löschbar). Das Go-live-Datum wird danach auf den alten Wert zurückgesetzt.
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:uebergang
import { bilanz, browser, dbAbfrage, pruefe, sleep, testAdmin } from "./hilfen.mjs";

let b;
let vorher;
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
async function lex(methode, pfad, body) {
  for (let v = 0; v < 6; v++) {
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
const sichtbar = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getClientRects().length)`;

try {
  if (!process.env.LEXWARE_API_KEY) throw new Error("LEXWARE_API_KEY fehlt (nur Testkonto)");
  if (process.env.LEXWARE_ALTBESTAND?.trim() === "aktiv") throw new Error("Nur gegen das Testkonto (LEXWARE_ALTBESTAND nicht aktiv)");
  const profil = await lex("GET", "/v1/profile");
  pruefe("Lexware-Testkonto", !!profil.companyName, profil.companyName);
  [vorher] = await dbAbfrage("select golive_datum::text d from public.einstellung where einzig");

  // Angebot direkt in Lexware (Entwurf), wie es ein Büro nach dem Stichtag versehentlich anlegen würde
  const datum = `${heute}T00:00:00.000+01:00`;
  const angebot = await lex("POST", "/v1/quotations", {
    voucherDate: datum,
    expirationDate: datum,
    address: { name: "E2E Übergang", countryCode: "DE" },
    lineItems: [{ type: "custom", name: "Test", quantity: 1, unitName: "Stück", unitPrice: { currency: "EUR", netAmount: 10, taxRatePercentage: 19 } }],
    totalPrice: { currency: "EUR" },
    taxConditions: { taxType: "net" },
  });

  const admin = await testAdmin();
  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);

  await b.gehe("/einstellungen/verbindungen");
  await b.da("[data-stichtag-formular]");
  await b.js(`(() => { const i = ${sichtbar("[data-stichtag-formular] input[name=golive_datum]")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "${heute}"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await b.js(`${sichtbar("[data-stichtag-formular] button[type=submit]")}.click()`);
  pruefe("Stichtag gespeichert", await b.warte(`!!${sichtbar("[data-stichtag-formular] [role=status]")}`, 60000));
  const [e] = await dbAbfrage("select golive_datum::text d, lexware_fremdbelege f from public.einstellung where einzig");
  pruefe("Stichtag in der Datenbank", e.d === heute, e.d);
  pruefe("Lexware-Angebot nach dem Stichtag erkannt", (e.f ?? []).some((f) => f.id === angebot.id && f.typ === "quotation"), JSON.stringify(e.f).slice(0, 300));
  pruefe("Liste in Verbindungen", await b.warte(`!!${sichtbar(`[data-fremdbeleg="${angebot.id}"]`)}`, 20000));

  await b.gehe("/");
  pruefe("Hinweis im Dashboard", await b.warte("[...document.querySelectorAll('main')].some((m) => m.getClientRects().length && /direkt in Lexware angelegt/.test(m.innerText))", 20000));

  // Ohne Stichtag kein Hinweis
  await b.gehe("/einstellungen/verbindungen");
  await b.da("[data-stichtag-formular]");
  await b.js(`(() => { const i = ${sichtbar("[data-stichtag-formular] input[name=golive_datum]")}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await b.js(`${sichtbar("[data-stichtag-formular] button[type=submit]")}.click()`);
  await b.warte(`!!${sichtbar("[data-stichtag-formular] [role=status]")}`, 60000);
  const [e2] = await dbAbfrage("select golive_datum d, jsonb_array_length(lexware_fremdbelege) n from public.einstellung where einzig");
  pruefe("Stichtag entfernt, Liste leer", e2.d === null && e2.n === 0, JSON.stringify(e2));
  await b.gehe("/");
  await sleep(1500);
  pruefe("kein Hinweis ohne Stichtag", !(await b.js("[...document.querySelectorAll('main')].some((m) => m.getClientRects().length && /direkt in Lexware angelegt/.test(m.innerText))")));
} catch (e) {
  pruefe("Ablauf ohne Ausnahme", false, e.stack ?? String(e));
} finally {
  b?.ende();
  if (vorher) await dbAbfrage("update public.einstellung set golive_datum = $1, lexware_fremdbelege = '[]', lexware_fremdbelege_am = null where einzig", [vorher.d]).catch((x) => console.error(x.message));
  bilanz();
}
