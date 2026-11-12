import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Shell } from "@/components/app/shell";
import { PasswortAendernFormular } from "./formular";

export const metadata: Metadata = { title: "Passwort ändern" };

/** Passwort ändern (Benutzermenü unten in der Seitenleiste) */
export default function PasswortAendernSeite() {
  return (
    <Shell active="konto" crumbs={[{ label: "Konto" }, { label: "Passwort ändern" }]}>
      <PageHeader title="Passwort ändern" sub="Danach werden alle anderen Geräte und Browser abgemeldet." />
      <div className="max-w-xl">
        <PasswortAendernFormular />
      </div>
    </Shell>
  );
}
