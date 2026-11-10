// End-to-End-Test Modul Kunden mit einem vorübergehenden Test-Admin (TOTP erzeugt der Test).
// Aufruf: App starten (npm run build && npx next start -p 3100), dann APP_URL=http://localhost:3100 npm run test:kunden
// Optional FOTOS=<Ordner> für Bildschirmfotos von Liste, Dialog und Kundenseite.
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
const name = `E2E Fensterbau ${lauf}`;
let b;

/** Wählt im Dialog im n-ten Auswahlfeld (Radix-Select) den Eintrag mit diesem Text. */
async function waehle(n, eintrag) {
  await b.js(`(() => { const el = document.querySelectorAll('[role=dialog] button[role=combobox]')[${n}]; el.setAttribute('data-e2e-select', '1'); })()`);
  await b.klick("[data-e2e-select='1']");
  await b.js("document.querySelector(\"[data-e2e-select='1']\").removeAttribute('data-e2e-select')");
  await b.klickText("[role=option]", eintrag);
}

try {
  const admin = await testAdmin({ konditionen: true });
  b = await browser();
  await b.anmelden(admin);
  pruefe("Anmeldung führt zum Dashboard", await b.warte("location.pathname === '/'"), await b.pfad());
  await b.enthaelt("Kunden");
  const nav = await b.js("[...document.querySelectorAll('aside a[href]')].map((a) => a.getAttribute('href'))");
  pruefe("Navigation zeigt nur fertige Module", nav.includes("/kunden") && nav.includes("/einstellungen") && !nav.includes("/belege") && !nav.includes("/angebote"), nav.join(" "));

  await b.gehe("/kunden");

  // 1. Anlegen mit Lieferadresse
  await b.klickText("button", "Neuer Kunde");
  await b.da("[role=dialog] [name=name]");
  await b.tippe("[name=name]", name);
  await waehle(0, "Firma");
  await waehle(1, "Empfehlung");
  await b.tippe("[name=ansprechpartner]", "Frau Test");
  await b.tippe("[name=strasse]", "Hauptstraße 1");
  await b.tippe("[name=plz]", "38518");
  await b.tippe("[name=ort]", "Gifhorn");
  await b.klickText("button", "Lieferadresse");
  await b.tippe("[name=la_bezeichnung]", "Objekt Rosenweg");
  await b.tippe("[name=la_strasse]", "Rosenweg 3");
  await b.tippe("[name=la_plz]", "38448");
  await b.tippe("[name=la_ort]", "Wolfsburg");
  await b.tippe("[name=telefon]", "05371 1234");
  await b.tippe("[name=email]", `kontakt-${lauf}@example.com`);
  await b.klick("[name=bauleister_13b]");
  await b.tippe("[name=notiz]", "Testkunde aus dem E2E-Test");
  if (fotos) await b.foto(path.join(fotos, "kunde-dialog.png"));
  await b.klickText("button", "Kunde anlegen");
  const angelegt = await b.warte("/^\\/kunden\\/[0-9a-f-]{36}$/.test(location.pathname)");
  pruefe("Anlegen öffnet die Kundenseite", angelegt, await b.pfad());
  const kundeId = (await b.pfad()).split("/").pop();
  merken("kunde", kundeId);
  pruefe("Kundenseite zeigt Name, § 13b und Lexware-Hinweis", (await b.enthaelt(name)) && (await b.text()).includes("Bauleister § 13b") && (await b.text()).includes("Geht mit dem ersten Beleg an Lexware"));
  pruefe("Lieferadresse auf der Kundenseite", (await b.text()).includes("Objekt Rosenweg"));
  const seite = await b.text();
  pruefe("leere Bereiche für Aufträge, Belege, Anfragen, Tickets", ["Noch keine Aufträge", "Noch keine Belege", "Noch keine Anfragen", "Noch keine Service-Tickets"].every((t) => seite.includes(t)));
  const [k] = await dbAbfrage("select nummer, typ, herkunft, created_by from public.kunde where id = $1", [kundeId]);
  pruefe("Kundennummer vergeben, Daten gespeichert", k?.nummer && k.typ === "firma" && k.herkunft === "Empfehlung", `Nr. ${k?.nummer}`);
  pruefe("Audit: angelegt vom Test-Admin", k?.created_by === admin.id);
  if (fotos) await b.foto(path.join(fotos, "kunde-seite.png"));

  // 2. Prüfung im Dialog: PLZ
  await b.klickText("button", "Bearbeiten");
  await b.tippe("[role=dialog] [name=plz]", "12");
  await b.klickText("[role=dialog] button", "Speichern");
  pruefe("ungültige PLZ wird abgelehnt", await b.enthaelt("Fünfstellige PLZ"));

  // 3. Ungespeicherte Änderungen: Escape fragt nach, Verwerfen schließt ohne Speichern
  await b.taste("Escape", "Escape", 27);
  pruefe("Schließen mit Änderungen fragt nach", await b.enthaelt("ungespeicherte Änderungen"));
  await b.klickText("[role=dialog] button", "Verwerfen");
  pruefe("Verwerfen schließt den Dialog", await b.warte("!document.querySelector('[role=dialog]')"));
  const [nachVerwerfen] = await dbAbfrage("select plz from public.kunde where id = $1", [kundeId]);
  pruefe("verworfene Änderung nicht gespeichert", nachVerwerfen.plz === "38518");

  // 4. Bearbeiten: Ansprechpartner ändern, Lieferadresse als „Alt“ markieren
  await b.klickText("button", "Bearbeiten");
  await b.tippe("[role=dialog] [name=ansprechpartner]", "Herr Geändert");
  await b.klickText("[role=dialog] button", "Alt");
  await b.klickText("[role=dialog] button", "Speichern");
  pruefe("Speichern schließt den Dialog", await b.warte("!document.querySelector('[role=dialog]')"));
  pruefe("Änderung sichtbar", await b.enthaelt("Herr Geändert"));
  pruefe("alte Lieferadresse grau als „alt:“", (await b.text()).includes("alt: Objekt Rosenweg"));
  const la = await dbAbfrage("select id, alt_seit from public.kunde_lieferadresse where kunde_id = $1", [kundeId]);
  la.forEach((x) => merken("kunde_lieferadresse", x.id));
  pruefe("Lieferadresse nicht gelöscht, nur alt_seit gesetzt", la.length === 1 && !!la[0].alt_seit);

  // 5. Konditionen
  await b.tippe("[name=konditionen]", "5 % Objektrabatt");
  await b.klick("form:has([name=konditionen]) button[type=submit]");
  pruefe("Konditionen gespeichert", await b.enthaelt("Gespeichert"));
  const kond = await dbAbfrage("select id, text from public.kunde_kondition where kunde_id = $1", [kundeId]);
  kond.forEach((x) => merken("kunde_kondition", x.id));
  pruefe("Konditionen in eigener Tabelle", kond[0]?.text === "5 % Objektrabatt");

  // 6. Liste: Suche und Filter
  await b.gehe(`/kunden?q=${lauf}`);
  pruefe("Suche findet den Kunden", await b.enthaelt(name));
  await b.gehe(`/kunden?q=${lauf}&typ=privat`);
  pruefe("Filter Privat blendet die Firma aus", await b.enthaelt("Keine Kunden für diese Suche"));
  await b.gehe(`/kunden?q=${encodeURIComponent("05371 1234")}`);
  pruefe("Suche über die Telefonnummer", await b.enthaelt(name));
  await b.gehe("/kunden");
  await b.tippe("input[type=search][aria-label='Kunden durchsuchen']", lauf);
  pruefe("Suchfeld filtert beim Tippen", await b.warte(`location.search.includes("q=${lauf}")`) && (await b.enthaelt(name)));
  if (fotos) await b.foto(path.join(fotos, "kunden-liste.png"));

  // 7. Löschen: mit Anfrage gesperrt, danach möglich
  const { data: anfrage } = await service.from("anfrage").insert({ titel: `E2E Anfrage ${lauf}`, kunde_id: kundeId }).select("id").single();
  merken("anfrage", anfrage.id);
  await b.gehe(`/kunden/${kundeId}`);
  await b.klickText("main button", "Löschen");
  pruefe("Löschen fragt nach", await b.enthaelt("Kunde löschen?"));
  await b.klickText("[role=dialog] button", "Löschen");
  pruefe("mit Anfrage nicht löschbar, mit Begründung", await b.enthaelt("hat noch Anfragen"));
  await dbAbfrage("delete from public.anfrage where id = $1", [anfrage.id]);
  await b.gehe(`/kunden/${kundeId}`);
  await b.klickText("main button", "Löschen");
  await b.klickText("[role=dialog] button", "Löschen");
  pruefe("Löschen führt zur Liste", await b.warte("location.pathname === '/kunden'"), await b.pfad());
  const [geloescht] = await dbAbfrage("select deleted_at, deleted_by from public.kunde where id = $1", [kundeId]);
  pruefe("nur als gelöscht markiert (deleted_at, deleted_by)", !!geloescht?.deleted_at && geloescht.deleted_by === admin.id);
  await b.gehe(`/kunden?q=${lauf}`);
  pruefe("gelöschter Kunde nicht mehr in der Liste", await b.enthaelt("Keine Kunden für diese Suche"));
  await b.gehe(`/kunden/${kundeId}`);
  pruefe("gelöschte Kundenseite nicht erreichbar", await b.enthaelt("404"), await b.pfad());
} catch (e) {
  pruefe(`Abbruch: ${e.message}`, false);
} finally {
  b?.ende();
  await aufraeumen().catch((e) => console.error("Aufräumen:", e.message));
}
process.exit(bilanz() ? 1 : 0);
