"use client";

import { useEffect } from "react";
import { DARSTELLUNG_SPEICHER, istDunkel, type Darstellung } from "@/lib/darstellung";

/** Darstellung auf <html> anwenden und auf dem Gerät merken (für das Skript im <head> beim nächsten Laden) */
export function darstellungAnwenden(d: Darstellung) {
  const h = document.documentElement;
  const dunkel = istDunkel(d.farbschema, window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dunkel) h.setAttribute("data-theme", "dark");
  else h.removeAttribute("data-theme");
  if (d.seitenleisteHell) h.setAttribute("data-seitenleiste", "hell");
  else h.removeAttribute("data-seitenleiste");
  try {
    localStorage.setItem(DARSTELLUNG_SPEICHER, JSON.stringify(d));
  } catch {
    /* ohne localStorage nur ohne Gedächtnis */
  }
}

/**
 * Gleicht die Darstellung mit der Einstellung des Benutzers ab (Server) und folgt bei „Wie das System“ einem Wechsel
 * des Betriebssystems sofort. Rendert nichts.
 */
export function DarstellungAbgleich({ farbschema, seitenleisteHell }: Darstellung) {
  useEffect(() => {
    darstellungAnwenden({ farbschema, seitenleisteHell });
    if (farbschema !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const wechsel = () => darstellungAnwenden({ farbschema, seitenleisteHell });
    mq.addEventListener("change", wechsel);
    return () => mq.removeEventListener("change", wechsel);
  }, [farbschema, seitenleisteHell]);
  return null;
}
