// Tests für Row Level Security, Admin-Rechte, Soft Delete und Audit-Log gegen das Supabase-Projekt aus .env.local
// (Staging). Aufruf: npm run test:rls
//
// Der Test legt eigene Testbenutzer (mit MFA per TOTP) und Testdaten über die Service-Rolle an und entfernt sie am
// Ende wieder. Weil niemand über die API echt löschen darf (auch die Service-Rolle nicht), räumt der Test über die
// direkte Datenbankverbindung (SUPABASE_DB_URL) auf. Im Audit-Log bleiben die Einträge der Testläufe erhalten (es ist
// nur anhängbar). Jeder Lauf verbraucht Kunden- und Anfragenummern; vor dem Go-live werden die Nummernkreise ohnehin
// auf die Startwerte gesetzt. Nur gegen Staging ausführen.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
if (!URL || !PUBLISHABLE || !SERVICE || !DB_URL) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY und SUPABASE_DB_URL werden benötigt");
}

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(URL, SERVICE, opts);
const anon = createClient(URL, PUBLISHABLE, opts);
const lauf = randomBytes(3).toString("hex");

// ---------- TOTP (RFC 6238) für die MFA-Anmeldung der Testbenutzer ----------
function base32(text) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of text.replace(/=+$/, "").toUpperCase()) {
    const v = abc.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// ---------- Testdaten verwalten ----------
const angelegt = []; // [tabelle, id] in Anlegereihenfolge, wird rückwärts entfernt
const authUser = [];
async function svcInsert(tabelle, zeile) {
  const { data, error } = await service.from(tabelle).insert(zeile).select().single();
  if (error) throw new Error(`Testdaten ${tabelle}: ${error.message}`);
  angelegt.push([tabelle, data.id]);
  return data;
}
async function benutzerAnlegen(name, { admin = false, konditionen = false, mfa = true } = {}) {
  const email = `rls-test-${lauf}-${name}@example.com`;
  const password = `${randomBytes(18).toString("base64url")}Aa1`; // erfüllt die Passwortregeln (Groß, klein, Ziffer)
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`Testbenutzer ${name}: ${error.message}`);
  authUser.push(data.user.id);
  await svcInsert("benutzer", { id: data.user.id, name: `Test ${name} ${lauf}`, email, admin, konditionen });
  const client = createClient(URL, PUBLISHABLE, opts);
  const anm = await client.auth.signInWithPassword({ email, password });
  if (anm.error) throw new Error(`Anmeldung ${name}: ${anm.error.message}`);
  if (mfa) {
    const enr = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `test-${lauf}` });
    if (enr.error) throw new Error(`MFA ${name}: ${enr.error.message}`);
    const ver = await client.auth.mfa.challengeAndVerify({ factorId: enr.data.id, code: totp(enr.data.totp.secret) });
    if (ver.error) throw new Error(`MFA-Bestätigung ${name}: ${ver.error.message}`);
  }
  return { id: data.user.id, client };
}
async function tabellenDerApi() {
  const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  const spec = await res.json();
  return Object.keys(spec.paths).filter((p) => p !== "/" && !p.startsWith("/rpc/")).map((p) => p.slice(1));
}

/** Beleg über beleg_speichern anlegen (eine Position) und für das Aufräumen merken */
async function belegSpeichern(wer, kopf, positionen = [{ titel: "Haustür", menge: 1, einzelpreis: 1000, steuersatz: 19 }]) {
  const { data: id, error } = await wer.client.rpc("beleg_speichern", { p_id: null, p_kopf: kopf, p_positionen: positionen });
  if (error) throw new Error(`beleg_speichern: ${error.message}`);
  angelegt.push(["beleg", id]);
  const { data: b } = await service.from("beleg").select("*").eq("id", id).single();
  if (b.anfrage_id && !angelegt.some(([t, x]) => t === "anfrage" && x === b.anfrage_id) && b.anfrage_id !== daten?.anfrage?.id) angelegt.splice(angelegt.length - 1, 0, ["anfrage", b.anfrage_id]);
  const { data: pos } = await service.from("beleg_position").select("id").eq("beleg_id", id);
  for (const p of pos ?? []) angelegt.push(["beleg_position", p.id]);
  return b;
}
async function fertig(wer, id) {
  const { data, error } = await wer.client.rpc("beleg_fertigstellen", { p_id: id });
  if (error) throw new Error(`beleg_fertigstellen: ${error.message}`);
  return data;
}

// ---------- Aufbau ----------
let admin, buero, ohneMfa, deaktiviert, daten;
before(async () => {
  admin = await benutzerAnlegen("admin", { admin: true, konditionen: true });
  buero = await benutzerAnlegen("buero");
  ohneMfa = await benutzerAnlegen("ohnemfa", { mfa: false });
  deaktiviert = await benutzerAnlegen("deaktiviert");

  const kz = "T" + Array.from(randomBytes(3), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[b % 26]).join("");
  const monteur = await svcInsert("mitarbeiter", { kuerzel: kz, name: `Testmonteur ${lauf}`, ist_monteur: true });
  const kunde = await svcInsert("kunde", { name: `Testkunde ${lauf}` });
  await svcInsert("kunde_kondition", { kunde_id: kunde.id, text: "Test: 5 % Rabatt" });
  const anfrage = await svcInsert("anfrage", { titel: `Testanfrage ${lauf}`, kunde_id: kunde.id });
  const auftrag = await svcInsert("auftrag", { nummer: `TEST-${lauf}`, kunde_id: kunde.id, anfrage_id: anfrage.id, titel: "Test" });
  const ab = await svcInsert("beleg", { art: "auftragsbestaetigung", auftrag_id: auftrag.id, kunde_id: kunde.id });
  await svcInsert("beleg_position", { beleg_id: ab.id, titel: "Haustür", menge: 1, einzelpreis: 1000 });
  const beginn = new Date(Date.now() + 7 * 864e5);
  const einsatz = await svcInsert("einsatz", { auftrag_id: auftrag.id, beginn: beginn.toISOString(), ende: new Date(beginn.getTime() + 8 * 36e5).toISOString() });
  await svcInsert("einsatz_monteur", { einsatz_id: einsatz.id, mitarbeiter_id: monteur.id });
  await svcInsert("zeitbuchung", { mitarbeiter_id: monteur.id, auftrag_id: auftrag.id, datum: "2026-11-02", beginn: "07:00", ende: "15:00", pause_min: 30, art: "montage" });
  await svcInsert("aufgabe", { titel: `Testaufgabe ${lauf}`, auftrag_id: auftrag.id });
  await svcInsert("abwesenheit", { mitarbeiter_id: monteur.id, art: "urlaub", von: "2026-12-01", bis: "2026-12-05" });
  daten = { monteur, kunde, anfrage, auftrag, ab };
});

after(async () => {
  const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query("begin");
    for (const [tabelle, id] of angelegt.reverse()) {
      if (tabelle === "beleg") {
        // Abhängige Zeilen, die beim erneuten Speichern bzw. über Funktionen entstanden sind (nicht in „angelegt“)
        await db.query("delete from public.zahlung where beleg_id = $1 or zahlungsbestaetigung_id = $1", [id]);
        await db.query("delete from public.beleg_position where beleg_id = $1 or abzug_beleg_id = $1", [id]);
        await db.query("delete from public.beleg_version where beleg_id = $1", [id]);
        await db.query("delete from public.beleg_versand where beleg_id = $1", [id]);
        await db.query("update public.beleg set vorgaenger_id = null where vorgaenger_id = $1", [id]);
      }
      if (tabelle === "chat_nachricht") await db.query("delete from public.chat_gelesen where nachricht_id = $1", [id]);
      if (tabelle === "formular") {
        await db.query("delete from public.aufmass_zeile where formular_id = $1", [id]);
        await db.query("delete from public.ablage_datei where formular_id = $1", [id]);
      }
      await db.query(`delete from public.${pg.escapeIdentifier(tabelle)} where id = $1`, [id]);
    }
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    console.error(`Aufräumen fehlgeschlagen: ${e.message}`);
  } finally {
    await db.end();
  }
  for (const id of authUser) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) console.error(`Testbenutzer ${id} nicht entfernt: ${error.message}`);
  }
});

// ---------- Tests ----------
describe("Nicht angemeldete Benutzer", () => {
  it("lesen aus keiner Tabelle der API etwas", async () => {
    const tabellen = await tabellenDerApi();
    assert.ok(tabellen.length >= 40, `nur ${tabellen.length} Tabellen in der API gefunden`);
    for (const t of ["kunde", "kunde_kondition", "auftrag", "beleg", "abwesenheit", "benutzer", "einstellung", "nummernkreis"]) {
      const { data } = await service.from(t).select("id").limit(1);
      assert.ok(data?.length, `Kontrolle: Service-Rolle sieht Daten in ${t}`);
    }
    for (const t of tabellen) {
      const { data, error } = await anon.from(t).select("*").limit(5);
      assert.ok(error || data.length === 0, `anon liest Zeilen aus ${t}`);
    }
  });

  it("können nichts anlegen und keine Funktionen aufrufen", async () => {
    const ins = await anon.from("kunde").insert({ name: "Einbruch" });
    assert.ok(ins.error, "anon konnte einen Kunden anlegen");
    const del = await anon.rpc("loeschen", { p_tabelle: "kunde", p_id: daten.kunde.id });
    assert.ok(del.error, "anon konnte loeschen() aufrufen");
    const his = await anon.rpc("historie", { p_tabelle: "kunde", p_id: daten.kunde.id });
    assert.ok(his.error || his.data.length === 0, "anon konnte die Historie lesen");
  });
});

describe("Angemeldet ohne bestätigte MFA", () => {
  it("liest nichts und legt nichts an", async () => {
    for (const t of ["kunde", "auftrag", "beleg", "abwesenheit", "mitarbeiter"]) {
      const { data, error } = await ohneMfa.client.from(t).select("id").limit(5);
      assert.ok(error || data.length === 0, `ohne MFA lesbar: ${t}`);
    }
    const ins = await ohneMfa.client.from("aufgabe").insert({ titel: "ohne MFA" }).select();
    assert.ok(ins.error, "ohne MFA konnte eine Aufgabe angelegt werden");
  });
});

describe("Deaktivierte Benutzer", () => {
  it("sehen trotz gültiger MFA-Sitzung nichts mehr", async () => {
    const vorher = await deaktiviert.client.from("kunde").select("id").eq("id", daten.kunde.id);
    assert.equal(vorher.data.length, 1, "Kontrolle: aktiv sieht der Benutzer den Kunden");
    await service.from("benutzer").update({ aktiv: false }).eq("id", deaktiviert.id);
    for (const t of ["kunde", "auftrag", "beleg", "abwesenheit", "benutzer"]) {
      const { data, error } = await deaktiviert.client.from(t).select("id").limit(5);
      assert.ok(error || data.length === 0, `deaktiviert lesbar: ${t}`);
    }
    const ins = await deaktiviert.client.from("aufgabe").insert({ titel: "deaktiviert" }).select();
    assert.ok(ins.error, "deaktivierter Benutzer konnte eine Aufgabe anlegen");
  });
});

describe("Angemeldete Büro-Benutzer", () => {
  it("lesen Fachdaten", async () => {
    const { data, error } = await buero.client.from("kunde").select("id").eq("id", daten.kunde.id);
    assert.ifError(error);
    assert.equal(data.length, 1);
  });

  it("sehen Kunden-Konditionen nur mit dem Recht „Konditionen“", async () => {
    const ohne = await buero.client.from("kunde_kondition").select("*").eq("kunde_id", daten.kunde.id);
    assert.equal(ohne.data?.length ?? 0, 0, "Büro ohne Recht sieht Konditionen");
    const mit = await admin.client.from("kunde_kondition").select("*").eq("kunde_id", daten.kunde.id);
    assert.ifError(mit.error);
    assert.equal(mit.data.length, 1);
  });

  it("können sich nicht selbst zum Admin machen und keine Benutzer anlegen", async () => {
    await buero.client.from("benutzer").update({ admin: true }).eq("id", buero.id);
    const { data } = await service.from("benutzer").select("admin").eq("id", buero.id).single();
    assert.equal(data.admin, false);
    const ins = await buero.client.from("benutzer").insert({ id: randomUUID(), name: "x", email: "x@example.com" });
    assert.ok(ins.error, "Büro konnte einen Benutzer anlegen");
  });
});

describe("Abwesenheiten genehmigen", () => {
  let antrag;
  it("ein Antrag des Büros ist „beantragt“", async () => {
    const { data, error } = await buero.client.from("abwesenheit")
      .insert({ mitarbeiter_id: daten.monteur.id, art: "urlaub", von: "2027-01-04", bis: "2027-01-08" }).select().single();
    assert.ifError(error);
    angelegt.push(["abwesenheit", data.id]);
    assert.equal(data.status, "beantragt");
    antrag = data;
  });

  it("Nicht-Admins können nicht genehmigen oder ablehnen", async () => {
    for (const status of ["genehmigt", "abgelehnt"]) {
      const { error } = await buero.client.from("abwesenheit").update({ status }).eq("id", antrag.id);
      assert.ok(error, `Büro konnte auf „${status}“ setzen`);
      assert.equal(error.code, "42501");
    }
    const { data } = await service.from("abwesenheit").select("status, entschieden_von").eq("id", antrag.id).single();
    assert.equal(data.status, "beantragt");
    assert.equal(data.entschieden_von, null);
  });

  it("Nicht-Admins können keine bereits genehmigte Abwesenheit anlegen", async () => {
    const { error } = await buero.client.from("abwesenheit")
      .insert({ mitarbeiter_id: daten.monteur.id, art: "schulung", von: "2027-02-01", bis: "2027-02-01", status: "genehmigt" });
    assert.ok(error, "Büro konnte eine genehmigte Abwesenheit anlegen");
  });

  it("Krankmeldungen gelten sofort als genehmigt", async () => {
    const { data, error } = await buero.client.from("abwesenheit")
      .insert({ mitarbeiter_id: daten.monteur.id, art: "krank", von: "2026-11-10", bis: "2026-11-11" }).select().single();
    assert.ifError(error);
    angelegt.push(["abwesenheit", data.id]);
    assert.equal(data.status, "genehmigt");
  });

  it("der Admin genehmigt, entschieden_von ist der Admin", async () => {
    const { data, error } = await admin.client.from("abwesenheit").update({ status: "genehmigt" }).eq("id", antrag.id).select().single();
    assert.ifError(error);
    assert.equal(data.status, "genehmigt");
    assert.equal(data.entschieden_von, admin.id);
    assert.ok(data.entschieden_am);
  });

  it("ändert das Büro den Zeitraum einer genehmigten Abwesenheit, ist sie wieder beantragt", async () => {
    const { data, error } = await buero.client.from("abwesenheit").update({ bis: "2027-01-12" }).eq("id", antrag.id).select().single();
    assert.ifError(error);
    assert.equal(data.status, "beantragt");
  });

  it("der Admin kann ablehnen", async () => {
    const { data, error } = await admin.client.from("abwesenheit").update({ status: "abgelehnt" }).eq("id", antrag.id).select().single();
    assert.ifError(error);
    assert.equal(data.status, "abgelehnt");
  });

  it("eine entschiedene Abwesenheit löscht nur der Admin (nur als Markierung)", async () => {
    const buerolöschen = await buero.client.rpc("loeschen", { p_tabelle: "abwesenheit", p_id: antrag.id });
    assert.equal(buerolöschen.error?.code, "42501");
    assert.ifError((await admin.client.rpc("loeschen", { p_tabelle: "abwesenheit", p_id: antrag.id })).error);
    const { data: roh } = await service.from("abwesenheit").select("deleted_at").eq("id", antrag.id).single();
    assert.ok(roh.deleted_at);
  });

  it("einen eigenen Antrag und eine Krankmeldung darf jeder löschen", async () => {
    const { data: a } = await buero.client.from("abwesenheit").insert({ mitarbeiter_id: daten.monteur.id, art: "schulung", von: "2027-03-01", bis: "2027-03-02" }).select().single();
    angelegt.push(["abwesenheit", a.id]);
    assert.ifError((await buero.client.rpc("loeschen", { p_tabelle: "abwesenheit", p_id: a.id })).error);
    const { data: k } = await buero.client.from("abwesenheit").insert({ mitarbeiter_id: daten.monteur.id, art: "krank", von: "2027-03-03", bis: "2027-03-03" }).select().single();
    angelegt.push(["abwesenheit", k.id]);
    assert.equal(k.status, "genehmigt");
    assert.ifError((await buero.client.rpc("loeschen", { p_tabelle: "abwesenheit", p_id: k.id })).error);
  });
});

describe("Kunden", () => {
  it("kunde_speichern legt Kunde und Lieferadressen in einem Schritt an", async () => {
    const { data: id, error } = await buero.client.rpc("kunde_speichern", {
      p_id: null,
      p_kunde: { name: `RPC-Kunde ${lauf}`, typ: "firma", bauleister_13b: true, ort: "Gifhorn" },
      p_lieferadressen: [{ bezeichnung: "Objekt A", strasse: "Weg 1", plz: "38518", ort: "Gifhorn", alt: false }],
    });
    assert.ifError(error);
    angelegt.push(["kunde", id]);
    const { data: la } = await service.from("kunde_lieferadresse").select("id, bezeichnung").eq("kunde_id", id);
    la.forEach((x) => angelegt.push(["kunde_lieferadresse", x.id]));
    assert.equal(la.length, 1);
    const { data: k } = await service.from("kunde").select("nummer, created_by").eq("id", id).single();
    assert.ok(k.nummer, "Kundennummer vergeben");
    assert.equal(k.created_by, buero.id);
  });

  it("Lieferadresse eines anderen Kunden lässt sich darüber nicht ändern", async () => {
    const { data: fremd } = await service.from("kunde_lieferadresse").insert({ kunde_id: daten.kunde.id, strasse: "Fremd 1" }).select("id").single();
    angelegt.push(["kunde_lieferadresse", fremd.id]);
    const { data: id } = await buero.client.rpc("kunde_speichern", { p_id: null, p_kunde: { name: `RPC-Kunde2 ${lauf}` }, p_lieferadressen: [] });
    angelegt.push(["kunde", id]);
    const { error } = await buero.client.rpc("kunde_speichern", {
      p_id: id,
      p_kunde: { name: `RPC-Kunde2 ${lauf}` },
      p_lieferadressen: [{ id: fremd.id, strasse: "Gekapert 1" }],
    });
    assert.ok(error, "fremde Lieferadresse geändert");
    const { data } = await service.from("kunde_lieferadresse").select("strasse").eq("id", fremd.id).single();
    assert.equal(data.strasse, "Fremd 1");
  });

  it("Lexware-Felder kann kein Benutzer setzen", async () => {
    await buero.client.from("kunde").update({ lexware_kontakt_id: "gefaelscht", lexware_seit: new Date().toISOString() }).eq("id", daten.kunde.id);
    const { data } = await service.from("kunde").select("lexware_kontakt_id, lexware_seit").eq("id", daten.kunde.id).single();
    assert.equal(data.lexware_kontakt_id, null);
    assert.equal(data.lexware_seit, null);
  });

  it("ein Kunde mit Anfragen und Aufträgen lässt sich nicht löschen, mit Begründung", async () => {
    const { error } = await buero.client.rpc("loeschen", { p_tabelle: "kunde", p_id: daten.kunde.id });
    assert.ok(error, "Kunde mit Anfrage gelöscht");
    assert.equal(error.code, "23503");
    assert.match(error.message, /Anfragen, Aufträge/);
    const { data } = await service.from("kunde").select("deleted_at").eq("id", daten.kunde.id).single();
    assert.equal(data.deleted_at, null);
  });
});

describe("Anfragen", () => {
  let anfrage;
  it("ein Aufmaß-Termin stellt eine neue Anfrage auf „Aufmaß“", async () => {
    const { data, error } = await buero.client
      .from("anfrage")
      .insert({ titel: `RLS-Anfrage ${lauf}`, kunde_id: daten.kunde.id, aufmass_termin: new Date(Date.now() + 864e5).toISOString() })
      .select()
      .single();
    assert.ifError(error);
    angelegt.push(["anfrage", data.id]);
    assert.equal(data.status, "aufmass");
    assert.equal(data.created_by, buero.id);
    anfrage = data;
  });

  it("ohne Kunde gibt es keine Anfrage", async () => {
    const { error } = await buero.client.from("anfrage").insert({ titel: "ohne Kunde" });
    assert.ok(error, "Anfrage ohne Kunde angelegt");
  });

  it("verloren nur mit Grund", async () => {
    const { error } = await buero.client.from("anfrage").update({ archiv: "verloren" }).eq("id", anfrage.id);
    assert.ok(error, "verloren ohne Grund möglich");
  });

  it("Auftrag entsteht mit der AB: Nummer = AB-Nummer, Angebot angenommen, Anfrage gewonnen, nur einmal", async () => {
    const start = angelegt.length;
    const ag = await belegSpeichern(buero, { art: "angebot", kunde_id: daten.kunde.id, anfrage_id: anfrage.id });
    assert.match(ag.nummer, /^AG1\d{6}$/, "Angebot hat schon als Entwurf seine Nummer");
    await fertig(buero, ag.id);
    const ab = await belegSpeichern(buero, { art: "auftragsbestaetigung", kunde_id: daten.kunde.id, vorgaenger_id: ag.id });
    const { data: erg, error } = await buero.client.rpc("beleg_fertigstellen", { p_id: ab.id });
    assert.ifError(error);
    angelegt.splice(start, 0, ["auftrag", erg.auftrag_id]);
    const { data: a } = await service.from("auftrag").select("nummer, kunde_id, anfrage_id, titel, created_by").eq("id", erg.auftrag_id).single();
    assert.match(a.nummer, /^AB2\d{6}$/, `Auftragsnummer aus dem AB-Nummernkreis: ${a.nummer}`);
    assert.equal(a.nummer, erg.nummer, "Auftragsnummer = AB-Nummer");
    assert.equal(a.kunde_id, daten.kunde.id);
    assert.equal(a.titel, anfrage.titel);
    assert.equal(a.created_by, buero.id);
    const { data: kette } = await service.from("beleg").select("id, art, status, anfrage_id, auftrag_id").in("id", [ag.id, ab.id]);
    assert.ok(kette.every((b) => b.auftrag_id === erg.auftrag_id && !b.anfrage_id), "Kette hängt am Auftrag");
    assert.equal(kette.find((b) => b.art === "angebot").status, "angenommen");
    const { data: q } = await service.from("anfrage").select("archiv, archiviert_am").eq("id", anfrage.id).single();
    assert.equal(q.archiv, "gewonnen");
    assert.ok(q.archiviert_am);
    // zweite AB an derselben Anfrage: abgelehnt
    const ab2 = await belegSpeichern(buero, { art: "auftragsbestaetigung", kunde_id: daten.kunde.id, anfrage_id: anfrage.id });
    const zweite = await buero.client.rpc("beleg_fertigstellen", { p_id: ab2.id });
    assert.ok(zweite.error, "zweiter Auftrag aus derselben Anfrage");
  });

  it("eine gewonnene Anfrage mit Auftrag lässt sich weder zurücksetzen noch löschen", async () => {
    const zurueck = await buero.client.from("anfrage").update({ archiv: null }).eq("id", anfrage.id);
    assert.ok(zurueck.error, "gewonnene Anfrage zurückgesetzt");
    const loeschen = await buero.client.rpc("loeschen", { p_tabelle: "anfrage", p_id: anfrage.id });
    assert.equal(loeschen.error?.code, "23503");
    assert.match(loeschen.error.message, /Auftrag/);
  });
});

describe("Aufgaben", () => {
  it("höchstens ein Bezug (Kunde, Anfrage, Auftrag oder Ticket)", async () => {
    const zwei = await buero.client.from("aufgabe").insert({ titel: "zwei Bezüge", kunde_id: daten.kunde.id, anfrage_id: daten.anfrage.id });
    assert.ok(zwei.error, "Aufgabe mit zwei Bezügen angelegt");
    const { data, error } = await buero.client.from("aufgabe").insert({ titel: `Bezug Kunde ${lauf}`, kunde_id: daten.kunde.id, zustaendig_id: buero.id }).select().single();
    assert.ifError(error);
    angelegt.push(["aufgabe", data.id]);
    assert.equal(data.kunde_id, daten.kunde.id);
  });

  it("Abhaken setzt erledigt_am, wieder öffnen leert es", async () => {
    const { data: a } = await buero.client.from("aufgabe").insert({ titel: `Abhaken ${lauf}` }).select().single();
    angelegt.push(["aufgabe", a.id]);
    const { data: erledigt } = await buero.client.from("aufgabe").update({ status: "erledigt" }).eq("id", a.id).select().single();
    assert.ok(erledigt.erledigt_am);
    const { data: offen } = await buero.client.from("aufgabe").update({ status: "offen" }).eq("id", a.id).select().single();
    assert.equal(offen.erledigt_am, null);
  });

  it("Zuständig ist ein Benutzer, kein Mitarbeiter", async () => {
    const { error } = await buero.client.from("aufgabe").insert({ titel: "Monteur zuständig", zustaendig_id: daten.monteur.id });
    assert.ok(error, "Mitarbeiter als Zuständiger akzeptiert");
  });
});

describe("Aufträge", () => {
  it("nur die Phasen aus CLAUDE.md; „Abgeschlossen“ setzt und leert abgeschlossen_am", async () => {
    const falsch = await buero.client.from("auftrag").update({ phase: "montiert" }).eq("id", daten.auftrag.id);
    assert.ok(falsch.error, "unbekannte Phase akzeptiert");
    const { data: zu, error } = await buero.client.from("auftrag").update({ phase: "abgeschlossen" }).eq("id", daten.auftrag.id).select().single();
    assert.ifError(error);
    assert.ok(zu.abgeschlossen_am);
    const { data: auf } = await buero.client.from("auftrag").update({ phase: "reklamation" }).eq("id", daten.auftrag.id).select().single();
    assert.equal(auf.abgeschlossen_am, null);
  });

  it("die Auftragsnummer lässt sich nicht ändern", async () => {
    const { data } = await buero.client.from("auftrag").update({ nummer: "AB2999999" }).eq("id", daten.auftrag.id).select("nummer").single();
    assert.equal(data.nummer, daten.auftrag.nummer);
  });

  it("ein Auftrag mit Belegen oder Einsätzen lässt sich nicht löschen", async () => {
    const { error } = await buero.client.rpc("loeschen", { p_tabelle: "auftrag", p_id: daten.auftrag.id });
    assert.equal(error?.code, "23503");
    assert.match(error.message, /Belege/);
    assert.match(error.message, /Einsätze/);
  });

  it("ein leerer Auftrag wird nur markiert; danach lässt sich die Anfrage zurücksetzen", async () => {
    const { data: q } = await buero.client.from("anfrage").insert({ titel: `Löschtest ${lauf}`, kunde_id: daten.kunde.id }).select().single();
    angelegt.push(["anfrage", q.id]);
    await service.from("anfrage").update({ archiv: "gewonnen" }).eq("id", q.id);
    const { id: auftragId } = await svcInsert("auftrag", { nummer: `LEER-${lauf}`, kunde_id: daten.kunde.id, anfrage_id: q.id, titel: "leer" });
    const { error } = await buero.client.rpc("loeschen", { p_tabelle: "auftrag", p_id: auftragId });
    assert.ifError(error);
    const { data: sichtbar } = await buero.client.from("auftrag").select("id").eq("id", auftragId);
    assert.equal(sichtbar.length, 0, "gelöschter Auftrag noch sichtbar");
    const { data: roh } = await service.from("auftrag").select("deleted_at, deleted_by").eq("id", auftragId).single();
    assert.ok(roh.deleted_at, "Datensatz fehlt statt markiert");
    assert.equal(roh.deleted_by, buero.id);
    const zurueck = await buero.client.from("anfrage").update({ archiv: null }).eq("id", q.id);
    assert.ifError(zurueck.error);
  });
});

describe("Montageplan", () => {
  let zweiter, einsatzId;
  const t = (iso) => new Date(iso).toISOString();
  before(async () => {
    const kz = "U" + Array.from(randomBytes(3), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[b % 26]).join("");
    zweiter = await svcInsert("mitarbeiter", { kuerzel: kz, name: `Zweiter Monteur ${lauf}`, ist_monteur: true });
  });
  const team = async (id) =>
    (await buero.client.from("einsatz_monteur").select("mitarbeiter_id").eq("einsatz_id", id)).data.map((x) => x.mitarbeiter_id).sort();

  it("Einsatz mit zwei Monteuren in einem Schritt anlegen", async () => {
    const { data, error } = await buero.client.rpc("einsatz_speichern", {
      p_id: null, p_auftrag_id: daten.auftrag.id, p_ticket_id: null, p_fahrzeug_id: null, p_beginn: t("2026-12-02T06:00:00Z"), p_ende: t("2026-12-02T15:00:00Z"),
      p_monteure: [daten.monteur.id, zweiter.id], p_fest: false, p_hinweis: "Seiteneingang",
    });
    assert.ifError(error);
    einsatzId = data;
    angelegt.push(["einsatz", data]);
    const { data: em } = await service.from("einsatz_monteur").select("id").eq("einsatz_id", data);
    em.forEach((x) => angelegt.push(["einsatz_monteur", x.id]));
    assert.deepEqual(await team(data), [daten.monteur.id, zweiter.id].sort());
  });

  it("Konflikte: Abwesenheit (beantragt) und Überschneidung mit einem anderen Einsatz", async () => {
    const { data, error } = await buero.client.rpc("einsatz_konflikte", { p_von: t("2026-11-30T00:00:00Z"), p_bis: t("2026-12-07T00:00:00Z") });
    assert.ifError(error);
    const eigene = data.filter((k) => k.einsatz_id === einsatzId);
    assert.ok(eigene.some((k) => k.art === "abwesend" && k.mitarbeiter_id === daten.monteur.id && k.detail === "urlaub:beantragt"), "Abwesenheit fehlt");
    assert.ok(!eigene.some((k) => k.mitarbeiter_id === zweiter.id), "zweiter Monteur ohne Konflikt");
    const { data: zweiterEinsatz } = await buero.client.rpc("einsatz_speichern", {
      p_id: null, p_auftrag_id: daten.auftrag.id, p_ticket_id: null, p_fahrzeug_id: null, p_beginn: t("2026-12-02T12:00:00Z"), p_ende: t("2026-12-02T14:00:00Z"),
      p_monteure: [zweiter.id], p_fest: true, p_hinweis: null,
    });
    angelegt.push(["einsatz", zweiterEinsatz]);
    const { data: em } = await service.from("einsatz_monteur").select("id").eq("einsatz_id", zweiterEinsatz);
    em.forEach((x) => angelegt.push(["einsatz_monteur", x.id]));
    const { data: neu } = await buero.client.rpc("einsatz_konflikte", { p_von: t("2026-11-30T00:00:00Z"), p_bis: t("2026-12-07T00:00:00Z") });
    assert.ok(neu.some((k) => k.einsatz_id === einsatzId && k.mitarbeiter_id === zweiter.id && k.art === "ueberschneidung" && k.detail === daten.auftrag.nummer));
    assert.ok(neu.some((k) => k.einsatz_id === zweiterEinsatz && k.art === "ueberschneidung"));
  });

  it("Monteur tauschen: der entfernte wird nur markiert", async () => {
    const { error } = await buero.client.rpc("einsatz_speichern", {
      p_id: einsatzId, p_auftrag_id: daten.auftrag.id, p_ticket_id: null, p_fahrzeug_id: null, p_beginn: t("2026-12-02T06:00:00Z"), p_ende: t("2026-12-03T15:00:00Z"),
      p_monteure: [zweiter.id], p_fest: null, p_hinweis: "Seiteneingang",
    });
    assert.ifError(error);
    assert.deepEqual(await team(einsatzId), [zweiter.id]);
    const { data: roh } = await service.from("einsatz_monteur").select("deleted_at").eq("einsatz_id", einsatzId).eq("mitarbeiter_id", daten.monteur.id).single();
    assert.ok(roh.deleted_at);
    const { data: e } = await buero.client.from("einsatz").select("ende, fest").eq("id", einsatzId).single();
    assert.equal(new Date(e.ende).toISOString(), t("2026-12-03T15:00:00Z"));
    assert.equal(e.fest, false, "p_fest leer lässt den Stand");
  });

  it("ohne Monteur, mit Ende vor Beginn oder mit Nicht-Monteur abgelehnt", async () => {
    const basis = { p_id: null, p_auftrag_id: daten.auftrag.id, p_ticket_id: null, p_fahrzeug_id: null, p_beginn: t("2026-12-09T06:00:00Z"), p_ende: t("2026-12-09T15:00:00Z"), p_fest: false, p_hinweis: null };
    assert.equal((await buero.client.rpc("einsatz_speichern", { ...basis, p_monteure: [] })).error?.code, "23514");
    assert.equal((await buero.client.rpc("einsatz_speichern", { ...basis, p_ende: basis.p_beginn, p_monteure: [zweiter.id] })).error?.code, "23514");
    const buerokraft = await svcInsert("mitarbeiter", { kuerzel: "Q" + lauf.replace(/[^a-z]/g, "").toUpperCase().padEnd(3, "Z").slice(0, 3), name: `Bürokraft ${lauf}` });
    const nicht = await buero.client.rpc("einsatz_speichern", { ...basis, p_monteure: [buerokraft.id] });
    assert.ok(nicht.error, "Nicht-Monteur eingeteilt");
    const { data: rest } = await service.from("einsatz").select("id").eq("auftrag_id", daten.auftrag.id).eq("beginn", basis.p_beginn);
    assert.equal(rest.length, 0, "abgelehnter Einsatz blieb gespeichert");
  });

  it("Einsatz löschen markiert Einsatz und Team", async () => {
    const { error } = await buero.client.rpc("einsatz_loeschen", { p_id: einsatzId });
    assert.ifError(error);
    const { data: sichtbar } = await buero.client.from("einsatz").select("id").eq("id", einsatzId);
    assert.equal(sichtbar.length, 0);
    const { data: roh } = await service.from("einsatz_monteur").select("deleted_at").eq("einsatz_id", einsatzId);
    assert.ok(roh.length && roh.every((x) => x.deleted_at));
  });

  it("Arbeitszeit nur in vollen Stunden; nicht angemeldet keine Konflikte", async () => {
    const halb = await buero.client.from("einstellung").update({ arbeitszeit_von: "07:30" }).eq("einzig", true);
    assert.ok(halb.error, "halbe Stunde akzeptiert");
    const { error } = await buero.client.from("einstellung").update({ arbeitszeit_von: "07:00", arbeitszeit_bis: "16:00" }).eq("einzig", true);
    assert.ifError(error);
    const fremd = await anon.rpc("einsatz_konflikte", { p_von: t("2026-11-30T00:00:00Z"), p_bis: t("2026-12-07T00:00:00Z") });
    assert.ok(fremd.error || !fremd.data?.length);
  });
});

describe("Mitarbeiter", () => {
  const kz = () => "M" + Array.from(randomBytes(3), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[b % 26]).join("");
  it("Kürzel eindeutig, Urlaubsanspruch 0 bis 366 Tage", async () => {
    const doppelt = await buero.client.from("mitarbeiter").insert({ kuerzel: daten.monteur.kuerzel, name: "Doppelt" });
    assert.equal(doppelt.error?.code, "23505");
    const zuViel = await buero.client.from("mitarbeiter").insert({ kuerzel: kz(), name: "Zu viel Urlaub", urlaubsanspruch_tage: 400 });
    assert.ok(zuViel.error, "400 Urlaubstage akzeptiert");
  });

  it("mit Einsätzen, Zeiten oder Abwesenheiten nicht löschbar, nur deaktivierbar", async () => {
    const { error } = await buero.client.rpc("loeschen", { p_tabelle: "mitarbeiter", p_id: daten.monteur.id });
    assert.equal(error?.code, "23503");
    assert.match(error.message, /Einsätze/);
    assert.match(error.message, /Abwesenheiten/);
    const { data, error: aus } = await buero.client.from("mitarbeiter").update({ aktiv: false }).eq("id", daten.monteur.id).select("aktiv").single();
    assert.ifError(aus);
    assert.equal(data.aktiv, false);
    await buero.client.from("mitarbeiter").update({ aktiv: true }).eq("id", daten.monteur.id);
  });

  it("ohne Geschichte wird er nur als gelöscht markiert", async () => {
    const { data: m, error } = await buero.client.from("mitarbeiter").insert({ kuerzel: kz(), name: `Löschbar ${lauf}`, urlaubsanspruch_tage: 20 }).select().single();
    assert.ifError(error);
    angelegt.push(["mitarbeiter", m.id]);
    assert.ifError((await buero.client.rpc("loeschen", { p_tabelle: "mitarbeiter", p_id: m.id })).error);
    const { data: sichtbar } = await buero.client.from("mitarbeiter").select("id").eq("id", m.id);
    assert.equal(sichtbar.length, 0);
    const { data: roh } = await service.from("mitarbeiter").select("deleted_at").eq("id", m.id).single();
    assert.ok(roh.deleted_at);
  });
});

describe("Zeiterfassung", () => {
  let buchung;
  const basis = () => ({ mitarbeiter_id: daten.monteur.id, datum: "2026-11-03", beginn: "07:00", ende: "15:30", pause_min: 30 });
  it("Montage, Aufmaß und Service nur mit Auftrag; Lager, Fahrt, Büro auch ohne Bezug", async () => {
    const ohne = await buero.client.from("zeitbuchung").insert({ ...basis(), art: "montage" });
    assert.equal(ohne.error?.code, "23514");
    const { data: lager, error } = await buero.client.from("zeitbuchung").insert({ ...basis(), art: "lager" }).select().single();
    assert.ifError(error);
    angelegt.push(["zeitbuchung", lager.id]);
    const { data, error: mit } = await buero.client.from("zeitbuchung").insert({ ...basis(), art: "montage", auftrag_id: daten.auftrag.id }).select().single();
    assert.ifError(mit);
    angelegt.push(["zeitbuchung", data.id]);
    buchung = data;
  });

  it("Ende vor Beginn oder zu lange Pause abgelehnt", async () => {
    assert.ok((await buero.client.from("zeitbuchung").insert({ ...basis(), art: "fahrt", ende: "06:00" })).error);
    assert.ok((await buero.client.from("zeitbuchung").insert({ ...basis(), art: "fahrt", pause_min: 600 })).error);
  });

  it("Freigabe hält fest, wer und wann; freigegebene Buchung ist gesperrt", async () => {
    const { data: frei, error } = await buero.client.from("zeitbuchung").update({ freigabe: "freigegeben" }).eq("id", buchung.id).select().single();
    assert.ifError(error);
    assert.equal(frei.freigegeben_von, buero.id);
    assert.ok(frei.freigegeben_am);
    const aendern = await buero.client.from("zeitbuchung").update({ ende: "16:00" }).eq("id", buchung.id);
    assert.equal(aendern.error?.code, "42501");
    const loeschen = await buero.client.rpc("loeschen", { p_tabelle: "zeitbuchung", p_id: buchung.id });
    assert.ok(loeschen.error, "freigegebene Buchung gelöscht");
  });

  it("Freigabe zurücknehmen entsperrt; Löschen nur als Markierung", async () => {
    const { data: offen, error } = await buero.client.from("zeitbuchung").update({ freigabe: "offen" }).eq("id", buchung.id).select().single();
    assert.ifError(error);
    assert.equal(offen.freigegeben_von, null);
    assert.ifError((await buero.client.from("zeitbuchung").update({ ende: "16:00" }).eq("id", buchung.id)).error);
    assert.ifError((await buero.client.rpc("loeschen", { p_tabelle: "zeitbuchung", p_id: buchung.id })).error);
    const { data: roh } = await service.from("zeitbuchung").select("deleted_at").eq("id", buchung.id).single();
    assert.ok(roh.deleted_at);
  });
});

describe("Fahrzeuge und Termine", () => {
  let fahrzeug, einsatz;
  const t = (iso) => new Date(iso).toISOString();
  it("Kennzeichen eindeutig", async () => {
    const { data, error } = await buero.client.from("fahrzeug").insert({ kennzeichen: `T-${lauf}`, typ: "Transporter", tuev_am: "2027-03-01" }).select().single();
    assert.ifError(error);
    angelegt.push(["fahrzeug", data.id]);
    fahrzeug = data;
    const doppelt = await buero.client.from("fahrzeug").insert({ kennzeichen: `T-${lauf}` });
    assert.equal(doppelt.error?.code, "23505");
  });

  it("Einsatz mit Fahrzeug; Werkstatttermin im Zeitraum ist ein Konflikt des ganzen Einsatzes", async () => {
    const { data, error } = await buero.client.rpc("einsatz_speichern", {
      p_id: null, p_auftrag_id: daten.auftrag.id, p_ticket_id: null, p_beginn: t("2027-03-10T06:00:00Z"), p_ende: t("2027-03-10T15:00:00Z"),
      p_monteure: [daten.monteur.id], p_fahrzeug_id: fahrzeug.id, p_fest: true, p_hinweis: null,
    });
    assert.ifError(error);
    einsatz = data;
    angelegt.push(["einsatz", data]);
    const { data: em } = await service.from("einsatz_monteur").select("id").eq("einsatz_id", data);
    em.forEach((x) => angelegt.push(["einsatz_monteur", x.id]));
    const { data: w } = await buero.client.from("fahrzeug_werkstatt").insert({ fahrzeug_id: fahrzeug.id, von: "2027-03-10", bis: "2027-03-11", notiz: "Inspektion" }).select().single();
    angelegt.push(["fahrzeug_werkstatt", w.id]);
    const { data: k } = await buero.client.rpc("einsatz_konflikte", { p_von: t("2027-03-08T00:00:00Z"), p_bis: t("2027-03-13T00:00:00Z") });
    assert.ok(k.some((x) => x.einsatz_id === einsatz && x.art === "werkstatt" && x.mitarbeiter_id === null && x.detail === `T-${lauf}:Inspektion`));
  });

  it("Einsatz braucht genau einen Bezug (Auftrag oder Ticket)", async () => {
    const basis = { p_id: null, p_beginn: t("2027-03-15T06:00:00Z"), p_ende: t("2027-03-15T15:00:00Z"), p_monteure: [daten.monteur.id], p_fahrzeug_id: null, p_fest: false, p_hinweis: null };
    assert.equal((await buero.client.rpc("einsatz_speichern", { ...basis, p_auftrag_id: null, p_ticket_id: null })).error?.code, "23502");
  });

  it("Fahrzeug mit künftigem Einsatz nicht löschbar, sonst nur Markierung", async () => {
    const gesperrt = await buero.client.rpc("loeschen", { p_tabelle: "fahrzeug", p_id: fahrzeug.id });
    assert.equal(gesperrt.error?.code, "23503");
    const { data: zweites } = await buero.client.from("fahrzeug").insert({ kennzeichen: `T2-${lauf}` }).select().single();
    angelegt.push(["fahrzeug", zweites.id]);
    assert.ifError((await buero.client.rpc("loeschen", { p_tabelle: "fahrzeug", p_id: zweites.id })).error);
    const { data: roh } = await service.from("fahrzeug").select("deleted_at").eq("id", zweites.id).single();
    assert.ok(roh.deleted_at);
  });

  it("Termin mit Mitarbeitern speichern, ändern (entfernter nur markiert) und löschen", async () => {
    const zeile = { p_titel: `Beratung ${lauf}`, p_art: "beratung", p_datum: "2027-03-12", p_beginn: "10:00", p_ende: "11:00", p_kunde_id: daten.kunde.id, p_anfrage_id: null, p_auftrag_id: null, p_ort: null, p_notiz: null };
    const { data: id, error } = await buero.client.rpc("termin_speichern", { p_id: null, ...zeile, p_mitarbeiter: [daten.monteur.id] });
    assert.ifError(error);
    angelegt.push(["termin", id]);
    const { data: tm } = await service.from("termin_mitarbeiter").select("id").eq("termin_id", id);
    tm.forEach((x) => angelegt.push(["termin_mitarbeiter", x.id]));
    assert.ifError((await buero.client.rpc("termin_speichern", { p_id: id, ...zeile, p_mitarbeiter: [] })).error);
    const { data: team } = await buero.client.from("termin_mitarbeiter").select("id").eq("termin_id", id);
    assert.equal(team.length, 0);
    const { data: roh } = await service.from("termin_mitarbeiter").select("deleted_at").eq("termin_id", id);
    assert.ok(roh.every((x) => x.deleted_at));
    assert.ok((await buero.client.rpc("termin_speichern", { p_id: null, ...zeile, p_titel: " ", p_mitarbeiter: [] })).error, "leerer Titel");
    assert.ok((await buero.client.rpc("termin_speichern", { p_id: null, ...zeile, p_ende: "09:00", p_mitarbeiter: [] })).error, "Ende vor Beginn");
    assert.ifError((await buero.client.rpc("termin_loeschen", { p_id: id })).error);
    const { data: weg } = await service.from("termin").select("deleted_at").eq("id", id).single();
    assert.ok(weg.deleted_at);
  });
});

describe("Service-Tickets", () => {
  let ticket, einsatz;
  const t = (iso) => new Date(iso).toISOString();
  const naechsterMontag = () => {
    const h = new Date(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()) + "T12:00:00Z");
    h.setUTCDate(h.getUTCDate() - ((h.getUTCDay() + 6) % 7) + 7);
    return h.toISOString().slice(0, 10);
  };
  it("Nummer ST-JJ-NNNN, Tag in „Terminierbar“ = kommender Montag oder späterer Wunschtermin", async () => {
    const { data, error } = await buero.client.from("service_ticket").insert({ kunde_id: daten.kunde.id, thema: `Rollladen klemmt ${lauf}`, zustaendig_id: buero.id }).select().single();
    assert.ifError(error);
    angelegt.push(["service_ticket", data.id]);
    assert.match(data.nummer, /^ST-\d{2}-\d{4}$/);
    assert.equal(data.vorab_datum, naechsterMontag());
    assert.equal(data.status, "neu");
    const { data: spaeter } = await buero.client.from("service_ticket").update({ wunschtermin: "2027-05-20" }).eq("id", data.id).select().single();
    assert.equal(spaeter.vorab_datum, "2027-05-20");
    ticket = data;
  });

  it("„Abgerechnet“ nicht von Hand", async () => {
    const { error } = await buero.client.from("service_ticket").update({ status: "abgerechnet" }).eq("id", ticket.id);
    assert.equal(error?.code, "42501");
  });

  it("Einplanen setzt „Eingeplant“, ohne Einsatz wieder „Neu“", async () => {
    const { data, error } = await buero.client.rpc("einsatz_speichern", {
      p_id: null, p_auftrag_id: null, p_ticket_id: ticket.id, p_beginn: t("2027-05-20T07:00:00Z"), p_ende: t("2027-05-20T09:00:00Z"),
      p_monteure: [daten.monteur.id], p_fahrzeug_id: null, p_fest: false, p_hinweis: null,
    });
    assert.ifError(error);
    einsatz = data;
    angelegt.push(["einsatz", data]);
    const { data: em } = await service.from("einsatz_monteur").select("id").eq("einsatz_id", data);
    em.forEach((x) => angelegt.push(["einsatz_monteur", x.id]));
    assert.equal((await service.from("service_ticket").select("status").eq("id", ticket.id).single()).data.status, "eingeplant");
    const gesperrt = await buero.client.rpc("loeschen", { p_tabelle: "service_ticket", p_id: ticket.id });
    assert.equal(gesperrt.error?.code, "23503");
    assert.ifError((await buero.client.rpc("einsatz_loeschen", { p_id: einsatz })).error);
    assert.equal((await service.from("service_ticket").select("status").eq("id", ticket.id).single()).data.status, "neu");
  });

  it("Zeit auf ein Ticket buchen; Ticket mit Zeiten nicht löschbar, ohne nur Markierung", async () => {
    const { data: z, error } = await buero.client.from("zeitbuchung").insert({ mitarbeiter_id: daten.monteur.id, ticket_id: ticket.id, datum: "2027-05-20", beginn: "08:00", ende: "10:00", pause_min: 0, art: "service" }).select().single();
    assert.ifError(error);
    angelegt.push(["zeitbuchung", z.id]);
    assert.equal((await buero.client.rpc("loeschen", { p_tabelle: "service_ticket", p_id: ticket.id })).error?.code, "23503");
    const { data: zweites } = await buero.client.from("service_ticket").insert({ kunde_id: daten.kunde.id, thema: `Wartung ${lauf}`, art: "wartung" }).select().single();
    angelegt.push(["service_ticket", zweites.id]);
    assert.ifError((await buero.client.rpc("loeschen", { p_tabelle: "service_ticket", p_id: zweites.id })).error);
    assert.ok((await service.from("service_ticket").select("deleted_at").eq("id", zweites.id).single()).data.deleted_at);
  });
});

describe("Einkauf", () => {
  let lieferant, bestellung;
  it("Lieferant samt Ansprechpartnern speichern, entfernter nur markiert", async () => {
    const { data: id, error } = await buero.client.rpc("lieferant_speichern", {
      p_id: null,
      p_lieferant: { name: `Fensterwerk ${lauf}`, produktgruppen: ["Fenster", "Haustür"], lieferzeit: "4–6 Wochen" },
      p_kontakte: [{ name: "Anna Außendienst", funktion: "Außendienst", handy: "0171 1" }, { name: "Bert Innendienst" }, { name: " " }],
    });
    assert.ifError(error);
    angelegt.push(["lieferant", id]);
    const { data: k } = await buero.client.from("lieferant_kontakt").select("id, name").eq("lieferant_id", id).order("reihenfolge");
    k.forEach((x) => angelegt.push(["lieferant_kontakt", x.id]));
    assert.deepEqual(k.map((x) => x.name), ["Anna Außendienst", "Bert Innendienst"]);
    assert.ifError((await buero.client.rpc("lieferant_speichern", { p_id: id, p_lieferant: { name: `Fensterwerk ${lauf}` }, p_kontakte: [{ id: k[0].id, name: "Anna Außendienst" }] })).error);
    const { data: rest } = await buero.client.from("lieferant_kontakt").select("id").eq("lieferant_id", id);
    assert.equal(rest.length, 1);
    lieferant = id;
  });

  it("Lieferanten-Konditionen nur mit dem Recht „Konditionen sehen“", async () => {
    const { data, error } = await admin.client.from("lieferant_kondition").insert({ lieferant_id: lieferant, text: "12 % Rabatt" }).select().single();
    assert.ifError(error);
    angelegt.push(["lieferant_kondition", data.id]);
    const { data: ohne } = await buero.client.from("lieferant_kondition").select("text").eq("lieferant_id", lieferant);
    assert.equal(ohne.length, 0, "Büro ohne Recht sieht Konditionen");
    assert.ok((await buero.client.from("lieferant_kondition").update({ text: "x" }).eq("lieferant_id", lieferant).select()).data?.length === 0);
  });

  it("Bestellung: Nummer BE-JJ-NNN, Zeilen nur mit Auftrag, mindestens eine Zeile", async () => {
    const kopf = { lieferant_id: lieferant, liefer_kw: 50, liefer_jahr: 2026, status: "bestellt" };
    assert.equal((await buero.client.rpc("bestellung_speichern", { p_id: null, p_kopf: kopf, p_zeilen: [] })).error?.code, "23514");
    assert.ok((await buero.client.rpc("bestellung_speichern", { p_id: null, p_kopf: kopf, p_zeilen: [{ artikeltext: "ohne Auftrag" }] })).error, "Zeile ohne Auftrag akzeptiert");
    const { data: id, error } = await buero.client.rpc("bestellung_speichern", { p_id: null, p_kopf: kopf, p_zeilen: [{ auftrag_id: daten.auftrag.id, artikeltext: "4 × Fenster", menge: 4 }, { auftrag_id: daten.auftrag.id, artikeltext: "Haustür" }] });
    assert.ifError(error);
    angelegt.push(["bestellung", id]);
    const { data: b } = await buero.client.from("bestellung").select("nummer").eq("id", id).single();
    assert.match(b.nummer, /^BE-\d{2}-\d{3}$/);
    const { data: z } = await buero.client.from("bestellzeile").select("id, menge").eq("bestellung_id", id).order("reihenfolge");
    z.forEach((x) => angelegt.push(["bestellzeile", x.id]));
    assert.equal(z.length, 2);
    bestellung = { id, zeilen: z };
  });

  it("Lieferant mit offener Bestellung nicht löschbar; gelieferte Bestellung nicht löschbar", async () => {
    assert.equal((await buero.client.rpc("loeschen", { p_tabelle: "lieferant", p_id: lieferant })).error?.code, "23503");
    assert.ifError((await buero.client.from("bestellzeile").update({ geliefert: true }).eq("id", bestellung.zeilen[0].id)).error);
    assert.equal((await buero.client.rpc("bestellung_loeschen", { p_id: bestellung.id })).error?.code, "23503");
  });

  it("ungelieferte Bestellung und Lieferant ohne offene Bestellungen nur als gelöscht markiert", async () => {
    const { data: id } = await buero.client.rpc("bestellung_speichern", { p_id: null, p_kopf: { lieferant_id: lieferant }, p_zeilen: [{ auftrag_id: daten.auftrag.id, artikeltext: "Rollladen" }] });
    angelegt.push(["bestellung", id]);
    const { data: z } = await service.from("bestellzeile").select("id").eq("bestellung_id", id);
    z.forEach((x) => angelegt.push(["bestellzeile", x.id]));
    assert.ifError((await buero.client.rpc("bestellung_loeschen", { p_id: id })).error);
    assert.ok((await service.from("bestellung").select("deleted_at").eq("id", id).single()).data.deleted_at);
    assert.ifError((await buero.client.from("bestellzeile").update({ geliefert: true }).eq("id", bestellung.zeilen[1].id)).error);
    assert.ifError((await buero.client.rpc("loeschen", { p_tabelle: "lieferant", p_id: lieferant })).error);
    const { data: k } = await service.from("lieferant_kontakt").select("deleted_at").eq("lieferant_id", lieferant);
    assert.ok(k.every((x) => x.deleted_at), "Ansprechpartner mit markiert");
  });
});

describe("Belege", () => {
  it("neue Belege sind immer Entwurf, ohne eigene Nummer und ohne Lexware-Daten", async () => {
    const { data, error } = await buero.client
      .from("beleg")
      .insert({ art: "lieferschein", auftrag_id: daten.auftrag.id, kunde_id: daten.kunde.id, status: "fertiggestellt", nummer: "LS1999999", lexware_id: "x-1" })
      .select()
      .single();
    assert.ifError(error);
    angelegt.push(["beleg", data.id]);
    assert.equal(data.status, "entwurf");
    assert.equal(data.nummer, null);
    assert.equal(data.lexware_id, null);
  });

  it("Status wechselt nur über „Fertigstellen“; Aufträge entstehen nur mit der AB", async () => {
    const ls = await belegSpeichern(buero, { art: "lieferschein", kunde_id: daten.kunde.id, auftrag_id: daten.auftrag.id });
    const direkt = await buero.client.from("beleg").update({ status: "fertiggestellt" }).eq("id", ls.id);
    assert.equal(direkt.error?.code, "42501", "Entwurf direkt fertiggestellt");
    const auftrag = await buero.client.from("auftrag").insert({ nummer: `X-${lauf}`, kunde_id: daten.kunde.id, titel: "direkt" });
    assert.equal(auftrag.error?.code, "42501", "Auftrag ohne AB angelegt");
  });

  it("Lieferschein: Nummer beim Fertigstellen, danach gesperrt und nicht löschbar", async () => {
    const ls = await belegSpeichern(buero, { art: "lieferschein", kunde_id: daten.kunde.id, auftrag_id: daten.auftrag.id });
    assert.equal(ls.nummer, null, "Lieferschein-Entwurf hat schon eine Nummer");
    const { nummer } = await fertig(buero, ls.id);
    assert.match(nummer, /^LS\d{4,}$/);
    const titel = await buero.client.from("beleg").update({ titel: "geändert" }).eq("id", ls.id);
    assert.equal(titel.error?.code, "42501", "fertiger Lieferschein geändert");
    const pos = await buero.client.from("beleg_position").insert({ beleg_id: ls.id, titel: "nachträglich" });
    assert.ok(pos.error, "Position an fertigem Beleg ergänzt");
    const weg = await buero.client.rpc("loeschen", { p_tabelle: "beleg", p_id: ls.id });
    assert.ok(weg.error, "fertiger Beleg gelöscht");
    const tags = await buero.client.from("beleg").update({ tags: ["intern"], kommentar_intern: "bleibt änderbar" }).eq("id", ls.id);
    assert.ifError(tags.error);
  });

  it("Angebot: angenommen/abgelehnt und zurück, „nicht beauftragt“ nicht von Hand", async () => {
    const ag = await belegSpeichern(buero, { art: "angebot", kunde_id: daten.kunde.id });
    await fertig(buero, ag.id);
    const nb = await buero.client.from("beleg").update({ status: "nicht_beauftragt" }).eq("id", ag.id);
    assert.equal(nb.error?.code, "42501");
    for (const st of ["abgelehnt", "offen", "angenommen", "offen"]) {
      const r = await buero.client.from("beleg").update({ status: st }).eq("id", ag.id);
      assert.ifError(r.error);
    }
  });

  it("Versionen: übergeben friert ein, Bearbeiten legt Version 2 mit derselben Nummer an", async () => {
    const ag = await belegSpeichern(buero, { art: "angebot", kunde_id: daten.kunde.id, datum: "2026-11-02", gueltig_bis: "2026-12-02" });
    await fertig(buero, ag.id);
    const { data: v, error } = await buero.client.rpc("beleg_uebergeben", { p_id: ag.id });
    assert.ifError(error);
    assert.equal(v, 1);
    const { data: ver } = await service.from("beleg_version").select("id, version, daten").eq("beleg_id", ag.id);
    const { data: vs } = await service.from("beleg_versand").select("id").eq("beleg_id", ag.id);
    for (const x of [...ver, ...vs]) angelegt.push([x.daten ? "beleg_version" : "beleg_versand", x.id]);
    assert.equal(ver.length, 1);
    assert.equal(ver[0].daten.positionen.length, 1, "Version enthält die Positionen");
    const { data: id2, error: e2 } = await buero.client.rpc("beleg_speichern", {
      p_id: ag.id,
      p_kopf: { art: "angebot", kunde_id: daten.kunde.id, datum: "2026-11-02", gueltig_bis: "2026-12-02" },
      p_positionen: [{ titel: "Haustür", menge: 1, einzelpreis: 1200, steuersatz: 19 }],
    });
    assert.ifError(e2);
    const { data: neu } = await service.from("beleg").select("version, nummer, datum, gueltig_bis, eingefroren_version, anfrage_id").eq("id", id2).single();
    assert.equal(neu.anfrage_id, ag.anfrage_id, "Bezug bleibt beim erneuten Speichern ohne Angabe");
    const { data: pos } = await service.from("beleg_position").select("id").eq("beleg_id", ag.id);
    for (const p of pos) if (!angelegt.some(([, x]) => x === p.id)) angelegt.push(["beleg_position", p.id]);
    assert.equal(neu.version, 2);
    assert.equal(neu.nummer, ag.nummer, "Nummer bleibt");
    assert.equal(neu.eingefroren_version, 1);
    const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
    assert.equal(neu.datum, heute, "Belegdatum wird auf heute gesetzt");
    const tage = (Date.parse(neu.gueltig_bis) - Date.parse(neu.datum)) / 864e5;
    assert.equal(tage, 30, "Gültig bis wandert mit");
  });

  it("Version und Fertigstellung lassen sich nicht direkt setzen", async () => {
    const ag = await belegSpeichern(buero, { art: "angebot", kunde_id: daten.kunde.id });
    const { data } = await buero.client.from("beleg").update({ version: 7, eingefroren_version: 7, fertiggestellt_am: new Date().toISOString() }).eq("id", ag.id).select("version, eingefroren_version, fertiggestellt_am").single();
    assert.deepEqual(data, { version: 1, eingefroren_version: null, fertiggestellt_am: null });
  });

  it("Lexware: Server-Funktionen sind für Benutzer gesperrt", async () => {
    for (const [fn, args] of [
      ["lexware_start", { p_id: daten.ab.id, p_benutzer: buero.id }],
      ["lexware_fehler", { p_id: daten.ab.id, p_benutzer: buero.id, p_fehler: "x" }],
      ["lexware_fertig", { p_id: daten.ab.id, p_benutzer: buero.id, p_daten: {} }],
      ["lexware_pdf", { p_id: daten.ab.id, p_benutzer: buero.id, p_pfad: "x" }],
      ["lexware_kunde", { p_kunde: daten.kunde.id, p_benutzer: buero.id, p_kontakt_id: "x", p_hash: "x" }],
    ]) {
      const { error } = await buero.client.rpc(fn, args);
      assert.ok(error, `${fn} für Benutzer ausführbar`);
    }
    const { data: k } = await buero.client.from("kunde").update({ lexware_kontakt_id: "gefaelscht", lexware_hash: "x" }).eq("id", daten.kunde.id).select("lexware_kontakt_id, lexware_hash").single();
    assert.deepEqual(k, { lexware_kontakt_id: null, lexware_hash: null }, "Lexware-Felder am Kunden von Hand gesetzt");
  });

  it("Lexware-Belege: Bezug Pflicht, Gutschrift nur aus Lexware-Rechnung, Abzug nur echter Abschläge", async () => {
    const ohne = await buero.client.rpc("beleg_speichern", { p_id: null, p_kopf: { art: "rechnung", kunde_id: daten.kunde.id }, p_positionen: [] });
    assert.ok(ohne.error, "Rechnung ohne Auftrag oder Ticket gespeichert");
    const abschlagOhne = await buero.client.rpc("beleg_speichern", { p_id: null, p_kopf: { art: "abschlagsrechnung", kunde_id: daten.kunde.id }, p_positionen: [] });
    assert.ok(abschlagOhne.error, "Abschlag ohne Auftrag gespeichert");
    const gs = await buero.client.rpc("beleg_speichern", { p_id: null, p_kopf: { art: "gutschrift", kunde_id: daten.kunde.id, vorgaenger_id: daten.ab.id }, p_positionen: [] });
    assert.ok(gs.error, "Gutschrift aus einer AB gespeichert");
    const entwurf = await belegSpeichern(buero, { art: "abschlagsrechnung", kunde_id: daten.kunde.id, auftrag_id: daten.auftrag.id, abschlag_prozent: "30" });
    assert.equal(Number(entwurf.abschlag_prozent), 30);
    const re = await belegSpeichern(buero, { art: "rechnung", kunde_id: daten.kunde.id, auftrag_id: daten.auftrag.id }, [
      { titel: "Leistung", menge: 1, einzelpreis: 1000, steuersatz: 19 },
      { titel: "abzgl. Abschlag", menge: 1, einzelpreis: -300, steuersatz: 19, abzug_beleg_id: entwurf.id },
    ]);
    const { data: pos } = await service.from("beleg_position").select("abzug_beleg_id").eq("beleg_id", re.id);
    assert.ok(pos.every((p) => p.abzug_beleg_id === null), "Abzug eines nicht fertigen Abschlags gespeichert");
    const direkt = await buero.client.from("beleg").update({ status: "offen" }).eq("id", re.id);
    assert.equal(direkt.error?.code, "42501", "Rechnung von Hand auf offen gesetzt");
    const { data: f } = await buero.client.from("beleg").update({ lexware_id: "x", lexware_status: "fertig", abschlag_nr: 9, steuern: [{ satz: 19 }] }).eq("id", entwurf.id).select("lexware_id, lexware_status, abschlag_nr, steuern").single();
    assert.deepEqual(f, { lexware_id: null, lexware_status: null, abschlag_nr: null, steuern: [] }, "Lexware-Felder von Hand gesetzt");
    const fertigApp = await buero.client.rpc("beleg_fertigstellen", { p_id: re.id });
    assert.ok(fertigApp.error, "Rechnung ohne Lexware fertiggestellt");
  });

  it("Lexware-Ablauf (Server): Sperre, Abschlagsnummer, Ergebnis mit Benutzer im Audit-Log", async () => {
    const auftrag = await svcInsert("auftrag", { nummer: `TESTL-${lauf}`, kunde_id: daten.kunde.id, titel: "Lexware" });
    const ab = await svcInsert("beleg", { art: "auftragsbestaetigung", auftrag_id: auftrag.id, kunde_id: daten.kunde.id, status: "fertiggestellt" });
    await svcInsert("beleg_position", { beleg_id: ab.id, titel: "Haustür", menge: 1, einzelpreis: 1000 });
    const a = await belegSpeichern(buero, { art: "abschlagsrechnung", kunde_id: daten.kunde.id, auftrag_id: auftrag.id, vorgaenger_id: ab.id, abschlag_prozent: "50" }, [
      { titel: "Abschlag 50 %", menge: 1, einzelpreis: 500, steuersatz: 19 },
    ]);
    const { data: start, error } = await service.rpc("lexware_start", { p_id: a.id, p_benutzer: buero.id });
    assert.ifError(error);
    assert.equal(start.abschlag_nr, 1);
    const { data: nachStart } = await service.from("beleg").select("titel, lexware_status").eq("id", a.id).single();
    assert.deepEqual(nachStart, { titel: "1. Abschlagsrechnung", lexware_status: "uebertragung" });
    const doppelt = await service.rpc("lexware_start", { p_id: a.id, p_benutzer: buero.id });
    assert.ok(doppelt.error, "zweite Übertragung gleichzeitig gestartet");
    const aendern = await buero.client.rpc("beleg_speichern", { p_id: a.id, p_kopf: { art: "abschlagsrechnung", kunde_id: daten.kunde.id }, p_positionen: [] });
    assert.ok(aendern.error, "Beleg während der Übertragung geändert");
    const verwerfen = await buero.client.rpc("loeschen", { p_tabelle: "beleg", p_id: a.id });
    assert.ok(verwerfen.error, "Beleg während der Übertragung verworfen");
    const { error: e2 } = await service.rpc("lexware_fertig", {
      p_id: a.id,
      p_benutzer: buero.id,
      p_daten: { lexware_id: `lex-${lauf}`, nummer: `RE-T-${lauf}`, summe_netto: 500, summe_brutto: 595, steuern: [{ satz: 19, netto: 500, steuer: 95, brutto: 595 }], faellig_am: "2026-11-24", pdf_pfad: "" },
    });
    assert.ifError(e2);
    const { data: fertigB } = await service.from("beleg").select("status, nummer, offen_betrag, lexware_status, fertiggestellt_von").eq("id", a.id).single();
    assert.deepEqual({ ...fertigB, offen_betrag: Number(fertigB.offen_betrag) }, { status: "offen", nummer: `RE-T-${lauf}`, offen_betrag: 595, lexware_status: "pdf_fehlt", fertiggestellt_von: buero.id });
    const { data: hist, error: eh } = await buero.client.rpc("historie", { p_tabelle: "beleg", p_id: a.id });
    assert.ifError(eh);
    const log = hist.filter((e) => (e.geaendert ?? []).includes("nummer"));
    assert.ok(log.length && log.every((l) => l.benutzer_id === buero.id && l.db_rolle === "service_role"), `Audit-Log ohne handelnden Benutzer: ${JSON.stringify(log)}`);
    const nochmal = await service.rpc("lexware_start", { p_id: a.id, p_benutzer: buero.id });
    assert.ok(nochmal.error, "fertiger Beleg erneut übertragen");
    const gesperrt = await buero.client.from("beleg").update({ titel: "geändert" }).eq("id", a.id);
    assert.equal(gesperrt.error?.code, "42501", "fertiger Abschlag geändert");
  });

  it("Zahlungen: App-Buchung, Bestätigung, Abgleich mit Lexware, automatischer Abschluss", async () => {
    const auftrag = await svcInsert("auftrag", { nummer: `TESTZ-${lauf}`, kunde_id: daten.kunde.id, titel: "Zahlungen", phase: "abnahme" });
    const re = await svcInsert("beleg", {
      art: "rechnung", auftrag_id: auftrag.id, kunde_id: daten.kunde.id, status: "offen", nummer: `RE-Z-${lauf}`, lexware_id: `lexz-${lauf}`,
      summe_netto: 840.34, summe_brutto: 1000, offen_betrag: 1000, lexware_offen: 1000,
    });
    const merkeZahlungen = async () => {
      const { data } = await service.from("zahlung").select("id, zahlungsbestaetigung_id").eq("beleg_id", re.id);
      for (const z of data) {
        if (z.zahlungsbestaetigung_id && !angelegt.some(([, x]) => x === z.zahlungsbestaetigung_id)) angelegt.push(["beleg", z.zahlungsbestaetigung_id]);
        if (!angelegt.some(([, x]) => x === z.id)) angelegt.push(["zahlung", z.id]);
      }
    };
    // direkt: keine Lexware-Zahlung, kein Status, kein offener Betrag, keine Zahlungsbestätigung ohne Zahlung
    const { data: z0, error: e0 } = await buero.client.from("zahlung").insert({ beleg_id: re.id, datum: "2026-11-12", betrag: 1, quelle: "lexware", lex_abgleich: "abgeglichen" }).select().single();
    assert.ifError(e0);
    angelegt.push(["zahlung", z0.id]);
    assert.equal(z0.quelle, "app", "Benutzer hat eine Lexware-Zahlung angelegt");
    assert.equal(z0.lex_abgleich, "offen");
    const betrag = await buero.client.from("zahlung").update({ betrag: 999 }).eq("id", z0.id);
    assert.equal(betrag.error?.code, "42501", "Zahlung geändert");
    assert.ifError((await buero.client.rpc("loeschen", { p_tabelle: "zahlung", p_id: z0.id })).error);
    const { data: nachEntfernen } = await service.from("beleg").select("offen_betrag").eq("id", re.id).single();
    assert.equal(Number(nachEntfernen.offen_betrag), 1000, "Entfernen stellt den offenen Betrag wieder her");
    const st = await buero.client.from("beleg").update({ status: "bezahlt", offen_betrag: 0 }).eq("id", re.id).select("status, offen_betrag").single();
    assert.ok(st.error || (st.data.status === "offen" && Number(st.data.offen_betrag) === 1000), "Status bzw. offener Betrag von Hand gesetzt");
    const zbDirekt = await buero.client.from("beleg").insert({ art: "zahlungsbestaetigung", auftrag_id: auftrag.id, kunde_id: daten.kunde.id });
    assert.ok(zbDirekt.error, "Zahlungsbestätigung ohne Zahlung angelegt");

    // Als bezahlt markieren: Teilzahlung bar mit Bestätigung
    const tagHeute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
    const zuViel = await buero.client.rpc("zahlung_erfassen", { p_beleg: re.id, p_datum: tagHeute, p_betrag: 1000.01, p_zahlungsart: "bar", p_bestaetigung: false });
    assert.ok(zuViel.error, "mehr als offen gebucht");
    const { data: e1, error: f1 } = await buero.client.rpc("zahlung_erfassen", { p_beleg: re.id, p_datum: tagHeute, p_betrag: 400, p_zahlungsart: "bar", p_bestaetigung: true });
    assert.ifError(f1);
    await merkeZahlungen();
    const { data: zb } = await service.from("beleg").select("art, nummer, status, vorgaenger_id, summe_brutto, offen_betrag, kette_id").eq("id", e1.zahlungsbestaetigung_id).single();
    assert.equal(zb.art, "zahlungsbestaetigung");
    assert.match(zb.nummer, /^ZB1\d{6}$/);
    assert.deepEqual([zb.status, zb.vorgaenger_id, Number(zb.summe_brutto), Number(zb.offen_betrag)], ["fertiggestellt", re.id, 400, 600]);
    const zweite = await buero.client.rpc("zahlungsbestaetigung_erstellen", { p_zahlung: e1.zahlung_id });
    assert.ok(zweite.error, "zweite Zahlungsbestätigung zu derselben Zahlung");
    const mitBest = await buero.client.rpc("loeschen", { p_tabelle: "zahlung", p_id: e1.zahlung_id });
    assert.ok(mitBest.error, "Zahlung mit Bestätigung entfernt");
    let { data: r1 } = await service.from("beleg").select("status, offen_betrag").eq("id", re.id).single();
    assert.deepEqual([r1.status, Number(r1.offen_betrag)], ["offen", 600]);

    // Lexware meldet die 400 € (abgeglichen statt doppelt) und weitere 600 € (neue Zahlung) → bezahlt
    const lexP = await buero.client.rpc("lexware_zahlungen", { p_beleg: re.id, p_benutzer: buero.id, p_daten: {} });
    assert.ok(lexP.error, "Benutzer ruft den Lexware-Abgleich auf");
    const posten = (n, betrag, datum) => ({ schluessel: `lexz-${lauf}:partPaymentFinancialTransaction:${datum}:${betrag}:${n}`, art: "partPaymentFinancialTransaction", datum, betrag });
    assert.ifError((await service.rpc("lexware_zahlungen", { p_beleg: re.id, p_benutzer: null, p_daten: { offen: 600, status: "open", posten: [posten(1, 400, "2026-11-14")] } })).error);
    await merkeZahlungen();
    const { data: nachEins } = await service.from("zahlung").select("quelle, lex_abgleich, betrag").eq("beleg_id", re.id).is("deleted_at", null);
    assert.deepEqual(nachEins.map((z) => [z.quelle, z.lex_abgleich, Number(z.betrag)]), [["app", "abgeglichen", 400]], "App-Buchung abgeglichen, nicht doppelt");
    ({ data: r1 } = await service.from("beleg").select("status, offen_betrag").eq("id", re.id).single());
    assert.deepEqual([r1.status, Number(r1.offen_betrag)], ["offen", 600]);
    assert.ifError((await service.rpc("lexware_zahlungen", { p_beleg: re.id, p_benutzer: null, p_daten: { offen: 0, status: "paidoff", posten: [posten(1, 400, "2026-11-14"), posten(1, 600, "2026-11-20")] } })).error);
    await merkeZahlungen();
    const { data: alle } = await service.from("zahlung").select("quelle").eq("beleg_id", re.id).is("deleted_at", null);
    assert.equal(alle.length, 2, "erneuter Abgleich legt nichts doppelt an");
    ({ data: r1 } = await service.from("beleg").select("status, offen_betrag").eq("id", re.id).single());
    assert.deepEqual([r1.status, Number(r1.offen_betrag)], ["bezahlt", 0]);
    const { data: a } = await service.from("auftrag").select("phase").eq("id", auftrag.id).single();
    assert.equal(a.phase, "abgeschlossen", "Auftrag in Abnahme mit bezahlter Schlussrechnung wird abgeschlossen");
  });

  it("Teil-AB und Teilrechnung: nur aus fertiger AB, Liefertermin Pflicht, Nummer AB-01, Schlussrechnung zieht ab", async () => {
    const auftrag = await svcInsert("auftrag", { nummer: `TESTT-${lauf}`, kunde_id: daten.kunde.id, titel: "Teil-AB" });
    const ab = await svcInsert("beleg", { art: "auftragsbestaetigung", auftrag_id: auftrag.id, kunde_id: daten.kunde.id, status: "fertiggestellt" });
    await svcInsert("beleg_position", { beleg_id: ab.id, titel: "Fenster", menge: 3, einzelpreis: 500 });
    const ohneAb = await buero.client.rpc("beleg_speichern", { p_id: null, p_kopf: { art: "teil_ab", kunde_id: daten.kunde.id, auftrag_id: auftrag.id }, p_positionen: [] });
    assert.ok(ohneAb.error, "Teil-AB ohne AB als Vorgänger");
    const tab = await belegSpeichern(buero, { art: "teil_ab", kunde_id: daten.kunde.id, vorgaenger_id: ab.id }, [{ titel: "Fenster", menge: 1, einzelpreis: 500, steuersatz: 19 }]);
    assert.equal(tab.auftrag_id, auftrag.id, "Teil-AB übernimmt den Auftrag der AB");
    const ohneTermin = await buero.client.rpc("beleg_fertigstellen", { p_id: tab.id });
    assert.ok(ohneTermin.error, "Teil-AB ohne Liefertermin fertiggestellt");
    assert.ifError((await buero.client.rpc("beleg_speichern", { p_id: tab.id, p_kopf: { art: "teil_ab", kunde_id: daten.kunde.id, liefertermin: "2026-12-07" }, p_positionen: [{ titel: "Fenster", menge: 1, einzelpreis: 500, steuersatz: 19 }] })).error);
    const { nummer } = await fertig(buero, tab.id);
    assert.equal(nummer, `${auftrag.nummer}-01`, "Nummer = AB-Nummer mit -01");
    const { data: a } = await service.from("auftrag").select("liefertermin").eq("id", auftrag.id).single();
    assert.equal(a.liefertermin, "2026-12-07", "Teil-AB setzt den Liefertermin des Auftrags");
    // Teilrechnung aus der Teil-AB: Kennzeichen „teil“ setzt die Datenbank, nicht der Benutzer
    const tr = await belegSpeichern(buero, { art: "rechnung", kunde_id: daten.kunde.id, vorgaenger_id: tab.id, leistung_von: "2026-12-07" }, [{ titel: "Fenster", menge: 1, einzelpreis: 500, steuersatz: 19 }]);
    assert.equal(tr.teil, true, "Rechnung aus Teil-AB ist Teilrechnung");
    const re = await belegSpeichern(buero, { art: "rechnung", kunde_id: daten.kunde.id, vorgaenger_id: ab.id, leistung_von: "2026-12-07" });
    assert.equal(re.teil, false);
    const direkt = await buero.client.from("beleg").update({ teil: true }).eq("id", re.id).select("teil").single();
    assert.equal(direkt.data?.teil ?? false, false, "Kennzeichen „teil“ von Hand gesetzt");
    // Teilrechnung fertig (Server), dann muss die Schlussrechnung sie abziehen
    assert.ifError((await service.rpc("lexware_start", { p_id: tr.id, p_benutzer: buero.id })).error);
    const { data: trNach } = await service.from("beleg").select("titel").eq("id", tr.id).single();
    assert.equal(trNach.titel, "Teilrechnung");
    assert.ifError((await service.rpc("lexware_fertig", { p_id: tr.id, p_benutzer: buero.id, p_daten: { lexware_id: `lext-${lauf}`, nummer: `RE-T2-${lauf}`, summe_netto: 500, summe_brutto: 595, steuern: [{ satz: 19, netto: 500, steuer: 95, brutto: 595 }], pdf_pfad: "" } })).error);
    const ohneAbzug = await service.rpc("lexware_start", { p_id: re.id, p_benutzer: buero.id });
    assert.match(ohneAbzug.error?.message ?? "", /Teilrechnungen abziehen/, "Schlussrechnung ohne Abzug der Teilrechnung");
    const mitAbzug = await buero.client.rpc("beleg_speichern", {
      p_id: re.id,
      p_kopf: { art: "rechnung", kunde_id: daten.kunde.id, leistung_von: "2026-12-07" },
      p_positionen: [
        { titel: "Fenster", menge: 3, einzelpreis: 500, steuersatz: 19 },
        { titel: "abzgl. Teilrechnung", menge: 1, einzelpreis: -500, steuersatz: 19, abzug_beleg_id: tr.id },
      ],
    });
    assert.ifError(mitAbzug.error);
    const { data: pos } = await service.from("beleg_position").select("id, abzug_beleg_id").eq("beleg_id", re.id);
    for (const p of pos) if (!angelegt.some(([, x]) => x === p.id)) angelegt.push(["beleg_position", p.id]);
    assert.ok(pos.some((p) => p.abzug_beleg_id === tr.id), "Abzug der Teilrechnung gespeichert");
    assert.ifError((await service.rpc("lexware_start", { p_id: re.id, p_benutzer: buero.id })).error);
  });

  it("PDF-Speicher: nur angemeldete Benutzer, Löschen gesperrt", async () => {
    const pfad = `rls-${lauf}/test.pdf`;
    const hoch = await buero.client.storage.from("belege").upload(pfad, new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), { contentType: "application/pdf" });
    assert.ifError(hoch.error);
    const falsch = await buero.client.storage.from("belege").upload(`rls-${lauf}/bild.png`, new Blob(["x"], { type: "image/png" }), { contentType: "image/png" });
    assert.ok(falsch.error, "anderer Dateityp angenommen");
    const lesen = await buero.client.storage.from("belege").download(pfad);
    assert.ifError(lesen.error);
    const fremd = await anon.storage.from("belege").download(pfad);
    assert.ok(fremd.error, "nicht angemeldet gelesen");
    const ohne = await ohneMfa.client.storage.from("belege").download(pfad);
    assert.ok(ohne.error || !ohne.data?.size, "ohne zweiten Faktor gelesen");
    await buero.client.storage.from("belege").remove([pfad]);
    const noch = await service.storage.from("belege").download(pfad);
    assert.ok(!noch.error, "Benutzer konnte die Datei löschen");
    await service.storage.from("belege").remove([pfad]);
  });
});

describe("OneDrive-Ablage", () => {
  it("Benutzer lesen Ordner und Dateien, schreiben nur über den Server; Token nie lesbar", async () => {
    const { data: oid, error } = await service.rpc("ablage_ordner_setzen", { p_benutzer: buero.id, p_id: null, p_daten: { anfrage_id: daten.anfrage.id, name: `AG_${lauf}`, status: "wartet" } });
    assert.ifError(error);
    angelegt.push(["ablage_ordner", oid]);
    const { data: did } = await service.rpc("ablage_datei_setzen", { p_benutzer: buero.id, p_id: null, p_daten: { ordner_id: oid, name: "Scan.pdf", quelle: "upload", status: "wartet" } });
    angelegt.push(["ablage_datei", did]);
    const { data: o } = await buero.client.from("ablage_ordner").select("id, name").eq("id", oid).single();
    assert.equal(o?.name, `AG_${lauf}`, "Ordner nicht lesbar");
    const { data: d } = await buero.client.from("ablage_datei").select("id").eq("id", did);
    assert.equal(d?.length, 1, "Datei nicht lesbar");
    const ins = await buero.client.from("ablage_ordner").insert({ anfrage_id: daten.anfrage.id, name: "x" });
    assert.ok(ins.error, "Benutzer legt Ordner direkt an");
    const { data: upd } = await buero.client.from("ablage_datei").update({ status: "abgelegt", item_id: "gefaelscht" }).eq("id", did).select("id");
    assert.deepEqual(upd ?? [], [], "Benutzer ändert die Verknüpfung");
    for (const [fn, args] of [
      ["ablage_ordner_setzen", { p_benutzer: buero.id, p_id: oid, p_daten: { item_id: "x" } }],
      ["ablage_datei_setzen", { p_benutzer: buero.id, p_id: did, p_daten: { item_id: "x" } }],
    ]) {
      const r = await admin.client.rpc(fn, args);
      assert.ok(r.error, `${fn} für Benutzer aufrufbar`);
    }
    const t = await admin.client.from("ms_token").select("*");
    assert.ok(t.error || !t.data?.length, "Token für Benutzer lesbar");
    // Verwerfen eines Uploads markiert nur als gelöscht und nennt den handelnden Benutzer
    assert.ifError((await service.rpc("ablage_datei_setzen", { p_benutzer: buero.id, p_id: did, p_daten: { geloescht: true } })).error);
    const { data: weg } = await service.from("ablage_datei").select("deleted_at").eq("id", did).single();
    assert.ok(weg.deleted_at, "nicht als gelöscht markiert");
  });
});

describe("Vorläufiger Versand und globale Suche", () => {
  it("beleg_versenden: kein Entwurf, nur gültige Adressen, friert Angebot ein und protokolliert", async () => {
    const ag = await belegSpeichern(buero, { art: "angebot", kunde_id: daten.kunde.id, anfrage_id: daten.anfrage.id, titel: `Versand ${lauf}` });
    const args = { p_id: ag.id, p_empfaenger: ["kunde@example.com"], p_bcc: ["angebot@example.com"], p_betreff: "Angebot", p_text: "Guten Tag", p_datei: "AG_Angebot.pdf" };
    const entwurf = await buero.client.rpc("beleg_versenden", args);
    assert.equal(entwurf.error?.code, "23514", "Entwurf versendet");
    await fertig(buero, ag.id);
    const falsch = await buero.client.rpc("beleg_versenden", { ...args, p_empfaenger: ["x@y.de\r\nBcc: evil@z.de"] });
    assert.equal(falsch.error?.code, "23514", "ungültige Adresse angenommen");
    const leer = await buero.client.rpc("beleg_versenden", { ...args, p_empfaenger: [] });
    assert.equal(leer.error?.code, "23514", "ohne Empfänger angenommen");
    const nichtAngemeldet = await anon.rpc("beleg_versenden", args);
    assert.ok(nichtAngemeldet.error, "nicht angemeldet versendet");
    const { data: version, error } = await buero.client.rpc("beleg_versenden", args);
    assert.ifError(error);
    assert.equal(version, 1);
    const { data: b } = await service.from("beleg").select("eingefroren_version").eq("id", ag.id).single();
    assert.equal(b.eingefroren_version, 1, "Version nicht eingefroren");
    const { data: v } = await service.from("beleg_versand").select("id, kanal, empfaenger, bcc, pdfs").eq("beleg_id", ag.id);
    assert.equal(v.length, 1);
    assert.deepEqual([v[0].kanal, v[0].empfaenger, v[0].bcc, v[0].pdfs[0].name], ["email", ["kunde@example.com"], ["angebot@example.com"], "AG_Angebot.pdf"]);
    const { data: ver } = await service.from("beleg_version").select("id").eq("beleg_id", ag.id);
    for (const x of ver ?? []) angelegt.push(["beleg_version", x.id]);
  });

  it("Suche: findet mit den Rechten des Benutzers; nicht angemeldet und ohne MFA nichts; Konditionen und Gelöschtes nie", async () => {
    const { data: t, error } = await buero.client.rpc("suche", { p_q: `Testkunde ${lauf}`, p_je_bereich: 3 });
    assert.ifError(error);
    assert.ok(t.some((x) => x.bereich === "kunde" && x.id === daten.kunde.id), "Kunde nicht gefunden");
    const a = await anon.rpc("suche", { p_q: `Testkunde ${lauf}`, p_je_bereich: 3 });
    assert.ok(a.error || !a.data?.length, "nicht angemeldet findet etwas");
    const ohne = await ohneMfa.client.rpc("suche", { p_q: `Testkunde ${lauf}`, p_je_bereich: 3 });
    assert.ok(ohne.error || !ohne.data?.length, "ohne MFA findet etwas");
    // Konditionen („Test: 5 % Rabatt“) werden nicht durchsucht, auch nicht mit dem Recht
    const { data: k } = await admin.client.rpc("suche", { p_q: "5 % Rabatt", p_je_bereich: 50 });
    assert.ok(!(k ?? []).some((x) => x.id === daten.kunde.id), "Konditionen durchsucht");
    const geloescht = await svcInsert("kunde", { name: `Weg ${lauf}` });
    assert.ifError((await buero.client.rpc("loeschen", { p_tabelle: "kunde", p_id: geloescht.id })).error);
    const { data: w } = await buero.client.rpc("suche", { p_q: `Weg ${lauf}`, p_je_bereich: 3 });
    assert.deepEqual(w, [], "gelöschter Kunde gefunden");
    const { data: platzhalter } = await buero.client.rpc("suche", { p_q: "%_", p_je_bereich: 3 });
    assert.ok(!(platzhalter ?? []).length || platzhalter.every((x) => /%_/.test(JSON.stringify(x))), "Platzhalter nicht maskiert");
  });
});

describe("Plantafel: Kolonnen, Ressourcen, Farbe, Sammelfreigabe", () => {
  const kuerzel = (p) => p + Array.from(randomBytes(3), (x) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[x % 26]).join("");
  const mitglieder = async (kolonne) => (await service.from("kolonne_mitglied").select("id, mitarbeiter_id, reihenfolge, deleted_at").eq("kolonne_id", kolonne).order("created_at")).data ?? [];
  const merkeMitglieder = async (kolonne) => {
    for (const m of await mitglieder(kolonne)) if (!angelegt.some(([t, x]) => t === "kolonne_mitglied" && x === m.id)) angelegt.push(["kolonne_mitglied", m.id]);
  };
  let zweiter, kol1, kol2, ressource;
  const einsatzNeu = async (wer, extra) => {
    const beginn = new Date(Date.now() + 9 * 864e5);
    const { data: id, error } = await wer.client.rpc("einsatz_speichern", {
      p_id: null, p_auftrag_id: daten.auftrag.id, p_ticket_id: null, p_beginn: beginn.toISOString(), p_ende: new Date(beginn.getTime() + 4 * 36e5).toISOString(),
      p_monteure: [], p_fahrzeug_id: null, p_fest: false, p_hinweis: null, ...extra,
    });
    if (id) {
      angelegt.push(["einsatz", id]);
      for (const m of (await service.from("einsatz_monteur").select("id").eq("einsatz_id", id)).data ?? []) angelegt.push(["einsatz_monteur", m.id]);
    }
    return { id, error };
  };

  it("Kolonne speichern: Mitglieder in Reihenfolge, nur Monteure, entfernte nur markiert", async () => {
    zweiter = await svcInsert("mitarbeiter", { kuerzel: kuerzel("K"), name: `Zweiter Monteur ${lauf}`, ist_monteur: true });
    const buerokraft = await svcInsert("mitarbeiter", { kuerzel: kuerzel("B"), name: `Bürokraft ${lauf}`, ist_monteur: false });
    const { data: id, error } = await buero.client.rpc("kolonne_speichern", { p_id: null, p_name: `Kolonne ${lauf}`, p_stammfahrzeug_id: null, p_mitglieder: [zweiter.id, daten.monteur.id] });
    assert.ifError(error);
    kol1 = id;
    angelegt.push(["kolonne", id]);
    await merkeMitglieder(id);
    assert.deepEqual((await mitglieder(id)).map((m) => [m.mitarbeiter_id, m.reihenfolge]), [[zweiter.id, 1], [daten.monteur.id, 2]]);
    const nicht = await buero.client.rpc("kolonne_speichern", { p_id: id, p_name: `Kolonne ${lauf}`, p_stammfahrzeug_id: null, p_mitglieder: [buerokraft.id] });
    assert.ok(nicht.error, "Nicht-Monteur als Mitglied angenommen");
    assert.ifError((await buero.client.rpc("kolonne_speichern", { p_id: id, p_name: `Kolonne ${lauf}`, p_stammfahrzeug_id: null, p_mitglieder: [daten.monteur.id] })).error);
    const nachher = await mitglieder(id);
    assert.ok(nachher.find((m) => m.mitarbeiter_id === zweiter.id)?.deleted_at, "entferntes Mitglied nicht als gelöscht markiert");
    assert.equal(nachher.filter((m) => !m.deleted_at).length, 1);
    const anon2 = await anon.rpc("kolonne_speichern", { p_id: null, p_name: "x", p_stammfahrzeug_id: null, p_mitglieder: [] });
    assert.ok(anon2.error, "nicht angemeldet: Kolonne angelegt");
  });

  it("Monteur in weitere Kolonne duplizieren, nicht doppelt, wieder entfernen", async () => {
    const { data: id } = await buero.client.rpc("kolonne_speichern", { p_id: null, p_name: `Kolonne B ${lauf}`, p_stammfahrzeug_id: null, p_mitglieder: [] });
    kol2 = id;
    angelegt.push(["kolonne", id]);
    assert.ifError((await buero.client.rpc("kolonne_monteur", { p_mitarbeiter: daten.monteur.id, p_von: kol1, p_nach: kol2, p_kopieren: true, p_vor: null })).error);
    await merkeMitglieder(kol2);
    assert.equal((await mitglieder(kol1)).filter((m) => !m.deleted_at && m.mitarbeiter_id === daten.monteur.id).length, 1, "beim Duplizieren aus der alten Kolonne entfernt");
    assert.equal((await mitglieder(kol2)).filter((m) => !m.deleted_at).length, 1);
    const doppelt = await buero.client.rpc("kolonne_monteur", { p_mitarbeiter: daten.monteur.id, p_von: kol1, p_nach: kol2, p_kopieren: false, p_vor: null });
    assert.equal(doppelt.error?.code, "23505", "schon Mitglied: doppelt angelegt");
    assert.ifError((await buero.client.rpc("kolonne_monteur", { p_mitarbeiter: daten.monteur.id, p_von: kol2, p_nach: null, p_kopieren: false, p_vor: null })).error);
    assert.ok((await mitglieder(kol2)).every((m) => m.deleted_at), "aus der Kolonne entfernt (nur markiert)");
    assert.ifError((await buero.client.rpc("kolonne_loeschen", { p_id: kol2 })).error);
    const { data: k } = await service.from("kolonne").select("deleted_at").eq("id", kol2).single();
    assert.ok(k.deleted_at, "Kolonne nur als gelöscht markiert");
  });

  it("Einsatz mit weiterer Ressource ohne Monteur; Farbe nur aus Palette oder #RRGGBB", async () => {
    ressource = await svcInsert("ressource", { name: `Selbstabholer ${lauf}` });
    const ok = await einsatzNeu(buero, { p_ressource_id: ressource.id, p_farbe: "plan-3" });
    assert.ifError(ok.error);
    const { data: e } = await service.from("einsatz").select("ressource_id, farbe").eq("id", ok.id).single();
    assert.deepEqual(e, { ressource_id: ressource.id, farbe: "plan-3" });
    const frei = await einsatzNeu(buero, { p_monteure: [daten.monteur.id], p_farbe: "#1A237E" });
    assert.ifError(frei.error);
    const falsch = await einsatzNeu(buero, { p_monteure: [daten.monteur.id], p_farbe: "red; background:url(x)" });
    assert.equal(falsch.error?.code, "23514", "ungültige Farbe angenommen");
    const leer = await einsatzNeu(buero, {});
    assert.ok(leer.error, "ohne Monteur und ohne Ressource angenommen");
  });

  it("Ressource mit künftigem Einsatz nicht löschbar; danach nur als Markierung", async () => {
    const r = await buero.client.rpc("ressource_loeschen", { p_id: ressource.id });
    assert.equal(r.error?.code, "23514");
    const { data: es } = await service.from("einsatz").select("id").eq("ressource_id", ressource.id).is("deleted_at", null);
    for (const e of es ?? []) assert.ifError((await buero.client.rpc("einsatz_loeschen", { p_id: e.id })).error);
    assert.ifError((await buero.client.rpc("ressource_loeschen", { p_id: ressource.id })).error);
    const { data } = await service.from("ressource").select("deleted_at").eq("id", ressource.id).single();
    assert.ok(data.deleted_at);
  });

  it("Sammelfreigabe: nur vorgeplante, Anzahl zurück; nicht angemeldet nichts", async () => {
    const a = await einsatzNeu(buero, { p_monteure: [daten.monteur.id] });
    const b2 = await einsatzNeu(buero, { p_monteure: [daten.monteur.id] });
    const nichtAngemeldet = await anon.rpc("einsatz_freigeben", { p_ids: [a.id, b2.id] });
    assert.ok(nichtAngemeldet.error || nichtAngemeldet.data === 0, "nicht angemeldet freigegeben");
    const { data: n, error } = await buero.client.rpc("einsatz_freigeben", { p_ids: [a.id, b2.id] });
    assert.ifError(error);
    assert.equal(n, 2);
    const { data: n2 } = await buero.client.rpc("einsatz_freigeben", { p_ids: [a.id, b2.id] });
    assert.equal(n2, 0, "schon freigegebene noch einmal gezählt");
    const { data: fest } = await service.from("einsatz").select("fest").in("id", [a.id, b2.id]);
    assert.ok(fest.every((x) => x.fest));
  });
});

describe("Lexware-Webhook (Eingangsprotokoll)", () => {
  const eingang = (schluessel) =>
    service.rpc("lexware_ereignis_eingang", { p_schluessel: schluessel, p_ereignis: "payment.changed", p_ressource: randomUUID(), p_am: new Date().toISOString(), p_organisation: randomUUID() });
  it("Benutzer können die Server-Funktionen nicht aufrufen und nichts eintragen", async () => {
    const a = await buero.client.rpc("lexware_ereignis_eingang", { p_schluessel: `x-${lauf}`, p_ereignis: "payment.changed", p_ressource: "x", p_am: null, p_organisation: null });
    assert.ok(a.error, "lexware_ereignis_eingang für Benutzer aufrufbar");
    const e = await admin.client.rpc("lexware_ereignis_ende", { p_id: randomUUID(), p_status: "verarbeitet", p_fehler: null });
    assert.ok(e.error, "lexware_ereignis_ende für Admins aufrufbar");
    const i = await admin.client.from("lexware_ereignis").insert({ schluessel: `x-${lauf}`, ereignis: "payment.changed", ressource_id: "x" });
    assert.ok(i.error, "Admin kann Ereignisse eintragen");
  });
  it("Doppelzustellung wird erkannt; nach einem Fehler wird erneut verarbeitet; lesen nur Admins", async () => {
    const schluessel = `rls-${lauf}-${randomUUID()}`;
    const r1 = await eingang(schluessel);
    assert.ifError(r1.error);
    angelegt.push(["lexware_ereignis", r1.data.id]);
    assert.equal(r1.data.verarbeiten, true, "neues Ereignis");
    const r2 = await eingang(schluessel);
    assert.equal(r2.data.verarbeiten, false, "Doppelzustellung während der Verarbeitung");
    assert.ifError((await service.rpc("lexware_ereignis_ende", { p_id: r1.data.id, p_status: "fehler", p_fehler: "Lexware nicht erreichbar" })).error);
    const r3 = await eingang(schluessel);
    assert.equal(r3.data.verarbeiten, true, "nach Fehler erneut verarbeiten");
    assert.equal(r3.data.id, r1.data.id);
    await service.rpc("lexware_ereignis_ende", { p_id: r1.data.id, p_status: "verarbeitet", p_fehler: null });
    const r4 = await eingang(schluessel);
    assert.equal(r4.data.verarbeiten, false, "verarbeitetes Ereignis nicht noch einmal");
    const ungueltig = await service.rpc("lexware_ereignis_ende", { p_id: r1.data.id, p_status: "kaputt", p_fehler: null });
    assert.ok(ungueltig.error, "ungültiger Status angenommen");

    const { data: b } = await buero.client.from("lexware_ereignis").select("id").eq("id", r1.data.id);
    assert.deepEqual(b, [], "Büro sieht das Protokoll");
    const { data: a } = await admin.client.from("lexware_ereignis").select("status, versuche, verarbeitet_am, fehler").eq("id", r1.data.id).single();
    assert.equal(a.status, "verarbeitet");
    assert.equal(a.versuche, 4);
    assert.ok(a.verarbeitet_am);
    assert.equal(a.fehler, null);
  });
});

describe("Formulare & Protokolle", () => {
  const zeile = (id, teil = {}) => ({ id, raum: "Küche", element: "Fenster", breite_mm: "1230", hoehe_mm: "1480", anzahl: "2", anschlag: "DIN links", bemerkung: "", ...teil });

  it("Aufmaß speichern: Zeilen anlegen, ändern, entfernte nur markieren, Werte geprüft, unveränderte nicht geschrieben", async () => {
    const { data: f, error } = await buero.client.from("formular").insert({ typ: "aufmass", status: "entwurf", auftrag_id: daten.auftrag.id }).select().single();
    assert.ifError(error);
    angelegt.push(["formular", f.id]);
    const z1 = randomUUID();
    const z2 = randomUUID();
    let r = await buero.client.rpc("aufmass_speichern", {
      p_id: f.id,
      p_datum: "2026-11-12",
      p_hinweise: "  Zugang Garten ",
      p_zeilen: [zeile(z1), zeile(z2, { raum: "Bad", breite_mm: "0", hoehe_mm: "abc", anzahl: "", bemerkung: "x" })],
    });
    assert.ifError(r.error);
    const { data: zeilen } = await service.from("aufmass_zeile").select("id, reihenfolge, raum, breite_mm, hoehe_mm, anzahl, bemerkung, created_by").eq("formular_id", f.id).order("reihenfolge");
    assert.equal(zeilen.length, 2);
    assert.deepEqual([zeilen[0].breite_mm, zeilen[0].hoehe_mm, zeilen[0].anzahl, zeilen[0].bemerkung], [1230, 1480, 2, null]);
    assert.deepEqual([zeilen[1].breite_mm, zeilen[1].hoehe_mm, zeilen[1].anzahl], [null, null, 1], "ungültige Maße übernommen");
    assert.equal(zeilen[0].created_by, buero.id, "handelnder Benutzer fehlt");
    const { data: kopf } = await service.from("formular").select("hinweise, datum").eq("id", f.id).single();
    assert.deepEqual([kopf.hinweise, kopf.datum], ["Zugang Garten", "2026-11-12"]);

    // zweite Speicherung: z2 fehlt (wird markiert), z1 geändert
    r = await buero.client.rpc("aufmass_speichern", { p_id: f.id, p_datum: null, p_hinweise: "Zugang Garten", p_zeilen: [zeile(z1, { raum: "Wohnen" })] });
    assert.ifError(r.error);
    const { data: weg } = await service.from("aufmass_zeile").select("deleted_at").eq("id", z2).single();
    assert.ok(weg.deleted_at, "entfernte Zeile nicht markiert");
    const { data: sichtbar } = await buero.client.from("aufmass_zeile").select("raum").eq("formular_id", f.id);
    assert.deepEqual(sichtbar.map((x) => x.raum), ["Wohnen"]);
    const vorher = (await buero.client.rpc("historie", { p_tabelle: "aufmass_zeile", p_id: z1 })).data.length;
    r = await buero.client.rpc("aufmass_speichern", { p_id: f.id, p_datum: null, p_hinweise: "Zugang Garten", p_zeilen: [zeile(z1, { raum: "Wohnen" })] });
    assert.ifError(r.error);
    assert.equal((await buero.client.rpc("historie", { p_tabelle: "aufmass_zeile", p_id: z1 })).data.length, vorher, "unveränderte Zeile neu geschrieben");

    // nicht angemeldet bzw. ohne MFA nichts
    assert.ok((await anon.rpc("aufmass_speichern", { p_id: f.id, p_datum: null, p_hinweise: "", p_zeilen: [] })).error);
    assert.ok((await ohneMfa.client.rpc("aufmass_speichern", { p_id: f.id, p_datum: null, p_hinweise: "", p_zeilen: [] })).error);
  });

  it("Abgeschlossenes Aufmaß ist gesperrt, bis es wieder geöffnet wird; Art und Bezug bleiben", async () => {
    const { data: f } = await buero.client.from("formular").insert({ typ: "aufmass", status: "entwurf", auftrag_id: daten.auftrag.id }).select().single();
    angelegt.push(["formular", f.id]);
    const z = randomUUID();
    assert.ifError((await buero.client.rpc("aufmass_speichern", { p_id: f.id, p_datum: null, p_hinweise: "", p_zeilen: [zeile(z)] })).error);
    assert.ifError((await buero.client.from("formular").update({ status: "abgeschlossen" }).eq("id", f.id)).error);
    const r = await buero.client.rpc("aufmass_speichern", { p_id: f.id, p_datum: null, p_hinweise: "", p_zeilen: [zeile(z, { raum: "x" })] });
    assert.match(r.error?.message ?? "", /abgeschlossen/);
    assert.ok((await buero.client.from("aufmass_zeile").update({ raum: "x" }).eq("id", z).select("id")).error, "Zeile direkt änderbar");
    assert.ok((await buero.client.from("aufmass_zeile").insert({ formular_id: f.id, element: "Tür" })).error, "Zeile direkt anlegbar");
    assert.ok((await buero.client.from("formular").update({ hinweise: "neu" }).eq("id", f.id).select("id")).error, "Kopf änderbar");
    assert.ok((await buero.client.from("formular").update({ typ: "montageprotokoll", status: "gedruckt" }).eq("id", f.id).select("id")).error, "Art änderbar");
    assert.ok((await buero.client.from("formular").update({ auftrag_id: null, anfrage_id: daten.anfrage.id }).eq("id", f.id).select("id")).error, "Bezug änderbar");
    assert.ifError((await buero.client.from("formular").update({ status: "entwurf" }).eq("id", f.id)).error);
    assert.ifError((await buero.client.rpc("aufmass_speichern", { p_id: f.id, p_datum: null, p_hinweise: "", p_zeilen: [zeile(z, { raum: "Flur" })] })).error);
  });

  it("Protokolle: nicht an der Anfrage; „Gedruckt“ → „Scan abgelegt“, nicht zurück", async () => {
    const { data: p, error } = await buero.client.from("formular").insert({ typ: "montageprotokoll", status: "gedruckt", auftrag_id: daten.auftrag.id }).select().single();
    assert.ifError(error);
    angelegt.push(["formular", p.id]);
    assert.ok((await buero.client.from("formular").insert({ typ: "uebergabeprotokoll", status: "gedruckt", anfrage_id: daten.anfrage.id }).select()).error, "Protokoll an einer Anfrage");
    assert.ok((await buero.client.from("formular").insert({ typ: "servicebericht", status: "entwurf", auftrag_id: daten.auftrag.id }).select()).error, "Protokoll im Entwurf");
    assert.ifError((await buero.client.from("formular").update({ status: "scan_abgelegt" }).eq("id", p.id)).error);
    assert.ok((await buero.client.from("formular").update({ status: "gedruckt" }).eq("id", p.id).select("id")).error, "zurück auf Gedruckt");
    // Scan in der Ablage mit Verweis auf das Formular (nur über den Server)
    const { data: oid } = await service.rpc("ablage_ordner_setzen", { p_benutzer: buero.id, p_id: null, p_daten: { auftrag_id: daten.auftrag.id, name: `AB_${lauf}`, status: "wartet" } });
    angelegt.push(["ablage_ordner", oid]);
    const { data: did, error: e2 } = await service.rpc("ablage_datei_setzen", { p_benutzer: buero.id, p_id: null, p_daten: { ordner_id: oid, name: "Scan.pdf", quelle: "upload", formular_id: p.id, status: "wartet" } });
    assert.ifError(e2);
    angelegt.push(["ablage_datei", did]);
    const { data: d } = await buero.client.from("ablage_datei").select("formular_id").eq("id", did).single();
    assert.equal(d.formular_id, p.id);
  });

  it("Mit dem Auftrag wandert das Aufmaß der Anfrage in den Auftrag", async () => {
    const anfrage = await svcInsert("anfrage", { titel: `Formular ${lauf}`, kunde_id: daten.kunde.id });
    const { data: f } = await buero.client.from("formular").insert({ typ: "aufmass", status: "abgeschlossen", anfrage_id: anfrage.id }).select().single();
    angelegt.push(["formular", f.id]);
    const auftrag = await svcInsert("auftrag", { nummer: `TESTF-${lauf}`, kunde_id: daten.kunde.id, anfrage_id: anfrage.id, titel: "Test" });
    angelegt.push(["formular", f.id]); // vor dem Auftrag entfernen
    const { data: neu } = await service.from("formular").select("anfrage_id, auftrag_id").eq("id", f.id).single();
    assert.deepEqual([neu.anfrage_id, neu.auftrag_id], [null, auftrag.id]);
  });
});

describe("Chat", () => {
  it("Nachrichten: nur als man selbst, nicht änderbar, löschen nur eigene (Markierung)", async () => {
    const { data: n, error } = await buero.client.from("chat_nachricht").insert({ auftrag_id: daten.auftrag.id, text: `Hallo ${lauf}` }).select().single();
    assert.ifError(error);
    angelegt.push(["chat_nachricht", n.id]);
    assert.equal(n.autor_id, buero.id);
    const fremd = await buero.client.from("chat_nachricht").insert({ auftrag_id: daten.auftrag.id, text: "falscher Autor", autor_id: admin.id }).select();
    assert.ok(fremd.error, "Nachricht im Namen eines anderen");
    const leer = await buero.client.from("chat_nachricht").insert({ auftrag_id: daten.auftrag.id, text: "" }).select();
    assert.ok(leer.error, "leere Nachricht ohne Foto");
    const { data: aend } = await buero.client.from("chat_nachricht").update({ text: "geändert" }).eq("id", n.id).select("id");
    assert.deepEqual(aend ?? [], [], "eigene Nachricht änderbar");
    const { data: fremdAend } = await admin.client.from("chat_nachricht").update({ text: "fremd" }).eq("id", n.id).select("id");
    assert.deepEqual(fremdAend ?? [], [], "fremde Nachricht änderbar");
    assert.ok((await admin.client.rpc("loeschen", { p_tabelle: "chat_nachricht", p_id: n.id })).error, "fremde Nachricht löschbar");
    const { data: sicht } = await admin.client.from("chat_nachricht").select("id, text").eq("id", n.id).single();
    assert.equal(sicht.text, `Hallo ${lauf}`, "alle Benutzer lesen den Chat");
  });

  it("Ungelesen je Auftrag; eigene zählen nicht; gelesen setzen nur für sich", async () => {
    const { data: n } = await buero.client.from("chat_nachricht").insert({ auftrag_id: daten.auftrag.id, text: `Frage an @${lauf}` }).select().single();
    angelegt.push(["chat_nachricht", n.id]);
    const zahl = async (wer) => ((await wer.client.rpc("chat_ungelesen")).data ?? []).find((z) => z.auftrag_id === daten.auftrag.id)?.anzahl ?? 0;
    assert.equal(await zahl(buero), 0, "eigene Nachrichten als ungelesen gezählt");
    const vorher = await zahl(admin);
    assert.ok(vorher >= 1, "neue Nachricht nicht ungelesen");
    const { data: gesetzt, error } = await admin.client.rpc("chat_gelesen_setzen", { p_auftrag: daten.auftrag.id, p_ticket: null });
    assert.ifError(error);
    assert.equal(gesetzt, vorher);
    assert.equal(await zahl(admin), 0);
    assert.equal((await admin.client.rpc("chat_gelesen_setzen", { p_auftrag: daten.auftrag.id, p_ticket: null })).data, 0, "doppelt gelesen");
    const { data: gl } = await service.from("chat_gelesen").select("id, benutzer_id").eq("nachricht_id", n.id);
    for (const g of gl ?? []) angelegt.push(["chat_gelesen", g.id]);
    assert.deepEqual((gl ?? []).map((g) => g.benutzer_id), [admin.id]);
    const { data: fremdeGelesen } = await buero.client.from("chat_gelesen").select("id").eq("nachricht_id", n.id);
    assert.deepEqual(fremdeGelesen ?? [], [], "fremder Lesestand sichtbar");
    assert.ok((await buero.client.from("chat_gelesen").insert({ nachricht_id: n.id, benutzer_id: admin.id })).error, "Lesestand für andere gesetzt");
    assert.ok((await anon.rpc("chat_ungelesen")).error || !(await anon.rpc("chat_ungelesen")).data?.length, "nicht angemeldet");
    assert.ok((await buero.client.rpc("chat_gelesen_setzen", { p_auftrag: daten.auftrag.id, p_ticket: daten.auftrag.id })).error, "zwei Bezüge");
  });

  it("Benachrichtigungen nur für den Empfänger lesbar; Fotos nur über den Server", async () => {
    const { error } = await buero.client.from("benachrichtigung").insert({ benutzer_id: admin.id, art: "erwaehnung", text: `Test ${lauf}`, link: `/auftraege/${daten.auftrag.id}?reiter=chat` });
    assert.ifError(error);
    const { data: alle } = await service.from("benachrichtigung").select("id").eq("text", `Test ${lauf}`);
    for (const x of alle ?? []) angelegt.push(["benachrichtigung", x.id]);
    const { data: absender } = await buero.client.from("benachrichtigung").select("id").eq("text", `Test ${lauf}`);
    assert.deepEqual(absender ?? [], [], "Absender sieht fremde Benachrichtigung");
    const { data: eig } = await admin.client.from("benachrichtigung").select("id").eq("text", `Test ${lauf}`);
    assert.equal(eig?.length, 1, "Empfänger sieht seine Benachrichtigung nicht");
    // privater Speicher ohne Benutzer-Policies
    const pfad = `${randomUUID()}/foto`;
    const hoch = await buero.client.storage.from("chat-fotos").upload(pfad, Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { contentType: "image/jpeg" });
    assert.ok(hoch.error, "Benutzer lädt direkt in chat-fotos");
    assert.ifError((await service.storage.from("chat-fotos").upload(pfad, Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { contentType: "image/jpeg" })).error);
    const lesen = await buero.client.storage.from("chat-fotos").download(pfad);
    assert.ok(lesen.error, "Benutzer liest chat-fotos direkt");
    const html = await service.storage.from("chat-fotos").upload(`${randomUUID()}/foto`, Buffer.from("<html>"), { contentType: "text/html" });
    assert.ok(html.error, "Speicher nimmt HTML an");
    await service.storage.from("chat-fotos").remove([pfad]);
  });
});

describe("Soft Delete und Audit-Log", () => {
  let aufgabe;
  it("echtes Löschen ist gesperrt", async () => {
    const { data, error } = await buero.client.from("aufgabe").insert({ titel: `Löschtest ${lauf}` }).select().single();
    assert.ifError(error);
    angelegt.push(["aufgabe", data.id]);
    aufgabe = data;
    const del = await buero.client.from("aufgabe").delete().eq("id", aufgabe.id);
    assert.ok(del.error, "DELETE war möglich");
    const { data: noch } = await service.from("aufgabe").select("id, deleted_at").eq("id", aufgabe.id).single();
    assert.equal(noch.deleted_at, null);
  });

  it("loeschen() markiert den Datensatz und blendet ihn aus", async () => {
    await buero.client.from("aufgabe").update({ status: "in_arbeit" }).eq("id", aufgabe.id);
    const { error } = await buero.client.rpc("loeschen", { p_tabelle: "aufgabe", p_id: aufgabe.id });
    assert.ifError(error);
    const sicht = await buero.client.from("aufgabe").select("id").eq("id", aufgabe.id);
    assert.equal(sicht.data.length, 0);
    const { data } = await service.from("aufgabe").select("deleted_at, deleted_by").eq("id", aufgabe.id).single();
    assert.ok(data.deleted_at);
    assert.equal(data.deleted_by, buero.id);
  });

  it("das Audit-Log hält jede Änderung mit Benutzer und Zeitpunkt fest", async () => {
    const { data, error } = await buero.client.rpc("historie", { p_tabelle: "aufgabe", p_id: aufgabe.id });
    assert.ifError(error);
    const aktionen = data.map((e) => e.aktion).reverse();
    assert.deepEqual(aktionen, ["insert", "update", "soft_delete"]);
    for (const e of data) {
      assert.equal(e.benutzer_id, buero.id);
      assert.ok(e.zeit);
      assert.equal(e.db_rolle, "authenticated");
    }
    assert.deepEqual(data.find((e) => e.aktion === "update").geaendert, ["status"]);
  });

  it("Änderungen der Service-Rolle stehen mit ihrer Rolle im Audit-Log", async () => {
    const { data } = await admin.client.rpc("historie", { p_tabelle: "kunde", p_id: daten.kunde.id });
    assert.equal(data.at(-1).aktion, "insert");
    assert.equal(data.at(-1).db_rolle, "service_role");
  });
});
