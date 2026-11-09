"use client";

import { useEffect } from "react";

const SPEICHER = "app-letzte-aktivitaet";
const PING_ALLE_MS = 5 * 60_000;

/**
 * Automatische Abmeldung nach `minuten` ohne Eingabe, über alle offenen Tabs hinweg (gemeinsamer Zeitstempel).
 * Bei Aktivität meldet der Browser sich höchstens alle 5 Minuten beim Server, damit auch dessen Grenze
 * (proxy.ts) nicht abläuft, während jemand lange in einem Formular arbeitet.
 */
export function Inaktivitaet({ minuten }: { minuten: number }) {
  useEffect(() => {
    const grenze = minuten * 60_000;
    let letzterPing = Date.now();
    let letztesSchreiben = 0;

    const merken = () => {
      const jetzt = Date.now();
      if (jetzt - letztesSchreiben > 10_000) {
        letztesSchreiben = jetzt;
        try {
          localStorage.setItem(SPEICHER, String(jetzt));
        } catch {
          // ohne Speicher gilt der Zeitstempel dieses Tabs
        }
      }
      if (jetzt - letzterPing > PING_ALLE_MS) {
        letzterPing = jetzt;
        fetch("/auth/aktiv", { method: "POST", cache: "no-store" }).catch(() => {});
      }
    };
    let eigeneZeit = Date.now();
    const eingabe = () => {
      eigeneZeit = Date.now();
      merken();
    };

    eingabe();
    const ereignisse = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    ereignisse.forEach((e) => window.addEventListener(e, eingabe, { passive: true }));
    const timer = window.setInterval(() => {
      let zuletzt = eigeneZeit;
      try {
        zuletzt = Math.max(zuletzt, Number(localStorage.getItem(SPEICHER)) || 0);
      } catch {
        // siehe oben
      }
      // Voller Seitenaufruf des Route-Handlers: beendet die Sitzung und verwirft jeden Zustand im Browser
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (Date.now() - zuletzt > grenze) window.location.assign("/abmelden?grund=inaktiv");
    }, 30_000);

    return () => {
      ereignisse.forEach((e) => window.removeEventListener(e, eingabe));
      window.clearInterval(timer);
    };
  }, [minuten]);

  return null;
}
