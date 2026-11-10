// Neues Passwort für einen Benutzer über die Supabase-Admin-Schnittstelle setzen (z. B. wenn der E-Mail-Versand für
// „Passwort vergessen“ noch fehlt). Ziel ist das Projekt aus .env.local.
// Aufruf im Terminal (nicht in einem Skript): npm run admin:passwort -- <email>
// Das Passwort wird verdeckt abgefragt (zweimal) und nie angezeigt, protokolliert oder als Argument übergeben.
// Der zweite Faktor (TOTP) bleibt unverändert.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
if (args.length !== 1 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args[0])) {
  console.error("Aufruf: npm run admin:passwort -- <email>   (das Passwort wird danach verdeckt abgefragt)");
  process.exit(1);
}
if (!process.stdin.isTTY) {
  console.error("Bitte direkt im Terminal ausführen: Das Passwort wird verdeckt über die Tastatur abgefragt.");
  process.exit(1);
}
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: secret } = process.env;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden benötigt (.env.local).");
  process.exit(1);
}

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
          process.stdout.write("\nAbgebrochen, nichts geändert.\n");
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
const email = args[0].toLowerCase();
const { data: benutzer, error: suchFehler } = await admin.from("benutzer").select("id, name, admin, aktiv").eq("email", email).maybeSingle();
if (suchFehler || !benutzer) {
  console.error(`Kein Benutzer mit der E-Mail-Adresse ${email} in ${new URL(url).host}.`);
  process.exit(1);
}
console.log(`Projekt: ${new URL(url).host}`);
console.log(`Benutzer: ${benutzer.name} <${email}>${benutzer.admin ? " · Admin" : ""}${benutzer.aktiv ? "" : " · DEAKTIVIERT"}`);
console.log("Regeln: mindestens 12 Zeichen, Groß- und Kleinbuchstaben und eine Ziffer.");

const passwort = await verdeckt("Neues Passwort: ");
const fehler = [];
if (passwort.length < 12) fehler.push("mindestens 12 Zeichen");
if (!/[a-zäöüß]/.test(passwort)) fehler.push("ein Kleinbuchstabe");
if (!/[A-ZÄÖÜ]/.test(passwort)) fehler.push("ein Großbuchstabe");
if (!/\d/.test(passwort)) fehler.push("eine Ziffer");
if (fehler.length) {
  console.error(`Passwort nicht gesetzt, es fehlt: ${fehler.join(", ")}.`);
  process.exit(1);
}
if ((await verdeckt("Wiederholen:     ")) !== passwort) {
  console.error("Die beiden Eingaben stimmen nicht überein. Nichts geändert.");
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(benutzer.id, { password: passwort });
if (error) {
  console.error(`Passwort konnte nicht gesetzt werden: ${error.message}`);
  process.exit(1);
}
console.log("Neues Passwort gesetzt. Der zweite Faktor (Authenticator-App) bleibt wie bisher.");
