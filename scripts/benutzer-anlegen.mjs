// Benutzer mit Startpasswort anlegen, ohne E-Mail-Versand (Go-live, docs/golive.md).
//
//   npm run benutzer:anlegen -- --email=name@firma.de --name="Vorname Nachname" [--admin] [--konditionen]
//   Produktion: node scripts/prod.mjs npm run benutzer:anlegen -- --email=… --name=… [--admin]
//
// Das Startpasswort wird verdeckt im Terminal abgefragt (zweimal) und nie angezeigt, protokolliert oder als Argument
// übergeben. Das Konto trägt das Kennzeichen „Passwort ändern“ (app_metadata, nur der Server kann es setzen): Nach der
// ersten Anmeldung mit zweitem Faktor leitet die App auf Konto › Passwort, bis das Startpasswort ersetzt ist.
// Der zweite Faktor (Authenticator-App) wird bei der ersten Anmeldung eingerichtet. Eintrag im Audit-Log.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? (process.argv.includes(`--${n}`) ? true : undefined);
const abbruch = (t) => {
  console.error(t);
  process.exit(1);
};
const email = String(arg("email") ?? "").trim().toLowerCase();
const name = String(arg("name") ?? "").trim();
const istAdmin = arg("admin") === true;
const konditionen = arg("konditionen") === true || istAdmin;
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name)
  abbruch('Aufruf: npm run benutzer:anlegen -- --email=name@firma.de --name="Vorname Nachname" [--admin] [--konditionen]');
if (!process.stdin.isTTY) abbruch("Bitte direkt im Terminal ausführen: Das Startpasswort wird verdeckt über die Tastatur abgefragt.");
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: secret } = process.env;
if (!url || !secret) abbruch("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden benötigt.");

/** Verdeckte Eingabe: nichts wird angezeigt, Rücktaste löscht, Strg+C bricht ab */
function verdeckt(text) {
  return new Promise((fertig) => {
    const ein = process.stdin;
    let wert = "";
    process.stdout.write(text);
    ein.setRawMode(true);
    ein.setEncoding("utf8");
    ein.resume();
    const taste = (teil) => {
      for (const z of teil) {
        if (z === "\r" || z === "\n") {
          ein.setRawMode(false);
          ein.pause();
          ein.off("data", taste);
          process.stdout.write("\n");
          fertig(wert);
          return;
        }
        if (z === "\u0003") {
          ein.setRawMode(false);
          process.stdout.write("\nAbgebrochen, nichts angelegt.\n");
          process.exit(130);
        }
        if (z === "\u007f" || z === "\b") wert = wert.slice(0, -1);
        else if (z >= " ") wert += z;
      }
    };
    ein.on("data", taste);
  });
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: vorhanden } = await admin.from("benutzer").select("id").eq("email", email).maybeSingle();
if (vorhanden) abbruch(`Es gibt schon einen Benutzer ${email}. Passwort neu setzen: npm run admin:passwort -- ${email}`);

console.log(`Projekt: ${new URL(url).host}`);
console.log(`Neuer Benutzer: ${name} <${email}>${istAdmin ? " · Admin" : ""}${konditionen ? " · Konditionen sehen" : ""}`);
console.log("Startpasswort: mindestens 12 Zeichen, Groß- und Kleinbuchstaben und eine Ziffer. Muss bei der ersten Anmeldung geändert werden.");
const passwort = await verdeckt("Startpasswort: ");
const fehlt = [];
if (passwort.length < 12) fehlt.push("mindestens 12 Zeichen");
if (!/[a-zäöüß]/.test(passwort)) fehlt.push("ein Kleinbuchstabe");
if (!/[A-ZÄÖÜ]/.test(passwort)) fehlt.push("ein Großbuchstabe");
if (!/\d/.test(passwort)) fehlt.push("eine Ziffer");
if (fehlt.length) abbruch(`Nichts angelegt, es fehlt: ${fehlt.join(", ")}.`);
if ((await verdeckt("Wiederholen:   ")) !== passwort) abbruch("Die beiden Eingaben stimmen nicht überein. Nichts angelegt.");

const { data: neu, error } = await admin.auth.admin.createUser({
  email,
  password: passwort,
  email_confirm: true,
  app_metadata: { passwort_aendern: true },
});
if (error || !neu?.user) abbruch(`Nicht angelegt: ${error?.message ?? "unbekannter Fehler"}`);
const { error: e2 } = await admin.from("benutzer").insert({ id: neu.user.id, name, email, admin: istAdmin, konditionen });
if (e2) {
  await admin.auth.admin.deleteUser(neu.user.id);
  abbruch(`Nicht angelegt (Benutzerzeile): ${e2.message}`);
}
await admin.rpc("konto_ereignis", { p_benutzer: neu.user.id, p_art: "konto_angelegt", p_daten: { admin: istAdmin, konditionen, startpasswort: true, ueber: "skript" } });
console.log(`Angelegt: ${name} <${email}>. Bei der ersten Anmeldung: Authenticator-App einrichten, dann neues Passwort setzen.`);
process.exit(0);
