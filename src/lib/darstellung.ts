/*
  Darstellung je Benutzer (CLAUDE.md „Einstellungen › Darstellung“, „Designsystem › Hell und Dunkel“): Farbschema Hell,
  Dunkel oder wie das System, Seitenleiste hell oder dunkel (im Dunkelmodus immer dunkel). Gespeichert in
  benutzer_einstellung; zusätzlich im localStorage des Geräts, damit das Skript im <head> die Seite ohne Aufflackern
  im richtigen Schema zeigt. Gesetzt wird data-theme="dark" bzw. data-seitenleiste="hell" auf <html>.
*/

export type Farbschema = "hell" | "dunkel" | "system";
export type Darstellung = { farbschema: Farbschema; seitenleisteHell: boolean };

export const FARBSCHEMA_TEXT: Record<Farbschema, string> = { hell: "Hell", dunkel: "Dunkel", system: "Wie das System" };
export const DARSTELLUNG_SPEICHER = "sawin-darstellung";
export const istFarbschema = (v: unknown): v is Farbschema => v === "hell" || v === "dunkel" || v === "system";

/** Dunkel anzeigen? (System: Einstellung des Betriebssystems) */
export const istDunkel = (f: Farbschema, systemDunkel: boolean) => f === "dunkel" || (f === "system" && systemDunkel);

/**
 * Skript für den <head> (vor dem ersten Zeichnen): liest die gemerkte Darstellung und setzt die Attribute auf <html>.
 * Bei einer künftigen CSP mit Nonce muss es die Nonce bekommen.
 */
export const DARSTELLUNG_SKRIPT = `(function(){try{var d=JSON.parse(localStorage.getItem("${DARSTELLUNG_SPEICHER}")||"{}"),h=document.documentElement,f=d.farbschema;if(f==="dunkel"||(f==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))h.setAttribute("data-theme","dark");if(d.seitenleisteHell)h.setAttribute("data-seitenleiste","hell")}catch(e){}})();`;
