import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sicheresZiel } from "../../src/lib/auth/konstanten.ts";
import { aktivWert, aktivZeit, nochAktiv } from "../../src/lib/auth/aktivitaet.ts";

describe("sicheresZiel: keine offenen Weiterleitungen", () => {
  it("lässt interne Pfade mit Suche und Anker durch", () => {
    assert.equal(sicheresZiel("/"), "/");
    assert.equal(sicheresZiel("/passwort-setzen"), "/passwort-setzen");
    assert.equal(sicheresZiel("/belege?art=angebot#x"), "/belege?art=angebot#x");
    assert.equal(sicheresZiel("/kunden/%C3%A4"), "/kunden/%C3%A4");
  });

  it("weist fremde Ziele zurück, auch mit Tab, Zeilenumbruch, Backslash oder Kodierung", () => {
    for (const ziel of [
      "//fremd.example",
      "/\\fremd.example",
      "/\t/fremd.example",
      "/\n/fremd.example",
      "/\r/fremd.example",
      "/%09/fremd.example",
      "/%0a/fremd.example",
      "/%2F/fremd.example",
      "/%5Cfremd.example",
      "https://fremd.example",
      "javascript:alert(1)",
      "fremd.example",
      "",
      "/%E0%A4%A",
    ]) {
      assert.equal(sicheresZiel(ziel), "/", JSON.stringify(ziel));
    }
    assert.equal(sicheresZiel(undefined), "/");
    assert.equal(sicheresZiel(42, "/anmelden"), "/anmelden");
  });
});

describe("Aktivitäts-Cookie: an die Sitzung gebunden", () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "sb_secret_nur_fuer_den_unit_test";

  it("gilt nur für die eigene Sitzung und unverändert", async () => {
    const jetzt = Date.now();
    const wert = await aktivWert("sitzung-a", jetzt);
    assert.equal(await aktivZeit(wert, "sitzung-a"), jetzt);
    assert.equal(await aktivZeit(wert, "sitzung-b"), null, "für eine andere Sitzung gültig");
    const [zeit, sig] = wert.split(".");
    assert.equal(await aktivZeit(`${Number(zeit) + 1000}.${sig}`, "sitzung-a"), null, "Zeitpunkt verändert");
    assert.equal(await aktivZeit(String(jetzt), "sitzung-a"), null, "ohne Signatur");
    assert.equal(await aktivZeit(undefined, "sitzung-a"), null);
  });

  it("läuft nach 60 Minuten ohne Aktivität ab", async () => {
    const jetzt = Date.now();
    assert.equal(await nochAktiv(await aktivWert("s", jetzt - 59 * 60_000), "s", jetzt), true);
    assert.equal(await nochAktiv(await aktivWert("s", jetzt - 61 * 60_000), "s", jetzt), false);
    assert.equal(await nochAktiv(undefined, "s", jetzt), false, "fehlendes Cookie gilt als abgelaufen");
  });
});
