// End-to-End-Test „Passwort ändern“ (Benutzermenü unten in der Seitenleiste): Anforderungen beim Tippen, falsches
// aktuelles Passwort, erfolgreiche Änderung, andere Sitzungen abgemeldet, Audit-Log, Anmeldung mit dem neuen Passwort.
// Aufruf: App starten, dann APP_URL=http://localhost:3100 npm run test:konto
import { createClient } from "@supabase/supabase-js";
import { aufraeumen, bilanz, browser, dbAbfrage, pruefe, sleep, testAdmin, totp } from "./hilfen.mjs";

const { NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUB } = process.env;
let b;
const neuesPasswort = `Neu-${Date.now().toString(36)}Aa1`;

/** Zweite, unabhängige Sitzung (anderes Gerät) mit zweitem Faktor */
async function zweiteSitzung(admin) {
  const c = createClient(URL_, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: admin.email, password: admin.passwort });
  if (error) throw error;
  const { data: f } = await c.auth.mfa.listFactors();
  await c.auth.mfa.challengeAndVerify({ factorId: f.totp[0].id, code: totp(admin.secret) });
  return c;
}

try {
  const admin = await testAdmin();
  const andere = await zweiteSitzung(admin);
  b = await browser();
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.anmelden(admin);
  await b.warte("location.pathname === '/'");

  await b.klick("aside [data-passwort-aendern]");
  pruefe("Benutzermenü: „Passwort ändern“ öffnet die Seite", await b.warte("location.pathname === '/konto/passwort' && !!document.querySelector('[data-passwort-formular]')"));
  const augen = await b.js("document.querySelectorAll('[data-passwort-formular] input[type=password]').length");
  const knoepfe = await b.js("[...document.querySelectorAll('[data-passwort-formular] button')].filter((x) => /anzeigen|einblenden/i.test(x.getAttribute('aria-label') ?? '')).length");
  pruefe("Drei Passwortfelder, je mit Augen-Symbol", augen === 3 && knoepfe === 3, `${augen} Felder, ${knoepfe} Symbole`);

  // Anforderungen beim Tippen
  await b.tippe("[name=aktuell]", admin.passwort);
  await b.tippe("[name=neu]", "kurz");
  pruefe("Anforderungen: Länge offen, Knopf gesperrt", await b.warte("document.querySelector('[data-regel=laenge]').dataset.erfuellt === 'nein' && document.querySelector('[data-passwort-formular] button[type=submit]').disabled"));
  await b.js("document.querySelector('[name=neu]').select()");
  await b.tippe("[name=neu]", admin.passwort);
  pruefe("Anforderung: nicht gleich dem bisherigen", await b.warte("document.querySelector('[data-regel=anders]').dataset.erfuellt === 'nein'"));

  // Falsches aktuelles Passwort
  await b.js("document.querySelector('[name=aktuell]').select()");
  await b.tippe("[name=aktuell]", "Falsch-Passwort-123");
  await b.js("document.querySelector('[name=neu]').select()");
  await b.tippe("[name=neu]", neuesPasswort);
  await b.tippe("[name=wiederholung]", neuesPasswort);
  await b.klick("[data-passwort-formular] button[type=submit]");
  pruefe("Falsches aktuelles Passwort: abgelehnt", await b.warte("document.querySelector('[data-passwort-formular] [role=alert]')?.innerText.includes('aktuelle Passwort stimmt nicht')"));

  // Richtig
  await b.js("document.querySelector('[name=aktuell]').select()");
  await b.tippe("[name=aktuell]", admin.passwort);
  await b.klick("[data-passwort-formular] button[type=submit]");
  pruefe("Passwort geändert", await b.warte("!!document.querySelector('[data-passwort-ok]')", 20000));
  await b.gehe("/");
  pruefe("diese Sitzung bleibt angemeldet", await b.warte("location.pathname === '/'"));

  // Andere Sitzung abgemeldet
  let andereAbgemeldet = false;
  for (let i = 0; i < 10 && !andereAbgemeldet; i++) {
    const { error } = await andere.auth.refreshSession();
    andereAbgemeldet = !!error;
    if (!andereAbgemeldet) await sleep(500);
  }
  pruefe("andere Sitzung abgemeldet (Token ungültig)", andereAbgemeldet);

  // Neues Passwort gilt, altes nicht
  const c = createClient(URL_, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const alt = await c.auth.signInWithPassword({ email: admin.email, password: admin.passwort });
  const neu = await c.auth.signInWithPassword({ email: admin.email, password: neuesPasswort });
  pruefe("Anmeldung: altes Passwort abgelehnt, neues angenommen", !!alt.error && !neu.error, `${alt.error?.message ?? "alt ok"} / ${neu.error?.message ?? "neu ok"}`);
  await c.auth.signOut({ scope: "local" }).catch(() => {});

  const [log] = await dbAbfrage("select aktion, nachher from audit.log where tabelle = 'konto' and benutzer_id = $1 order by zeit desc limit 1", [admin.id]);
  pruefe("Audit-Log: Passwort geändert", log?.aktion === "ereignis" && log?.nachher?.ereignis === "passwort_geaendert", JSON.stringify(log));
} catch (e) {
  pruefe("Ablauf ohne Ausnahme", false, e.stack ?? String(e));
} finally {
  b?.ende();
  await aufraeumen();
  bilanz();
}
