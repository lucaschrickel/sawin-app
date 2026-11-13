import type { Metadata } from "next";
import { connection } from "next/server";
// Schrift lokal gebündelt (kein Google-Fonts-CDN, DSGVO)
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import { getCustomer } from "@/customers";
import { DARSTELLUNG_SKRIPT } from "@/lib/darstellung";

const customer = getCustomer();

export const metadata: Metadata = {
  title: { default: customer.name, template: `%s · ${customer.name}` },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Jede Seite je Anfrage rendern: Die Content-Security-Policy trägt eine Nonce je Anfrage (src/lib/csp.ts), vorab
  // erzeugte Seiten hätten sie nicht
  await connection();
  return (
    // suppressHydrationWarning: das Skript im <head> setzt data-theme / data-seitenleiste vor dem ersten Zeichnen
    <html lang="de" data-customer={customer.id} className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DARSTELLUNG_SKRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
