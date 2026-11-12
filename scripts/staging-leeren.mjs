// Staging vor dem Probelauf der Datenübernahme leeren (docs/airtable-uebernahme.md, „Staging leeren“).
// Löscht alle Geschäftsdaten endgültig. Benutzer, Einstellungen, Zahlungsbedingungen, Textvorlagen, Artikel,
// Mitarbeiter, Fahrzeuge, Kolonnen, Ressourcen und Lieferanten bleiben; die Nummernkreise beginnen wieder bei 0.
// Dazu: alle Dateien in den Storage-Buckets und die Inhalte des OneDrive-Testordners (nur wenn der Basisordner
// „_App-Test“ heißt; gelöschte Ordner landen im SharePoint-Papierkorb).
//
//   npm run staging:leeren -- --projekt=<ref>          zeigt, was gelöscht würde
//   npm run staging:leeren -- --projekt=<ref> --ja     löscht
//
// Nie in Produktion: Das Skript bricht ab, wenn LEXWARE_ALTBESTAND oder ONEDRIVE_ALTBESTAND aktiv ist (nur in Produktion
// gesetzt) oder --projekt nicht zum Supabase-Projekt der Umgebung passt.

import { existsSync } from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? process.argv.includes(`--${n}`);
const envDatei = arg("env") || ".env.local";
if (existsSync(envDatei)) process.loadEnvFile(envDatei);
const abbruch = (t) => {
  console.error(`Abbruch: ${t}`);
  process.exit(1);
};
const projekt = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://x").hostname.split(".")[0];
if (arg("projekt") !== projekt) abbruch(`--projekt=${projekt} angeben (Schutz gegen das falsche Projekt).`);
if (process.env.LEXWARE_ALTBESTAND?.trim() === "aktiv" || process.env.ONEDRIVE_ALTBESTAND?.trim() === "aktiv")
  abbruch("Diese Umgebung ist als Produktion eingerichtet (…_ALTBESTAND=aktiv).");
const JA = arg("ja") === true;

/** Geschäftsdaten (TRUNCATE ohne CASCADE: verweist eine behaltene Tabelle darauf, bricht der Lauf ab) */
const LEEREN = [
  "public.zahlung", "public.beleg_anhang", "public.beleg_versand_gruppe", "public.beleg_versand", "public.beleg_version",
  "public.beleg_position", "public.beleg", "public.chat_gelesen", "public.chat_nachricht", "public.ablage_datei",
  "public.ablage_ordner", "public.aufmass_zeile", "public.formular", "public.einsatz_monteur", "public.einsatz",
  "public.termin_mitarbeiter", "public.termin", "public.zeitbuchung", "public.aufgabe", "public.bestellzeile",
  "public.bestellung", "public.benachrichtigung", "public.historie_notiz", "public.service_ticket", "public.auftrag",
  "public.anfrage", "public.kunde_kondition", "public.kunde_lieferadresse", "public.kunde", "public.abwesenheit",
  "public.lexware_ereignis", "audit.log",
];

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  for (const t of LEEREN) {
    const { rows } = await db.query(`select count(*)::int as n from ${t}`);
    console.log(`${t.padEnd(30)} ${rows[0].n}`);
  }
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: buckets } = await service.storage.listBuckets();
  const { rows: einst } = await db.query("select onedrive_drive_id, onedrive_basis_id, onedrive_basis_pfad from public.einstellung where einzig");
  const od = einst[0];
  console.log(`Storage: ${(buckets ?? []).map((b) => b.id).join(", ")}`);
  console.log(`OneDrive: Inhalt von „${od?.onedrive_basis_pfad ?? "–"}“${od?.onedrive_basis_pfad === "_App-Test" ? "" : " (wird NICHT angefasst, kein _App-Test)"}`);
  if (!JA) {
    console.log("\nNur angezeigt. Zum Löschen --ja anhängen.");
    process.exit(0);
  }

  await db.query("begin");
  await db.query(`truncate ${LEEREN.join(", ")}`);
  await db.query("update public.nummernkreis set letzte = 0, jahr = extract(year from now() at time zone 'Europe/Berlin')::int");
  await db.query("update public.einstellung set lexware_zahlung_abgleich_am = null");
  await db.query("commit");
  console.log("Datenbank geleert, Nummernkreise auf 0.");

  // Storage: alle Dateien aller Buckets (rekursiv)
  for (const b of buckets ?? []) {
    let n = 0;
    const ordner = [""];
    while (ordner.length) {
      const pfad = ordner.pop();
      for (;;) {
        const { data } = await service.storage.from(b.id).list(pfad, { limit: 1000 });
        if (!data?.length) break;
        const dateien = data.filter((x) => x.id).map((x) => (pfad ? `${pfad}/${x.name}` : x.name));
        for (const x of data.filter((x) => !x.id)) ordner.push(pfad ? `${pfad}/${x.name}` : x.name);
        if (!dateien.length) break;
        await service.storage.from(b.id).remove(dateien);
        n += dateien.length;
        if (data.length < 1000) break;
      }
    }
    console.log(`Storage ${b.id}: ${n} Dateien gelöscht`);
  }

  // OneDrive: nur der Testordner
  if (od?.onedrive_basis_pfad === "_App-Test" && od.onedrive_drive_id && od.onedrive_basis_id && process.env.MS_GRAPH_CLIENT_SECRET) {
    const tenant = encodeURIComponent(process.env.MS_GRAPH_TENANT_ID.trim());
    const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.MS_GRAPH_CLIENT_ID.trim(), client_secret: process.env.MS_GRAPH_CLIENT_SECRET.trim(), scope: "https://graph.microsoft.com/.default" }),
    });
    if (!r.ok) abbruch(`Microsoft-Anmeldung: HTTP ${r.status}`);
    const { access_token } = await r.json();
    const g = (pfad, init = {}) => fetch(`https://graph.microsoft.com/v1.0${pfad}`, { ...init, headers: { Authorization: `Bearer ${access_token}` } });
    const basis = await (await g(`/drives/${od.onedrive_drive_id}/items/${od.onedrive_basis_id}`)).json();
    if (basis.name !== "_App-Test") abbruch(`Der Basisordner heißt „${basis.name}“, nicht „_App-Test“.`);
    const kinder = await (await g(`/drives/${od.onedrive_drive_id}/items/${od.onedrive_basis_id}/children?$top=999&$select=id,name`)).json();
    let n = 0;
    for (const k of kinder.value ?? []) if ((await g(`/drives/${od.onedrive_drive_id}/items/${k.id}`, { method: "DELETE" })).ok) n++;
    console.log(`OneDrive _App-Test: ${n} von ${(kinder.value ?? []).length} Einträgen in den Papierkorb`);
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.end();
}
