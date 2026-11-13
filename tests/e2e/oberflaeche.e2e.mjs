// End-to-End-Test Oberfläche: Passwortfeld mit Augen-Symbol (Maus und Tastatur, Screenreader-Beschriftung) und
// Sawin-Logo wie in der Demo (Anmeldeseite, Seitenleiste aus- und eingeklappt, helles und dunkles Theme).
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:oberflaeche
// Optional FOTOS=<Ordner> für Bildschirmfotos.
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, merken, pruefe, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
const WEISS = "rgb(255, 255, 255)";
const ANTHRAZIT = "rgb(46, 43, 40)";
let b;

/** Größe und Konturfarbe des sichtbaren Logos unter `sel` */
const logo = (sel) =>
  b.js(`(() => { const s = [...document.querySelectorAll(${JSON.stringify(sel + " svg")})].find((x) => x.getClientRects().length); if (!s) return null; const g = s.querySelector("g[stroke]"); return { breite: Math.round(s.getBoundingClientRect().width), viewBox: s.getAttribute("viewBox"), strich: getComputedStyle(g).stroke, label: s.getAttribute("aria-label"), sand: !!s.querySelector('path[fill="#D2B19A"]'), grau: !!s.querySelector('path[fill="#B3B3B3"]') }; })()`);
/** Zustand von Passwortfeld und Augen-Knopf */
const feld = (name) =>
  b.js(`(() => { const i = document.querySelector("[name=${name}]"); const k = i?.parentElement.querySelector("[data-passwort-auge]"); return i && k ? { typ: i.type, label: k.getAttribute("aria-label"), gedrueckt: k.getAttribute("aria-pressed"), steuert: k.getAttribute("aria-controls") === i.id && !!i.id, knopfTyp: k.type, fokus: document.activeElement === k, wert: i.value } : null; })()`);
/** Taste mit Zeichen (Enter löst wie im echten Browser den Knopf aus) */
const druecke = async (key, code, vk, text) => {
  await b.cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, text });
  await b.cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
  await sleep(120);
};

try {
  const admin = await testAdmin();
  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // 1. Anmeldeseite: Passwortfeld standardmäßig ausgeblendet, Augen-Symbol mit Beschriftung
  await b.gehe("/anmelden");
  await b.da("[data-passwort-auge]");
  let f = await feld("passwort");
  pruefe("Anmeldung: Passwort ausgeblendet (type=password)", f?.typ === "password", JSON.stringify(f));
  pruefe("Augen-Knopf: „Passwort anzeigen“, Umschalter aus, steuert das Feld", f?.label === "Passwort anzeigen" && f.gedrueckt === "false" && f.steuert && f.knopfTyp === "button", JSON.stringify(f));

  // 2. Maus: einblenden und wieder ausblenden
  await b.tippe("[name=passwort]", "Geheim-1234");
  await b.klick("[data-passwort-auge]");
  f = await feld("passwort");
  pruefe("Klick: Passwort sichtbar, Umschalter an", f.typ === "text" && f.gedrueckt === "true" && f.wert === "Geheim-1234", JSON.stringify(f));
  await b.klick("[data-passwort-auge]");
  f = await feld("passwort");
  pruefe("zweiter Klick: wieder ausgeblendet", f.typ === "password" && f.gedrueckt === "false");

  // 3. Tastatur: Tab vom Feld auf den Knopf, Leertaste und Enter schalten um (ohne das Formular abzuschicken)
  await b.js("document.querySelector('[name=passwort]').focus()");
  await druecke("Tab", "Tab", 9);
  f = await feld("passwort");
  pruefe("Tab: Fokus auf dem Augen-Knopf", f.fokus, JSON.stringify(f));
  await druecke(" ", "Space", 32, " ");
  f = await feld("passwort");
  pruefe("Leertaste: Passwort sichtbar", f.typ === "text" && f.gedrueckt === "true" && f.wert === "Geheim-1234", JSON.stringify(f));
  await druecke("Enter", "Enter", 13, "\r");
  f = await feld("passwort");
  pruefe("Enter: wieder ausgeblendet, Formular nicht abgeschickt", f.typ === "password" && (await b.pfad()) === "/anmelden", JSON.stringify(f));

  // 4. Logo auf der Anmeldeseite (dunkles Theme): ganzes Logo, Konturen weiß
  let l = await logo("[data-logo]");
  pruefe("Anmeldung: ganzes Logo mit Wortmarke", l?.viewBox === "50 14.5 584 193" && l.label === "Sawin Bauelemente" && l.sand && l.grau, JSON.stringify(l));
  pruefe("Anmeldung: Konturen weiß auf dunklem Grund, 260 px breit", l?.strich === WEISS && l.breite === 260, JSON.stringify(l));
  if (fotos) await b.foto(path.join(fotos, "anmeldung-logo.png"));

  // 5. Seitenleiste: ausgeklappt ganzes Logo (178 px), eingeklappt nur das Symbol (40 px), Konturen weiß
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");
  await b.da("aside [data-logo] svg");
  l = await logo("aside [data-logo]");
  pruefe("Seitenleiste: ganzes Logo wie in der Demo (174 px neben dem Knopf), Konturen weiß", l?.viewBox === "50 14.5 584 193" && l.breite === 174 && l.strich === WEISS, JSON.stringify(l));
  pruefe("Seitenleiste: Logo führt zum Dashboard", await b.js("document.querySelector('aside [data-logo]').getAttribute('href') === '/' && document.querySelector('aside [data-logo]').getAttribute('aria-label') === 'Sawin Bauelemente – Dashboard'"));
  if (fotos) await b.foto(path.join(fotos, "seitenleiste-logo.png"));
  await b.klick("aside button[aria-label='Seitenleiste einklappen']");
  await b.warte("document.querySelector('aside').getBoundingClientRect().width < 100");
  (await dbAbfrage("select id from public.benutzer_einstellung where benutzer_id = $1", [admin.id])).forEach((x) => merken("benutzer_einstellung", x.id));
  l = await logo("aside [data-logo]");
  pruefe("eingeklappt: nur das Symbol, 40 px, Konturen weiß", l?.viewBox === "50 14.5 271.5 193" && l.breite === 40 && l.strich === WEISS, JSON.stringify(l));
  if (fotos) await b.foto(path.join(fotos, "seitenleiste-logo-eingeklappt.png"));
  await b.klick("aside button[aria-label='Seitenleiste ausklappen']");
  await b.warte("document.querySelector('aside').getBoundingClientRect().width > 200");

  // 6. Designsystem: Logo hell (anthrazit) und dunkel (weiß), Passwortfeld im dunklen Theme (die ersten drei Logos;
  // danach folgt der Briefkopf auf hellem Papier)
  await b.gehe("/styleguide");
  await b.da("[data-theme=dark] [data-passwort-auge]");
  const farben = await b.js(`JSON.stringify([...document.querySelectorAll("main svg[viewBox='50 14.5 584 193'] g[stroke]")].filter((g) => g.getClientRects().length).map((g) => getComputedStyle(g).stroke).slice(0, 3))`);
  pruefe("Designsystem: Logo anthrazit auf hell, weiß auf Seitenleiste und dunkel", farben === JSON.stringify([ANTHRAZIT, WEISS, WEISS]), farben);
  await b.klick("[data-theme=dark] [data-passwort-auge]");
  pruefe("Designsystem: Passwortfeld im dunklen Theme umschaltbar", await b.js("document.querySelector('[data-theme=dark] [data-passwort-auge]').parentElement.querySelector('input').type === 'text'"));
  if (fotos) {
    await b.js("[...document.querySelectorAll('h2, h3')].find((x) => x.textContent.trim() === 'Logo')?.scrollIntoView({ block: 'start' })");
    await sleep(300);
    await b.foto(path.join(fotos, "styleguide-logo.png"));
  }
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
