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

  it("Gewonnen – Auftrag anlegen: AB-Nummer, Anfrage gewonnen, nur einmal", async () => {
    const { data: auftragId, error } = await buero.client.rpc("anfrage_auftrag_anlegen", { p_anfrage_id: anfrage.id });
    assert.ifError(error);
    angelegt.push(["auftrag", auftragId]);
    const { data: a } = await service.from("auftrag").select("nummer, kunde_id, anfrage_id, titel, created_by").eq("id", auftragId).single();
    assert.match(a.nummer, /^AB2\d{2}\d{4}$/, `Auftragsnummer aus dem AB-Nummernkreis: ${a.nummer}`);
    assert.equal(a.kunde_id, daten.kunde.id);
    assert.equal(a.titel, anfrage.titel);
    assert.equal(a.created_by, buero.id);
    const { data: q } = await service.from("anfrage").select("archiv, archiviert_am").eq("id", anfrage.id).single();
    assert.equal(q.archiv, "gewonnen");
    assert.ok(q.archiviert_am);
    const zweiter = await buero.client.rpc("anfrage_auftrag_anlegen", { p_anfrage_id: anfrage.id });
    assert.equal(zweiter.error?.code, "23505");
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
    const { data: auftragId } = await buero.client.rpc("anfrage_auftrag_anlegen", { p_anfrage_id: q.id });
    angelegt.push(["auftrag", auftragId]);
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
      p_id: null, p_auftrag_id: daten.auftrag.id, p_beginn: t("2026-12-02T06:00:00Z"), p_ende: t("2026-12-02T15:00:00Z"),
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
      p_id: null, p_auftrag_id: daten.auftrag.id, p_beginn: t("2026-12-02T12:00:00Z"), p_ende: t("2026-12-02T14:00:00Z"),
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
      p_id: einsatzId, p_auftrag_id: daten.auftrag.id, p_beginn: t("2026-12-02T06:00:00Z"), p_ende: t("2026-12-03T15:00:00Z"),
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
    const basis = { p_id: null, p_auftrag_id: daten.auftrag.id, p_beginn: t("2026-12-09T06:00:00Z"), p_ende: t("2026-12-09T15:00:00Z"), p_fest: false, p_hinweis: null };
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
