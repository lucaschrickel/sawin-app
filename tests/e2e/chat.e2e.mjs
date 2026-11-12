// End-to-End-Test Chat je Auftrag und Ticket: Nachricht mit @Erwähnung (Benachrichtigung, Glocke), Foto (privater
// Speicher, Kopie in die Ablage), abgelehntes Foto, ungelesene Nachrichten an Reiter und Liste, neue Nachrichten ohne
// Neuladen (Abfrage alle 10 s), eigene Nachricht löschen, Chat am Ticket.
// Aufruf: App ohne Microsoft-Zugang starten (Dateien bleiben im Zwischenspeicher), z. B.
//   MS_GRAPH_TENANT_ID= MS_GRAPH_CLIENT_ID= MS_GRAPH_CLIENT_SECRET= npx next start -p 3100
//   APP_URL=http://localhost:3100 npm run test:chat
import { mkdtempSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin, weitererBenutzer } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;
let kollegin;
const kz = Array.from(randomBytes(4), (x) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[x % 26]).join("");

async function warteDb(sql, werte, pruef, versuche = 60) {
  for (let i = 0; i < versuche; i++) {
    const z = await dbAbfrage(sql, werte);
    if (pruef(z)) return z;
    await sleep(250);
  }
  return null;
}
async function dateiWaehlen(datei) {
  const { root } = (await b.cdp("DOM.getDocument", { depth: 1 })).result;
  const { nodeId } = (await b.cdp("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-chat-foto-datei]" })).result;
  await b.cdp("DOM.setFileInputFiles", { nodeId, files: [datei] });
}
const anzahlNachrichten = () => b.js("document.querySelectorAll('[data-chat-nachricht]').length");

try {
  const admin = await testAdmin();
  kollegin = await weitererBenutzer("Kollegin");
  const { data: ma } = await service.from("mitarbeiter").insert({ kuerzel: kz, name: `Kollegin ${lauf}` }).select("id").single();
  merken("mitarbeiter", ma.id);
  await service.from("benutzer").update({ mitarbeiter_id: ma.id }).eq("id", kollegin.id);
  const { data: kunde } = await service.from("kunde").insert({ name: `Chatkunde ${lauf}` }).select("id").single();
  merken("kunde", kunde.id);
  const { data: auftrag } = await service.from("auftrag").insert({ nummer: `CHAT-${lauf}`, kunde_id: kunde.id, titel: "Haustür" }).select("id, nummer").single();
  merken("auftrag", auftrag.id);
  const { data: ticket } = await service.from("service_ticket").insert({ kunde_id: kunde.id, thema: `Rollladen ${lauf}` }).select("id, nummer").single();
  merken("service_ticket", ticket.id);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "chat-"));
  const png = path.join(tmp, "baustelle.png");
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const falsch = path.join(tmp, "boese.jpg");
  writeFileSync(falsch, "<html><script>alert(1)</script></html>");

  b = await browser();
  await b.anmelden(admin);

  // 1. Reiter Chat am Auftrag, Nachricht mit Erwähnung
  await b.gehe(`/auftraege/${auftrag.id}`);
  await b.klickText("nav[aria-label=Bereiche] a", "Chat");
  pruefe("Reiter Chat: leer mit Hinweis auf @Kürzel", await b.warte("!!document.querySelector('[data-chat]') && document.querySelector('[data-chat-liste]').innerText.includes('Noch keine Nachrichten')"));
  pruefe("Reiter in der Reihenfolge Übersicht, Chat, Formulare, Historie", (await b.js("[...document.querySelectorAll('nav[aria-label=Bereiche] a')].map((a) => a.innerText.trim()).join('|')")) === "Übersicht|Chat|Formulare & Protokolle|Historie");
  await b.js(`(() => { const el = document.querySelector("[data-chat-erwaehnen]"); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(el, ${JSON.stringify(kz)}); el.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  pruefe("„@ erwähnen“ fügt das Kürzel ein", await b.warte(`document.querySelector("[name=nachricht]").value === "@${kz} "`));
  await b.klick("[name=nachricht]");
  await b.cdp("Input.insertText", { text: "bitte das Maß der Haustür prüfen" });
  await b.klick("[data-chat-senden]");
  pruefe("Nachricht erscheint mit hervorgehobener Erwähnung", await b.warte(`[...document.querySelectorAll('[data-chat-nachricht] [data-erwaehnung]')].some((x) => x.innerText === "@${kz}")`, 20000));
  pruefe("Meldung: benachrichtigt", await b.warte(`document.querySelector('[data-chat-meldung]')?.innerText.includes("Kollegin ${lauf}")`));
  const n1 = await warteDb("select id, erwaehnt, autor_id from public.chat_nachricht where auftrag_id = $1", [auftrag.id], (r) => r.length === 1);
  pruefe("Gespeichert mit Autor und Erwähnung", n1?.[0].autor_id === admin.id && n1[0].erwaehnt.includes(kollegin.id), JSON.stringify(n1));
  const bn = await warteDb("select text, link from public.benachrichtigung where benutzer_id = $1 and art = 'erwaehnung'", [kollegin.id], (r) => r.length === 1);
  pruefe("Benachrichtigung für die Erwähnte mit Link in den Chat", bn?.[0].link === `/auftraege/${auftrag.id}?reiter=chat` && bn[0].text.includes(auftrag.nummer), JSON.stringify(bn));
  pruefe("Eingabe danach leer", (await b.js("document.querySelector('[name=nachricht]').value")) === "");

  // 2. Foto: privater Speicher, Kopie in die Ablage („04 Auftrag“); falscher Typ abgelehnt
  await dateiWaehlen(png);
  pruefe("Foto gewählt", await b.warte("document.querySelector('[data-chat-foto-gewaehlt]')?.innerText.includes('baustelle.png')"));
  await b.klick("[data-chat-senden]");
  pruefe("Nachricht mit Foto (signierte Adresse)", await b.warte("[...document.querySelectorAll('[data-chat-foto] img')].some((i) => i.src.includes('/storage/v1/object/sign/chat-fotos/'))", 20000));
  const [fz] = await dbAbfrage("select foto_pfad from public.chat_nachricht where auftrag_id = $1 and foto_pfad is not null", [auftrag.id]);
  const ablage = await warteDb("select name, unterordner, quelle from public.ablage_datei where ordner_id in (select id from public.ablage_ordner where auftrag_id = $1)", [auftrag.id], (r) => r.length === 1, 80);
  pruefe("Foto-Kopie für OneDrive „04 Auftrag“ (Chat_<Zeit>.png)", !!ablage && ablage[0].unterordner === "04 Auftrag" && /^Chat_\d{4}-\d{2}-\d{2}_\d{4}\.png$/.test(ablage[0].name), JSON.stringify(ablage));
  await dateiWaehlen(falsch);
  await b.klick("[data-chat-senden]");
  pruefe("HTML als .jpg abgelehnt", await b.warte("document.querySelector('[data-chat] [role=alert]')?.innerText.includes('Erlaubt sind Fotos')", 20000), await b.js("document.querySelector('[data-chat] [role=alert]')?.innerText"));
  pruefe("… keine weitere Nachricht", (await dbAbfrage("select count(*)::int n from public.chat_nachricht where auftrag_id = $1", [auftrag.id]))[0].n === 2);
  await b.klick("[data-chat-foto-gewaehlt] button");
  if (fotos) await b.foto(path.join(fotos, "chat.png"));

  // 3. Neue Nachricht der Kollegin erscheint ohne Neuladen (Abfrage alle 10 s) und gilt als gelesen
  const vorher = await anzahlNachrichten();
  await service.from("chat_nachricht").insert({ auftrag_id: auftrag.id, autor_id: kollegin.id, text: `Mach ich, @${kz} ist unterwegs` });
  pruefe("Neue Nachricht erscheint ohne Neuladen", await b.warte(`document.querySelectorAll('[data-chat-nachricht]').length === ${vorher + 1}`, 25000));
  pruefe("… beim Ansehen gelesen", !!(await warteDb("select count(*)::int n from public.chat_gelesen g join public.chat_nachricht n on n.id = g.nachricht_id where n.auftrag_id = $1 and g.benutzer_id = $2", [auftrag.id, admin.id], (r) => r[0].n === 1)));

  // 4. Ungelesen an Reiter und Liste
  await b.gehe(`/auftraege/${auftrag.id}`);
  await service.from("chat_nachricht").insert({ auftrag_id: auftrag.id, autor_id: kollegin.id, text: "Noch eine Frage" });
  await b.gehe(`/auftraege/${auftrag.id}`);
  pruefe("Reiter Chat zeigt 1 ungelesene", await b.warte("document.querySelector('nav[aria-label=Bereiche] [data-chat-ungelesen]')?.dataset.chatUngelesen === '1'"));
  await b.gehe(`/auftraege?q=${encodeURIComponent(`Chatkunde ${lauf}`)}`);
  pruefe("Liste der Aufträge zeigt die ungelesene Nachricht", await b.warte("!!document.querySelector('[data-chat-ungelesen=\"1\"]')"));
  await b.gehe(`/auftraege/${auftrag.id}?reiter=chat`);
  pruefe("Nach dem Öffnen keine ungelesene mehr", await b.warte("!document.querySelector('nav[aria-label=Bereiche] [data-chat-ungelesen]')", 20000));

  // 5. Erwähnung des Admins: Glocke, beim Öffnen des Chats erledigt
  await service.from("benachrichtigung").insert({ benutzer_id: admin.id, art: "erwaehnung", text: `Kollegin ${lauf} im Chat zu ${ticket.nummer}: „Bitte anrufen“`, link: `/service/${ticket.id}?reiter=chat` });
  await b.gehe("/");
  await b.klick("[data-glocke]");
  pruefe("Glocke: Erwähnung im Chat", await b.warte("[...document.querySelectorAll('[data-glocke-liste] [data-hinweis]')].some((x) => x.innerText.includes('Erwähnung im Chat') && x.innerText.includes('Bitte anrufen'))"));
  await b.gehe(`/service/${ticket.id}?reiter=chat`);
  pruefe("Ticket: Chat-Reiter", await b.warte("!!document.querySelector('[data-chat]')"));
  pruefe("… Erwähnung gilt als gelesen", !!(await warteDb("select gelesen_am from public.benachrichtigung where benutzer_id = $1 and link = $2", [admin.id, `/service/${ticket.id}?reiter=chat`], (r) => !!r[0]?.gelesen_am)));
  await b.tippe("[name=nachricht]", "Rückruf erledigt");
  await b.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 });
  await b.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 });
  pruefe("Strg+Enter sendet am Ticket", !!(await warteDb("select text from public.chat_nachricht where ticket_id = $1", [ticket.id], (r) => r.length === 1 && r[0].text.startsWith("Rückruf erledigt"))));

  // 6. Eigene Nachricht löschen (Markierung)
  await b.gehe(`/auftraege/${auftrag.id}?reiter=chat`);
  const eigeneId = n1[0].id;
  await b.klick(`[data-chat-loeschen="${eigeneId}"]`);
  await b.klickText("[role=dialog] button", "Löschen");
  pruefe("Gelöscht: ausgeblendet", await b.warte(`!document.querySelector('[data-chat-nachricht="${eigeneId}"]')`, 20000));
  pruefe("… nur als gelöscht markiert", !!(await warteDb("select deleted_at from public.chat_nachricht where id = $1", [eigeneId], (r) => !!r[0]?.deleted_at)));
  pruefe("Fremde Nachricht ohne Löschen-Knopf", await b.js("[...document.querySelectorAll('[data-chat-nachricht]')].filter((x) => !x.querySelector('[data-chat-loeschen]')).length === 2"));
  // Speicher-Datei des Fotos bleibt (Markierung statt Löschen)
  const { data: liste } = await service.storage.from("chat-fotos").list(fz.foto_pfad.split("/")[0]);
  pruefe("Foto liegt im privaten Speicher", (liste ?? []).some((x) => x.name === "foto"));
} catch (e) {
  pruefe("Ablauf ohne Fehler", false, e.stack ?? e.message);
} finally {
  b?.ende();
  try {
    const nachrichten = await dbAbfrage("select id, foto_pfad from public.chat_nachricht where auftrag_id in (select id from public.auftrag where nummer = $1) or ticket_id in (select id from public.service_ticket where thema = $2)", [`CHAT-${lauf}`, `Rollladen ${lauf}`]);
    const pfade = nachrichten.map((x) => x.foto_pfad).filter(Boolean);
    if (pfade.length) await service.storage.from("chat-fotos").remove(pfade);
    const ids = nachrichten.map((x) => x.id);
    if (ids.length) {
      await dbAbfrage("delete from public.chat_gelesen where nachricht_id = any($1)", [ids]);
      await dbAbfrage("delete from public.chat_nachricht where id = any($1)", [ids]);
    }
    await dbAbfrage("delete from public.benachrichtigung where text like $1", [`%${lauf}%`]);
    if (kollegin) await dbAbfrage("update public.benutzer set mitarbeiter_id = null where id = $1", [kollegin.id]);
  } catch (e) {
    console.error("Aufräumen Chat:", e.message);
  }
  await aufraeumen();
}
bilanz();
