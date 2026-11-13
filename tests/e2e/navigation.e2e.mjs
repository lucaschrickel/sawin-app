// End-to-End-Test Navigation und Darstellung: globale Suche über Lieferanten, Bestellungen, Aufgaben und Termine
// (Aufgabe und Termin öffnen direkt ihren Dialog), Zurück-Verlauf „← vorherige Maske“ (Seitenleiste, Filter, Reiter,
// Browser-Zurück), Farbschema Hell/Dunkel/System und helle Seitenleiste.
// Aufruf: APP_URL=http://localhost:3100 npm run test:navigation
import path from "node:path";
import { aufraeumen, bilanz, browser, dbAbfrage, lauf, merken, pruefe, service, sleep, testAdmin } from "./hilfen.mjs";

const fotos = process.env.FOTOS;
let b;
const foto = async (name) => fotos && (await b.foto(path.join(fotos, `${name}.png`)));
const var_ = (name) => b.js(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(name)}).trim()`);
const SICHTBAR = "((s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length > 0) ?? null)";
const pfadArt = `${SICHTBAR}('[data-pfad]')?.dataset.pfad`;
const zurueckHref = `${SICHTBAR}('[data-zurueck]')?.getAttribute('href')`;
const zurueck = () => b.js("(() => { const a = " + SICHTBAR + "('[data-zurueck]'); return a ? { href: a.getAttribute('href'), text: a.innerText.replace('←', '').trim() } : null; })()");

try {
  const admin = await testAdmin();
  const heute = new Date().toISOString().slice(0, 10);
  const { data: kunde } = await service.from("kunde").insert({ name: `Navkunde ${lauf}` }).select("id").single();
  merken("kunde", kunde.id);
  const { data: auftrag } = await service.from("auftrag").insert({ nummer: `NAV-${lauf}`, kunde_id: kunde.id, titel: "Fenster" }).select("id, nummer").single();
  merken("auftrag", auftrag.id);
  const { data: lief } = await service.from("lieferant").insert({ name: `Suchlieferant ${lauf}`, produktgruppen: ["Fenster"] }).select("id").single();
  merken("lieferant", lief.id);
  const { data: kontakt } = await service.from("lieferant_kontakt").insert({ lieferant_id: lief.id, name: `Frau Kontakt${lauf}`, email: `k-${lauf}@example.com` }).select("id").single();
  merken("lieferant_kontakt", kontakt.id);
  const { data: best } = await service.from("bestellung").insert({ lieferant_id: lief.id, lieferanten_ab_nummer: `LAB-${lauf}` }).select("id, nummer").single();
  merken("bestellung", best.id);
  const { data: zeile } = await service.from("bestellzeile").insert({ bestellung_id: best.id, auftrag_id: auftrag.id, artikeltext: `Rollo Sonder${lauf}` }).select("id").single();
  merken("bestellzeile", zeile.id);
  const { data: aufgabe } = await service.from("aufgabe").insert({ titel: `Suchaufgabe ${lauf}`, notiz: "Rückruf beim Kunden", zustaendig_id: admin.id }).select("id").single();
  merken("aufgabe", aufgabe.id);
  const { data: termin } = await service.from("termin").insert({ titel: `Suchtermin ${lauf}`, art: "beratung", datum: heute, beginn: "10:00", ende: "11:00", ort: "Ausstellung" }).select("id").single();
  merken("termin", termin.id);

  b = await browser();
  await b.anmelden(admin);

  // 1. Suche: neue Bereiche mit Fundstelle
  await b.gehe("/");
  await b.tippe("[data-globale-suche]", lauf);
  for (const bereich of ["lieferant", "bestellung", "aufgabe", "termin"])
    pruefe(`Vorschläge: Bereich ${bereich}`, await b.warte(`!!document.querySelector("[data-such-vorschlaege] [data-treffer=${bereich}]")`));
  await foto("suche-neue-bereiche");
  await b.tippe("[data-globale-suche]", `Sonder${lauf}`);
  pruefe("Bestellung über die Position gefunden", await b.warte(`[...document.querySelectorAll("[data-such-vorschlaege] [data-treffer=bestellung]")].some((x) => x.getAttribute("href") === "/bestellungen/${best.id}" && x.querySelector("[data-fundstelle]")?.innerText.startsWith("Position"))`));
  await b.tippe("[data-globale-suche]", `Kontakt${lauf}`);
  pruefe("Lieferant über den Ansprechpartner gefunden", await b.warte(`[...document.querySelectorAll("[data-such-vorschlaege] [data-treffer=lieferant]")].some((x) => x.getAttribute("href") === "/lieferanten/${lief.id}" && x.querySelector("[data-fundstelle]")?.innerText.startsWith("Ansprechpartner"))`));
  await b.tippe("[data-globale-suche]", `Suchaufgabe ${lauf}`);
  await b.warte("!!document.querySelector('[data-such-vorschlaege] [data-treffer=aufgabe]')");
  await b.klick("[data-such-vorschlaege] [data-treffer=aufgabe]");
  pruefe("Aufgabe: Liste mit geöffnetem Dialog", await b.warte(`location.pathname === "/aufgaben" && [...document.querySelectorAll("[role=dialog]")].some((d) => d.innerText.includes("Aufgabe bearbeiten") && [...d.querySelectorAll("input")].some((i) => i.value === "Suchaufgabe ${lauf}"))`));
  await b.taste("Escape", "Escape", 27);
  pruefe("… nach dem Schließen ohne ?aufgabe", await b.warte("!location.search.includes('aufgabe=') && !document.querySelector('[role=dialog]')"));
  await b.tippe("[data-globale-suche]", `Suchtermin ${lauf}`);
  await b.warte("!!document.querySelector('[data-such-vorschlaege] [data-treffer=termin]')");
  pruefe("Termin: Datum und Zeit in den Details", await b.js(`document.querySelector("[data-such-vorschlaege] [data-treffer=termin]").innerText.includes("10:00–11:00")`));
  await b.klick("[data-such-vorschlaege] [data-treffer=termin]");
  pruefe("Termin: Tagesansicht mit geöffnetem Dialog", await b.warte(`location.pathname === "/kalender" && location.search.includes("ansicht=tag") && [...document.querySelectorAll("[role=dialog]")].some((d) => d.innerText.includes("Termin bearbeiten"))`));
  await b.taste("Escape", "Escape", 27);

  // 2. Zurück-Verlauf
  await b.gehe(`/auftraege/${auftrag.id}`);
  pruefe("Direkt geöffnet: fachlicher Pfad", await b.warte(`${pfadArt} === 'pfad' || !!${zurueckHref}`));
  await b.klick("aside[aria-label=Hauptnavigation] a[href='/auftraege']");
  pruefe("Seitenleiste: nur der Name der Maske", await b.warte(`location.pathname === '/auftraege' && ${pfadArt} === 'name' && !${zurueckHref}`));
  await b.klick("a[href*='phase=bestellung']");
  await b.warte("location.search.includes('phase=bestellung')");
  pruefe("Filter: weiterhin kein Zurück (dieselbe Maske)", await b.warte(`${pfadArt} === 'name'`));
  await b.klick(`a[href='/auftraege/${auftrag.id}']`);
  await b.warte(`location.pathname === "/auftraege/${auftrag.id}"`);
  pruefe("Auftrag: „← Aufträge“ mit Filter", await b.warte(`${zurueckHref} === '/auftraege?phase=bestellung'`), JSON.stringify(await zurueck()));
  await b.klickText("nav[aria-label=Bereiche] a", "Chat");
  await b.warte("location.search.includes('reiter=chat')");
  pruefe("Reiter: Zurück bleibt bei Aufträge", (await zurueck())?.href === "/auftraege?phase=bestellung");
  await b.klick(`h1 a[href='/kunden/${kunde.id}']`);
  await b.warte(`location.pathname === "/kunden/${kunde.id}"`);
  pruefe("Kunde aus dem Auftrag: „← <Auftrag>“, nicht die Kundenliste", await b.warte(`${zurueckHref} === "/auftraege/${auftrag.id}?reiter=chat"`), JSON.stringify(await zurueck()));
  pruefe("… mit Nummer und Kunde", ((await zurueck())?.text ?? "").includes(auftrag.nummer));
  await foto("zurueck-knopf");
  await b.klick("[data-zurueck]");
  pruefe("Zurück: Auftrag mit Reiter Chat", await b.warte(`location.pathname === "/auftraege/${auftrag.id}" && location.search === "?reiter=chat"`));
  pruefe("… dort wieder „← Aufträge“", await b.warte(`${zurueckHref} === '/auftraege?phase=bestellung'`));
  await b.klick("[data-zurueck]");
  pruefe("Zurück: Liste mit Filter von vorher", await b.warte("location.pathname === '/auftraege' && location.search === '?phase=bestellung'"));
  pruefe("… Verlauf am Anfang: nur der Name", await b.warte(`${pfadArt} === 'name'`));
  await b.klick(`a[href='/auftraege/${auftrag.id}']`);
  await b.warte(`location.pathname === "/auftraege/${auftrag.id}" && !!${zurueckHref}`);
  await b.js("history.back()");
  pruefe("Browser-Zurück verhält sich gleich", await b.warte(`location.pathname === '/auftraege' && ${pfadArt} === 'name'`));

  // 3. Darstellung
  await b.gehe("/einstellungen/darstellung");
  pruefe("Standard: hell", await b.warte("!!document.querySelector('[data-farbschema=hell][aria-checked=true]') && !document.documentElement.dataset.theme"));
  const hellCanvas = await var_("--canvas");
  await b.klick("[data-farbschema=dunkel]");
  pruefe("Dunkel sofort", await b.warte("document.documentElement.dataset.theme === 'dark'"));
  pruefe("… Flächen dunkel", (await var_("--canvas")) === "#1b1a18", `${hellCanvas} → ${await var_("--canvas")}`);
  pruefe("… Akzent Sawin-Sand bleibt", (await var_("--accent")) === "#d1b19a");
  pruefe("… gespeichert", !!(await (async () => { for (let i = 0; i < 40; i++) { const [r] = await dbAbfrage("select farbschema from public.benutzer_einstellung where benutzer_id = $1", [admin.id]); if (r?.farbschema === "dunkel") return true; await sleep(250); } return false; })()));
  await foto("darstellung-dunkel");
  await b.gehe("/auftraege");
  pruefe("Nach dem Neuladen dunkel (Skript im <head>)", await b.warte("document.documentElement.dataset.theme === 'dark'"));
  pruefe("Primär-Knopf lesbar (Text ≠ Fläche)", await b.js("(() => { const k = [...document.querySelectorAll('button, a')].find((x) => getComputedStyle(x).backgroundColor === 'rgb(255, 255, 255)'); if (!k) return true; return getComputedStyle(k).color !== 'rgb(255, 255, 255)'; })()"));
  await foto("auftraege-dunkel");

  await b.gehe("/einstellungen/darstellung");
  await b.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await b.klick("[data-farbschema=system]");
  pruefe("System (hell): kein Dunkel", await b.warte("!document.documentElement.dataset.theme"));
  await b.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  pruefe("System folgt dem Wechsel auf dunkel sofort", await b.warte("document.documentElement.dataset.theme === 'dark'"));
  await b.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await b.klick("[data-farbschema=hell]");
  await b.klick("[data-seitenleiste-wahl=hell]");
  pruefe("Helle Seitenleiste", await b.warte("document.documentElement.dataset.seitenleiste === 'hell'") && (await var_("--frame")) === "#efede8");
  await foto("seitenleiste-hell");
  await b.klick("[data-farbschema=dunkel]");
  pruefe("Im Dunkelmodus bleibt die Seitenleiste dunkel", await b.warte("document.documentElement.dataset.theme === 'dark'") && (await var_("--frame")) === "#121110");
  const [e] = await dbAbfrage("select farbschema, seitenleiste_hell from public.benutzer_einstellung where benutzer_id = $1", [admin.id]);
  pruefe("Gespeichert: dunkel, Seitenleiste hell (wirkt im hellen Schema)", e?.farbschema === "dunkel" && e.seitenleiste_hell === true, JSON.stringify(e));
  await b.klick("[data-farbschema=hell]");
  await b.klick("[data-seitenleiste-wahl=dunkel]");
  pruefe("Zurück auf hell", await b.warte("!document.documentElement.dataset.theme && !document.documentElement.dataset.seitenleiste"));
} catch (err) {
  pruefe("Ablauf ohne Fehler", false, err.stack ?? err.message);
} finally {
  b?.ende();
  await aufraeumen();
}
bilanz();
