import { cache, Suspense, type ReactNode } from "react";
import { getCustomer } from "@/customers";
import { INAKTIV_MINUTEN } from "@/lib/auth/konstanten";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeZaehler } from "@/lib/zaehler";
import { istFarbschema } from "@/lib/darstellung";
import { AppShell } from "./app-shell";
import { RahmenProvider, SeiteMelden, ZaehlerMelden } from "./rahmen-kontext";

/** Zähler einmal je Anfrage (Layout und Seite beim ersten Laden) */
const zaehlerLaden = cache(ladeZaehler);

const initialen = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/**
 * App-Rahmen im Layout von (app): prüft die Sitzung, holt Branding, Zähler und die gemerkte Seitenleiste. Bleibt beim
 * Seitenwechsel stehen (Seitenleiste und Kopfzeile); geladen wird nur der Inhalt (loading.tsx je Bereich).
 */
export async function Rahmen({ children }: { children: ReactNode }) {
  const { benutzer, supabase } = await pruefeSitzung();
  const c = getCustomer();
  const { Logo } = c;
  const [zaehler, { data: einstellung }] = await Promise.all([
    zaehlerLaden(),
    supabase.from("benutzer_einstellung").select("seitenleiste_eingeklappt, farbschema, seitenleiste_hell").eq("benutzer_id", benutzer.id).maybeSingle(),
  ]);
  return (
    <RahmenProvider zaehler={zaehler}>
      <AppShell
        brand={{ name: c.name, logo: <Logo className="block w-full" />, symbol: <Logo variante="symbol" className="block w-full" /> }}
        user={{ initials: initialen(benutzer.name), name: benutzer.name, role: `${benutzer.admin ? "Admin" : "Benutzer"} · Büro` }}
        eingeklappt={einstellung?.seitenleiste_eingeklappt ?? false}
        darstellung={{ farbschema: istFarbschema(einstellung?.farbschema) ? einstellung.farbschema : "hell", seitenleisteHell: einstellung?.seitenleiste_hell ?? false }}
        inaktivMinuten={INAKTIV_MINUTEN}
        lexware={!!process.env.LEXWARE_API_KEY?.trim()}
      >
        {children}
      </AppShell>
    </RahmenProvider>
  );
}

async function Zaehler() {
  return <ZaehlerMelden zaehler={await zaehlerLaden()} />;
}

/**
 * Je Seite: meldet Menüpunkt und fachlichen Pfad an den Rahmen und lädt die Zähler der Seitenleiste im Hintergrund
 * nach (blockiert den Inhalt nicht).
 */
export function Shell({ active, crumbs, children }: { active: string; crumbs: { label: string; href?: string }[]; children: ReactNode }) {
  return (
    <>
      <SeiteMelden active={active} crumbs={crumbs} />
      <Suspense fallback={null}>
        <Zaehler />
      </Suspense>
      {children}
    </>
  );
}
