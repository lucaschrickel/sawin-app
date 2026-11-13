import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { refAusApi, refAusDb, testprojektPruefen } from "../../scripts/testprojekt.mjs";

const API = "https://abcdefghijklmnop.supabase.co";
const POOLER = "postgresql://postgres.abcdefghijklmnop:geheim@aws-1-eu-central-1.pooler.supabase.com:5432/postgres";
const DIREKT = "postgresql://postgres:geheim@db.abcdefghijklmnop.supabase.co:5432/postgres";

describe("Sperre: Tests nur gegen das Testprojekt", () => {
  it("liest die Projekt-Ref aus API-, Pooler- und direkter Datenbankadresse", () => {
    assert.equal(refAusApi(API), "abcdefghijklmnop");
    assert.equal(refAusDb(POOLER), "abcdefghijklmnop");
    assert.equal(refAusDb(DIREKT), "abcdefghijklmnop");
    assert.equal(refAusApi("http://localhost:54321"), null);
    assert.equal(refAusDb("postgresql://postgres:pw@localhost:5432/postgres"), null);
    assert.equal(refAusDb("kein url"), null);
  });

  it("lässt nur zu, wenn API und Datenbank beide zum erlaubten Projekt gehören", () => {
    const ok = { ERLAUBTES_TESTPROJEKT: "abcdefghijklmnop", NEXT_PUBLIC_SUPABASE_URL: API, SUPABASE_DB_URL: POOLER };
    assert.deepEqual(testprojektPruefen(ok), { ref: "abcdefghijklmnop" });
    assert.ok(testprojektPruefen({ ...ok, ERLAUBTES_TESTPROJEKT: "" }).fehler, "ohne Freigabe zugelassen");
    assert.ok(testprojektPruefen({ ...ok, NEXT_PUBLIC_SUPABASE_URL: "https://produktion1234567.supabase.co" }).fehler, "fremde API zugelassen");
    assert.ok(testprojektPruefen({ ...ok, SUPABASE_DB_URL: POOLER.replace("abcdefghijklmnop", "produktion1234567") }).fehler, "fremde Datenbank zugelassen");
  });

  it("nennt im Fehler keine Zugangsdaten", () => {
    const r = testprojektPruefen({ ERLAUBTES_TESTPROJEKT: "x", NEXT_PUBLIC_SUPABASE_URL: API, SUPABASE_DB_URL: POOLER });
    assert.ok(!String(r.fehler).includes("geheim"));
  });
});
