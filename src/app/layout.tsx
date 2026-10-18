import type { Metadata } from "next";
// Schrift lokal gebündelt (kein Google-Fonts-CDN, DSGVO)
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import { getCustomer } from "@/customers";

const customer = getCustomer();

export const metadata: Metadata = {
  title: { default: customer.name, template: `%s · ${customer.name}` },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" data-customer={customer.id} className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
