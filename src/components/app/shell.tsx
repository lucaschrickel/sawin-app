import type { ReactNode } from "react";
import { getCustomer } from "@/customers";
import { AppShell } from "./app-shell";

/** Server-Hülle: holt das Kunden-Branding und rendert den App-Rahmen. */
export function Shell(props: { active: string; crumbs: { label: string; href?: string }[]; children: ReactNode }) {
  const c = getCustomer();
  const { Logo } = c;
  return (
    <AppShell
      {...props}
      brand={{ wordmark: c.brandWordmark, tagline: c.brandTagline, logo: <Logo className="w-full" /> }}
      // Platzhalter bis zur Anmeldung über Supabase Auth
      user={{ initials: "JS", name: "Jannis Sawin", role: "Admin" }}
    />
  );
}
