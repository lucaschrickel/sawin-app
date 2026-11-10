import type { ReactNode } from "react";
import { getCustomer } from "@/customers";
import { INAKTIV_MINUTEN } from "@/lib/auth/konstanten";
import { pruefeSitzung } from "@/lib/auth/sitzung";
import { ladeZaehler } from "@/lib/zaehler";
import { AppShell } from "./app-shell";

const initialen = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Server-Hülle: prüft die Sitzung, holt Branding, Zähler und die gemerkte Seitenleiste und rendert den App-Rahmen. */
export async function Shell(props: { active: string; crumbs: { label: string; href?: string }[]; children: ReactNode }) {
  const { benutzer, supabase } = await pruefeSitzung();
  const c = getCustomer();
  const { Logo } = c;
  const [zaehler, { data: einstellung }] = await Promise.all([
    ladeZaehler(),
    supabase.from("benutzer_einstellung").select("seitenleiste_eingeklappt").eq("benutzer_id", benutzer.id).maybeSingle(),
  ]);
  return (
    <AppShell
      {...props}
      brand={{ wordmark: c.brandWordmark, tagline: c.brandTagline, logo: <Logo className="w-full" /> }}
      user={{ initials: initialen(benutzer.name), name: benutzer.name, role: `${benutzer.admin ? "Admin" : "Benutzer"} · Büro` }}
      zaehler={zaehler}
      eingeklappt={einstellung?.seitenleiste_eingeklappt ?? false}
      inaktivMinuten={INAKTIV_MINUTEN}
    />
  );
}
