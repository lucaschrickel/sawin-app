// Ersten Admin einer Instanz einladen (danach lädt dieser Admin alle weiteren Benutzer in der App ein).
// Aufruf: npm run admin:einladen -- <email> "<Name>" [--ohne-email]
//
// Standard: Supabase verschickt die Einladung per E-Mail (braucht die eigenen E-Mail-Vorlagen, siehe docs/uebergabe.md).
// --ohne-email: erzeugt den Einladungslink über die Admin-API und schreibt ihn in eine lokale Datei (für Projekte ohne
// eigenen SMTP-Zugang). Der Link gilt einmal und eine Stunde; die Datei danach löschen.
import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
const ohneEmail = args.includes("--ohne-email");
const [email, name] = args.filter((a) => a !== "--ohne-email");
if (!email || !name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Aufruf: npm run admin:einladen -- <email> "<Name>" [--ohne-email]');
  process.exit(1);
}
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: secret, SUPABASE_AUTH_SITE_URL: site } = process.env;
if (!url || !secret || (ohneEmail && !site)) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (und für --ohne-email SUPABASE_AUTH_SITE_URL) werden benötigt.");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const adresse = email.toLowerCase();

let userId, link;
if (ohneEmail) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: adresse });
  if (error) {
    console.error(`Einladungslink fehlgeschlagen: ${error.message}`);
    process.exit(1);
  }
  userId = data.user.id;
  link = `${site.replace(/\/$/, "")}/auth/bestaetigen?token_hash=${data.properties.hashed_token}&type=invite`;
} else {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(adresse);
  if (error) {
    console.error(`Einladung fehlgeschlagen: ${error.message}`);
    process.exit(1);
  }
  userId = data.user.id;
}

const { error: dbFehler } = await admin.from("benutzer").insert({ id: userId, name, email: adresse, admin: true, konditionen: true });
if (dbFehler) {
  console.error(`Benutzer konnte nicht angelegt werden: ${dbFehler.message}`);
  await admin.auth.admin.deleteUser(userId);
  process.exit(1);
}

if (link) {
  const datei = path.join(os.tmpdir(), `einladung-${adresse.replace(/[^a-z0-9]+/g, "-")}.txt`);
  writeFileSync(datei, `Einladungslink für ${name} <${adresse}> (einmal gültig, eine Stunde):\n${link}\n`, { mode: 0o600 });
  console.log(`${name} ist als Admin angelegt. Einladungslink (nicht weitergeben, nach Gebrauch löschen):\n  ${datei}`);
} else {
  console.log(`Einladung an ${adresse} verschickt. ${name} ist Admin mit Recht „Konditionen sehen“.`);
}
